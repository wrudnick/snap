import * as THREE from 'three'

import type { PhotoSnapshot, SubjectObservation } from '@/game/scoring/types'

import { activeSubjects, type SubjectInstance } from './registry'

/**
 * Turns the live 3D scene into a plain-data PhotoSnapshot.
 *
 * This is the seam of the whole design. Everything upstream is three.js;
 * everything downstream is arithmetic on numbers. Scoring never sees a Vector3.
 */

// Models face local -Z, matching three's camera convention.
const LOCAL_FORWARD = new THREE.Vector3(0, 0, -1)

// Scratch — the capture path allocates nothing per subject.
const _corner = new THREE.Vector3()
const _center = new THREE.Vector3()
const _forward = new THREE.Vector3()
const _toCamera = new THREE.Vector3()
const _camPos = new THREE.Vector3()
const _camDir = new THREE.Vector3()
const _rayDir = new THREE.Vector3()
const _quat = new THREE.Quaternion()
const _raycaster = new THREE.Raycaster()
/**
 * Only the nearest hit matters, and three-mesh-bvh can stop at it.
 *
 * The test is "is anything between the camera and this point", so a sorted list
 * of everything along the ray was work thrown away. With a bounds tree this
 * also lets the traversal prune whole branches once it has a hit.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(_raycaster as any).firstHitOnly = true

/** The 8 corners of a box, as unit offsets. */
const CORNERS: Array<[number, number, number]> = [
  [0, 0, 0],
  [1, 0, 0],
  [0, 1, 0],
  [1, 1, 0],
  [0, 0, 1],
  [1, 0, 1],
  [0, 1, 1],
  [1, 1, 1],
]

/**
 * Is `hit` part of `subject`'s own model? Used to tell "the ray reached the
 * subject" from "the ray hit a bus first".
 */
function belongsTo(hit: THREE.Object3D, root: THREE.Object3D): boolean {
  let o: THREE.Object3D | null = hit
  while (o) {
    if (o === root) return true
    o = o.parent
  }
  return false
}

/**
 * Fraction of sampled points on the subject that the camera can actually see.
 *
 * Raycast sampling rather than a GPU id-buffer: it runs once per shutter press
 * and needs no extra render pass.
 *
 * "A handful of subjects, so its cost is irrelevant" is what this used to say,
 * and it stopped being true: twenty subjects on a crowded street cost 1.6
 * seconds, all of it a linear walk over every triangle in the city, on the one
 * frame the player is trying to time. The rays are unchanged; what changed is
 * that the scene is indexed — see `prepareOccluders` — and the raycaster stops
 * at the first hit instead of sorting every one along the ray.
 */
function measureVisibility(
  subject: SubjectInstance,
  camera: THREE.Camera,
  occluders: THREE.Mesh[],
  /** Share of the frame the subject covers, for choosing how hard to look. */
  coverage: number,
): number {
  const box = subject.bounds
  const size = box.getSize(_corner.clone())
  let visible = 0
  let sampled = 0

  /**
   * How many points to test, by how much of the frame the subject fills.
   *
   * Nine samples describe the shape of a partial occlusion — a dog half behind
   * a bin scores differently from one fully in view — and that distinction is
   * worth paying for on something filling the frame. On a pigeon forty metres
   * away covering a few hundred pixels there is nothing to describe: it is
   * behind something or it is not, and eight extra rays buy a number no one can
   * see. Most subjects in a crowded street are the second kind.
   */
  const samples: THREE.Vector3[] = []
  samples.push(subject.object.localToWorld(box.getCenter(new THREE.Vector3())))
  if (coverage > 0.004) {
    // Corners pulled inward so they don't graze the surface and self-report as
    // occluded.
    for (const [cx, cy, cz] of CORNERS) {
      const local = new THREE.Vector3(
        box.min.x + size.x * (0.15 + cx * 0.7),
        box.min.y + size.y * (0.15 + cy * 0.7),
        box.min.z + size.z * (0.15 + cz * 0.7),
      )
      samples.push(subject.object.localToWorld(local))
    }
  }

  camera.getWorldPosition(_camPos)

  for (const point of samples) {
    sampled++
    const distance = _camPos.distanceTo(point)
    if (distance < 1e-4) {
      visible++
      continue
    }
    _rayDir.subVectors(point, _camPos).normalize()
    _raycaster.set(_camPos, _rayDir)
    _raycaster.far = distance + 0.05

    // Flat list, so this does not re-walk the scene graph on every ray.
    const hits = _raycaster.intersectObjects(occluders, false)
    const first = hits.find((h) => h.distance > 0.01)

    // Nothing in the way, or the first thing hit is the subject itself.
    if (!first || belongsTo(first.object, subject.object) || first.distance >= distance - 0.05) {
      visible++
    }
  }

  return sampled === 0 ? 0 : visible / sampled
}

/**
 * Every mesh that can block a line of sight, flattened once.
 *
 * `intersectObjects(roots, true)` walks the whole scene graph again for every
 * single ray. At nine rays a subject and a couple of thousand objects in the
 * scene, that was half a million pointless traversal steps per photograph
 * before a single triangle got tested. The graph does not change between the
 * rays of one shutter press, so it is walked once.
 *
 * `traverseVisible` rather than `traverse`: something switched off cannot
 * occlude anything, and skipping it here also skips its children.
 */
function flattenOccluders(roots: THREE.Object3D[]): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = []
  for (const root of roots) {
    root.traverseVisible((object) => {
      const mesh = object as THREE.Mesh
      if (mesh.isMesh) meshes.push(mesh)
    })
  }
  return meshes
}

/**
 * Project a subject's bounds into NDC.
 *
 * Corners behind the camera are dropped rather than projected — perspective
 * division flips their sign and would silently produce a bounding box spanning
 * the whole frame.
 */
function projectBounds(
  subject: SubjectInstance,
  camera: THREE.Camera,
): { bounds: SubjectObservation['bounds']; anyInFront: boolean } {
  const box = subject.bounds
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let anyInFront = false

  camera.getWorldPosition(_camPos)
  camera.getWorldDirection(_camDir)

  for (const [cx, cy, cz] of CORNERS) {
    _corner.set(
      cx ? box.max.x : box.min.x,
      cy ? box.max.y : box.min.y,
      cz ? box.max.z : box.min.z,
    )
    subject.object.localToWorld(_corner)

    // In front of the camera plane?
    if (_corner.clone().sub(_camPos).dot(_camDir) <= 0.001) continue
    anyInFront = true

    _corner.project(camera)
    minX = Math.min(minX, _corner.x)
    minY = Math.min(minY, _corner.y)
    maxX = Math.max(maxX, _corner.x)
    maxY = Math.max(maxY, _corner.y)
  }

  if (!anyInFront) {
    return { bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 }, anyInFront: false }
  }
  return { bounds: { minX, minY, maxX, maxY }, anyInFront: true }
}

export interface SnapshotOptions {
  photoId: string
  routeId: string
  t: number
  aspect: number
  camera: THREE.Camera
  /** Everything that can block line of sight — typically the whole scene. */
  occluders: THREE.Object3D[]
}

export function buildSnapshot(opts: SnapshotOptions): PhotoSnapshot {
  const { camera } = opts
  const occluders = flattenOccluders(opts.occluders)
  const subjects: SubjectObservation[] = []

  camera.getWorldPosition(_camPos)

  for (const subject of activeSubjects()) {
    if (!subject.object.visible) continue

    const { bounds, anyInFront } = projectBounds(subject, camera)
    if (!anyInFront) continue

    // Cheap frustum reject before paying for raycasts.
    if (bounds.maxX < -1 || bounds.minX > 1 || bounds.maxY < -1 || bounds.minY > 1) {
      continue
    }

    subject.object.getWorldPosition(_center)
    subject.object.getWorldQuaternion(_quat)
    _forward.copy(LOCAL_FORWARD).applyQuaternion(_quat).normalize()
    _toCamera.subVectors(_camPos, _center).normalize()

    const centerNdc = _center.clone().project(camera)
    const pose = subject.readPose()

    subjects.push({
      subjectId: subject.id,
      species: subject.species,
      centroid: { x: centerNdc.x, y: centerNdc.y },
      bounds,
      facing: _forward.dot(_toCamera),
      clip: pose.clip,
      clipTime: pose.time,
      visibility: measureVisibility(
        subject,
        camera,
        occluders,
        // NDC spans −1…1 on both axes, so the full frame is an area of four.
        ((bounds.maxX - bounds.minX) * (bounds.maxY - bounds.minY)) / 4,
      ),
      distance: _camPos.distanceTo(_center),
    })
  }

  return {
    photoId: opts.photoId,
    routeId: opts.routeId,
    t: opts.t,
    aspect: opts.aspect,
    subjects,
  }
}

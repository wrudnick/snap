import * as THREE from 'three'

import { LANDMARK_BUILDINGS } from '@/content/models/landmarkBuildings'
import { LANDMARK_SILHOUETTES } from '@/content/models/landmarkScene'
import { siteById } from '@/content/models/landmarkSites'
import { area, clipToBox, convexHull, type Point } from '@/lib/polygon'
import type { StructureObservation } from '@/game/scoring/types'

import { clearFraction } from './occlusion'

/**
 * The buildings in a photograph, measured.
 *
 * Everything here comes from outlines taken at load from the real built
 * geometry — spires and antennas included — rather than from footprints, which
 * would report the whole building in frame while its spire was out of shot.
 *
 * Nothing walks the scene graph: the landmarks are merged by material for
 * rendering and have no per-building object to interrogate. They do not need
 * one.
 */

const FRAME_MIN: Point = [-1, -1]
const FRAME_MAX: Point = [1, 1]

/** Beyond this a building is skyline rather than a subject. */
const MAX_DISTANCE = 900

const _point = new THREE.Vector3()
const _camPos = new THREE.Vector3()
const _toCamera = new THREE.Vector3()

export interface StructureOptions {
  camera: THREE.PerspectiveCamera
  /** Camera pitch in radians, for the keystone rule. */
  pitch: number
  /** Quality of the light, 0..1, from the section's profile. */
  light: number
  occluders: THREE.Mesh[]
}

export function observeStructures(opts: StructureOptions): StructureObservation[] {
  const { camera, occluders } = opts
  camera.getWorldPosition(_camPos)
  camera.updateMatrixWorld()

  const observations: StructureObservation[] = []
  const halfFov = (camera.fov * Math.PI) / 360
  const tanHalf = Math.tan(halfFov)

  for (const [id, outline] of LANDMARK_SILHOUETTES) {
    const entry = LANDMARK_BUILDINGS[id]
    if (!entry) continue

    const centre = outline.box.getCenter(_point)
    const distance = _camPos.distanceTo(centre)
    if (distance > MAX_DISTANCE) continue

    /**
     * Project the outline, and refuse to guess when part of it is behind you.
     *
     * Perspective division flips the sign of anything behind the camera, so a
     * single such point turns a building at the edge of vision into a polygon
     * spanning the frame. A building you are standing inside the footprint of is
     * not a photograph of that building.
     */
    const projected: Point[] = []
    let behind = 0
    for (let i = 0; i < outline.points.length; i += 3) {
      _point.set(outline.points[i]!, outline.points[i + 1]!, outline.points[i + 2]!)
      _toCamera.copy(_point).project(camera)
      if (_toCamera.z > 1) {
        behind++
        continue
      }
      projected.push([_toCamera.x, _toCamera.y])
    }
    if (behind > 0 || projected.length < 3) continue

    const hull = convexHull(projected)
    const total = area(hull)
    if (total <= 0) continue

    const clipped = clipToBox(hull, FRAME_MIN, FRAME_MAX)
    const inside = area(clipped)
    // Nothing of it in shot at all.
    if (inside <= 0) continue

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const [x, y] of hull) {
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }

    /**
     * Angular height, taken through the projection rather than from the NDC
     * extent directly.
     *
     * NDC is a tangent, not an angle: treating the vertical extent as
     * proportional to the field of view overstates anything near the top or
     * bottom of the frame, which is precisely where a tall building sits when
     * you have tilted up at it — the case the keystone rule exists to measure.
     */
    const angularHeight =
      Math.atan(Math.min(maxY, 4) * tanHalf) - Math.atan(Math.max(minY, -4) * tanHalf)

    observations.push({
      structureId: String(id),
      name: entry.name,
      rarity: entry.rarity ?? 1,
      bounds: { minX, minY, maxX, maxY },
      // NDC spans −1..1 on both axes, so the whole frame is an area of four.
      fill: total / 4,
      inFrame: inside / total,
      visibility: clearFraction(_camPos, samplePoints(outline.points, _camPos), occluders),
      pitch: opts.pitch,
      angularHeight: Math.max(0, angularHeight),
      faceAngle: faceAngleOf(id, _camPos),
      light: opts.light,
      distance,
    })
  }

  return observations
}

/**
 * A handful of points to fire rays at, nudged clear of the surface.
 *
 * The first version pulled the outline's corners a quarter of the way toward
 * the building's centre, to stop a ray grazing tangentially along a corner. It
 * put every sample *inside the solid*, so each ray struck the building's own
 * wall before reaching its target and — with no identity to forgive it, since
 * the landmarks are merged — every building on the street reported itself
 * fully occluded. Measured: 0% clear on a clear street.
 *
 * Nudging toward the camera instead puts the sample a hand's breadth outside
 * the surface, so anything the ray meets first is genuinely in the way.
 */
function samplePoints(points: Float32Array, camera: THREE.Vector3): THREE.Vector3[] {
  const count = points.length / 3
  if (count === 0) return []

  const centre = new THREE.Vector3()
  for (let i = 0; i < points.length; i += 3) {
    centre.x += points[i]! / count
    centre.y += points[i + 1]! / count
    centre.z += points[i + 2]! / count
  }

  const nudge = new THREE.Vector3()
  const out: THREE.Vector3[] = []
  const take = (x: number, y: number, z: number) => {
    const p = new THREE.Vector3(x, y, z)
    nudge.subVectors(camera, p).normalize().multiplyScalar(0.4)
    out.push(p.add(nudge))
  }

  /**
   * Only the side you can see.
   *
   * The outline wraps the whole building, so half its corners are round the
   * back — and a ray to the back of a building is blocked by its own front,
   * correctly and uselessly. Sampling all of them capped every building at
   * roughly half clear no matter how plainly visible it was. Keeping the
   * corners on the camera's side asks the question actually being asked: is
   * anything between you and the face you are photographing.
   */
  const front: Array<[number, number, number]> = []
  for (let i = 0; i < count; i++) {
    const x = points[i * 3]!
    const y = points[i * 3 + 1]!
    const z = points[i * 3 + 2]!
    const facing =
      (x - centre.x) * (camera.x - centre.x) + (z - centre.z) * (camera.z - centre.z)
    if (facing > 0) front.push([x, y, z])
  }

  // The centre of the visible face, rather than of the solid.
  if (front.length === 0) {
    take(centre.x, centre.y, centre.z)
    return out
  }
  let fx = 0
  let fy = 0
  let fz = 0
  for (const [x, y, z] of front) {
    fx += x / front.length
    fy += y / front.length
    fz += z / front.length
  }
  take(fx, fy, fz)

  const step = Math.max(1, Math.floor(front.length / 8))
  for (let i = 0; i < front.length; i += step) {
    const [x, y, z] = front[i]!
    take(x, y, z)
  }
  return out
}

/**
 * The angle to the facade you are most square-on to.
 *
 * Taken from the real footprint rather than the outline, because a wall is a
 * wall in plan and the support points do not know which of them belong to the
 * same face. The best-facing edge is the one the photograph is *of*.
 */
function faceAngleOf(id: number, camera: THREE.Vector3): number {
  const site = siteById(id)
  if (!site || site.ring.length < 2) return Math.PI / 4

  let best = -Infinity
  const ring = site.ring
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, az] = ring[j]!
    const [bx, bz] = ring[i]!
    const dx = bx - ax
    const dz = bz - az
    const length = Math.hypot(dx, dz)
    if (length < 0.5) continue

    // Outward normal of a clockwise ring in this world's ground plane.
    const nx = dz / length
    const nz = -dx / length
    const mx = (ax + bx) / 2
    const mz = (az + bz) / 2
    const tx = camera.x - mx
    const tz = camera.z - mz
    const toCamera = Math.hypot(tx, tz) || 1
    const facing = (nx * tx + nz * tz) / toCamera
    if (facing > best) best = facing
  }

  if (best === -Infinity) return Math.PI / 4
  return Math.acos(Math.min(1, Math.max(0, best)))
}

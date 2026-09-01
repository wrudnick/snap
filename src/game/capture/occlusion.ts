import * as THREE from 'three'

/**
 * Was anything in the way?
 *
 * Shared by actors and buildings, which ask the same question for different
 * reasons and must not answer it two different ways.
 *
 * Note what it does *not* need: to know what it hit. Comparing the hit's
 * distance against the distance to the sample point is enough — if the first
 * thing along the ray is at the point, the point is the first thing. That
 * matters because the landmarks are merged by material for rendering, so a hit
 * comes back as one shared mesh with no way to ask which building it was.
 */

const raycaster = new THREE.Raycaster()
/**
 * Only the nearest hit matters, and three-mesh-bvh can stop at it.
 *
 * The question is "is anything between the camera and this point", so a sorted
 * list of everything along the ray was work thrown away. With a bounds tree
 * this also lets the traversal prune whole branches once it has a hit.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(raycaster as any).firstHitOnly = true

const _direction = new THREE.Vector3()

/**
 * Every mesh that can block a line of sight, flattened once.
 *
 * `intersectObjects(roots, true)` walks the whole scene graph again for every
 * single ray. At nine rays a subject and a couple of thousand objects in the
 * scene, that was half a million pointless traversal steps per photograph
 * before a triangle got tested. The graph does not change between the rays of
 * one shutter press, so it is walked once.
 *
 * `traverseVisible` rather than `traverse`: something switched off cannot
 * occlude anything, and skipping it here also skips its children.
 */
export function flattenOccluders(roots: THREE.Object3D[]): THREE.Mesh[] {
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
 * Share of `points` with a clear line of sight from `from`, 0..1.
 *
 * `allow` lets a caller forgive hits on the subject itself, which an actor
 * needs because its own body is between the camera and its far side. A building
 * cannot use it — merged geometry has no identity — and does not need to, since
 * a hit at the sample point's own distance is the building.
 */
export function clearFraction(
  from: THREE.Vector3,
  points: THREE.Vector3[],
  occluders: THREE.Mesh[],
  allow?: (hit: THREE.Object3D) => boolean,
): number {
  if (points.length === 0) return 0
  let clear = 0

  for (const point of points) {
    const distance = from.distanceTo(point)
    if (distance < 1e-4) {
      clear++
      continue
    }
    _direction.subVectors(point, from).normalize()
    raycaster.set(from, _direction)
    raycaster.far = distance + 0.05

    // Flat list, so this does not re-walk the scene graph on every ray.
    const hits = raycaster.intersectObjects(occluders, false)
    const first = hits.find((h) => h.distance > 0.01)

    if (!first || first.distance >= distance - 0.05 || (allow && allow(first.object))) {
      clear++
    }
  }

  return clear / points.length
}

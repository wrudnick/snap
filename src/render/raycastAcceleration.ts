import * as THREE from 'three'
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh'

/**
 * Bounded-hierarchy raycasting, for the occlusion test behind the shutter.
 *
 * Every shutter press fires nine rays per subject in frame and asks what is in
 * the way. Unaccelerated, each of those rays is a linear walk over every
 * triangle in the scene, and this scene is several hundred thousand triangles
 * of extruded city. Measured on a crowded street it cost 1.6 seconds for twenty
 * subjects, scaling flat at about eighty milliseconds each — a freeze on the
 * exact frame the player is trying to time.
 *
 * The plan deferred this with "only if occlusion raycasts grow past a handful
 * of subjects". They did.
 *
 * The tree is built once per geometry and lives on it. Nothing here is
 * per-frame: the geometry it indexes is the static city, which never moves.
 */

let patched = false

function patchOnce(): void {
  if (patched) return
  patched = true
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proto = THREE.BufferGeometry.prototype as any
  proto.computeBoundsTree = computeBoundsTree
  proto.disposeBoundsTree = disposeBoundsTree
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(THREE.Mesh.prototype as any).raycast = acceleratedRaycast
}

/**
 * Give everything under `root` a bounds tree, once.
 *
 * Skips geometry small enough that the tree would cost more to walk than the
 * triangles would to test, and skips anything already indexed — this is called
 * on scene setup and is safe to call again.
 *
 * `InstancedMesh` is left alone deliberately. three.js gives it its own
 * `raycast` that loops instances, so the patched `Mesh.raycast` never runs for
 * it, and the instanced props here are a few dozen triangles apiece.
 */
export function prepareOccluders(root: THREE.Object3D): number {
  patchOnce()
  let built = 0
  root.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh) return
    const geometry = mesh.geometry
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const any = geometry as any
    if (!geometry || any.boundsTree) return
    const triangles = (geometry.index?.count ?? geometry.attributes.position?.count ?? 0) / 3
    if (triangles < 400) return
    any.computeBoundsTree()
    built += 1
  })
  return built
}

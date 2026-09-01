import * as THREE from 'three'

/**
 * A cheap stand-in for a building's outline, taken from its real geometry.
 *
 * Scoring a building needs to know what shape it makes against the sky, and the
 * obvious two ways of getting that are both wrong here.
 *
 * Extruding the footprint is wrong because it is not the building: the Hancock
 * tapers and carries two antennas, the Palmolive steps back, Quigley has a
 * flèche. A prism would report the whole building in frame while the spire was
 * out of shot — and Fit gates every other term, so it would be confidently
 * wrong about the landmarks people most want to photograph.
 *
 * Keeping every vertex is wrong because there are tens of thousands of them and
 * they would have to be projected on every shutter press.
 *
 * So: support points. For each of a small set of directions, keep the vertex
 * furthest along it. Every point kept is a genuine corner of the convex hull,
 * spires and antennas included, because being extreme in some direction is what
 * makes a point a corner. Linear in the vertex count with a small constant, and
 * it leaves a few dozen points to project rather than thousands.
 *
 * Convex, so it over-claims on an L-shaped plan. That errs the right way for
 * Fit — if the hull is inside the frame the building certainly is — and only
 * mildly overstates Fill.
 */

/** Directions to take extremes along: a ring of horizontals, plus up and down. */
const DIRECTIONS: THREE.Vector3[] = (() => {
  const out: THREE.Vector3[] = []
  const RING = 12
  // Three elevations, so a taper is caught as well as a plan.
  for (const y of [-0.35, 0.15, 0.75]) {
    for (let i = 0; i < RING; i++) {
      const a = (i / RING) * Math.PI * 2
      out.push(new THREE.Vector3(Math.cos(a), y, Math.sin(a)).normalize())
    }
  }
  out.push(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0))
  return out
})()

export interface Silhouette {
  /** Support points in world space, flattened xyz. */
  points: Float32Array
  /** Bounding box, world space — used for a cheap reject before projecting. */
  box: THREE.Box3
  /** Height above grade, for the angular-height half of the keystone rule. */
  height: number
}

/**
 * Take the support points of everything under `root`, in world space.
 *
 * Called at load, before the landmarks are merged for rendering — which is the
 * whole point. Rendering wants one mesh per material for the entire city;
 * scoring wants to know which building is which. Those are different questions
 * and only the first one needs a draw call.
 */
export function silhouetteOf(root: THREE.Object3D): Silhouette | null {
  root.updateWorldMatrix(true, true)

  const best = DIRECTIONS.map(() => ({ dot: -Infinity, x: 0, y: 0, z: 0 }))
  const box = new THREE.Box3()
  const v = new THREE.Vector3()
  let seen = 0

  root.traverse((object) => {
    const mesh = object as THREE.Mesh
    const position = mesh.isMesh ? mesh.geometry?.attributes.position : null
    if (!position) return
    mesh.updateWorldMatrix(true, false)

    for (let i = 0; i < position.count; i++) {
      v.fromBufferAttribute(position as THREE.BufferAttribute, i).applyMatrix4(mesh.matrixWorld)
      box.expandByPoint(v)
      seen++
      for (let d = 0; d < DIRECTIONS.length; d++) {
        const dir = DIRECTIONS[d]!
        const dot = v.x * dir.x + v.y * dir.y + v.z * dir.z
        const slot = best[d]!
        if (dot > slot.dot) {
          slot.dot = dot
          slot.x = v.x
          slot.y = v.y
          slot.z = v.z
        }
      }
    }
  })

  if (seen === 0) return null

  // Duplicates are common — a squat building has the same corner extreme in
  // several directions — and projecting the same point twice is wasted work.
  const unique = new Map<string, [number, number, number]>()
  for (const s of best) {
    if (s.dot === -Infinity) continue
    unique.set(`${s.x.toFixed(2)},${s.y.toFixed(2)},${s.z.toFixed(2)}`, [s.x, s.y, s.z])
  }

  const points = new Float32Array(unique.size * 3)
  let i = 0
  for (const [x, y, z] of unique.values()) {
    points[i++] = x
    points[i++] = y
    points[i++] = z
  }

  return { points, box, height: box.max.y - box.min.y }
}

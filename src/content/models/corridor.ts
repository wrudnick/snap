import * as THREE from 'three'

import type { Rail } from '@/game/rail'
import type { ResolvedSection } from '@/game/sections'

import { laneProfile } from './environment'
import { curveLimits } from './ribbon'

/**
 * The route, sampled as a corridor.
 *
 * Answers two questions, and they have to agree with each other or the world
 * comes apart:
 *
 *  1. **Which ground is already paved?** The route ribbon covers its own
 *     surface. The city ground has to stop where the ribbon starts, or the two
 *     z-fight along the entire route.
 *
 *  2. **Does the route walk through a building?** OSM footprints are the real
 *     Chicago and the route is drawn over them by hand, so nothing guarantees
 *     the two agree.
 *
 * The second is deliberately a *test*, not a runtime filter. Culling footprints
 * that the route touches was the first attempt and it is a trap: at any
 * clearance wide enough to be worth having it started deleting 900 North
 * Michigan, the Drake and the Thompson — buildings the route merely walks close
 * to, whose absence leaves holes on the Magnificent Mile far worse than the
 * near-miss. And a route that ends up *inside* a restaurant on purpose is
 * indistinguishable, from the outside, from one that has gone wrong.
 *
 * So the route gets fixed instead, and this holds it fixed.
 */

export interface CorridorSample {
  x: number
  z: number
  /** Unit vector pointing right of travel, in the XZ plane. */
  rx: number
  rz: number
  /** Ribbon extent either side, in metres. Negative offsets are left. */
  left: number
  right: number
  /**
   * Whether the route is meant to be inside a building here. The last section
   * walks in through a kitchen door, so containment there is the point.
   */
  indoors: boolean
}

/** Metres between samples. Also the longitudinal tolerance of every test. */
const STEP = 3

/**
 * Fraction of the ribbon's width the corridor claims.
 *
 * Deliberately less than all of it. Claiming too little leaves a sliver of city
 * ground under the edge of the route ribbon, which is invisible because the
 * ribbon sits above it; claiming too much leaves a hole with the sky showing
 * through. The two failure modes are not remotely equal, so this errs small.
 */
const CLAIM = 0.9

export function buildCorridor(rail: Rail, sections: ResolvedSection[]): CorridorSample[] {
  const steps = Math.max(2, Math.ceil(rail.length / STEP))

  const centres: THREE.Vector3[] = []
  const rights: THREE.Vector3[] = []
  for (let i = 0; i <= steps; i++) {
    const p = new THREE.Vector3()
    const r = new THREE.Vector3()
    rail.positionAt(i / steps, p)
    rail.rightAt(i / steps, r)
    centres.push(p)
    rights.push(r)
  }

  // The same limits the ribbon itself is built with. Without this the corridor
  // claims the profile's full width while the ribbon has been pinched in to
  // avoid folding — and the city ground is cut away from under a surface that
  // is no longer there. At the Triangle, where the route loops back on itself
  // inside seven metres, that opened a hole with the sky visible through it.
  const limits = curveLimits(
    centres.map((c, i) => ({ x: c.x, z: c.z, rx: rights[i]!.x, rz: rights[i]!.z })),
  )

  const samples: CorridorSample[] = []

  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const section = sectionFor(sections, t)
    const lanes = laneProfile(section.kind)
    const shift = section.ribbonShift ?? 0

    const leftEdge = Math.min(-((lanes[0]?.offset ?? 0) + shift), limits.left[i] ?? Infinity)
    const rightEdge = Math.min(
      (lanes[lanes.length - 1]?.offset ?? 0) + shift,
      limits.right[i] ?? Infinity,
    )

    samples.push({
      x: centres[i]!.x,
      z: centres[i]!.z,
      rx: rights[i]!.x,
      rz: rights[i]!.z,
      left: leftEdge * CLAIM,
      right: rightEdge * CLAIM,
      indoors: section.kind === 'interior',
    })
  }

  return samples
}

function sectionFor(sections: ResolvedSection[], t: number): ResolvedSection {
  for (const s of sections) if (t >= s.tStart && t < s.tEnd) return s
  return sections[sections.length - 1]!
}

/**
 * Is this point on ground the route ribbon already paves?
 *
 * Longitudinal tolerance is one sample step, which is why STEP has to stay
 * small — at coarse sampling this leaves unpaved rings between samples.
 */
export function insideRibbon(x: number, z: number, corridor: CorridorSample[]): boolean {
  for (const s of corridor) {
    const dx = x - s.x
    const dz = z - s.z
    const lateral = dx * s.rx + dz * s.rz
    if (lateral < -s.left || lateral > s.right) continue
    // Distance along the path, taken as the component perpendicular to `right`.
    const along = Math.abs(dx * -s.rz + dz * s.rx)
    if (along <= STEP) return true
  }
  return false
}

/** Ray-cast point-in-polygon, on the XZ plane. */
function contains(ring: Array<[number, number]>, x: number, z: number): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i]!
    const [xj, zj] = ring[j]!
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}

/**
 * Does the player walk through this footprint?
 *
 * Containment of the path itself, which is exactly the defect that shows on
 * screen: the camera rides the spline, so a footprint containing the spline is
 * a wall the camera passes through. Proximity is not a defect — a route that
 * runs a metre from a shopfront is a route down a street.
 *
 * Indoor samples are excluded, or this would flag the restaurant the route is
 * supposed to finish inside.
 */
export function routeEnters(
  ring: Array<[number, number]>,
  corridor: CorridorSample[],
): boolean {
  for (const s of corridor) {
    if (s.indoors) continue
    if (contains(ring, s.x, s.z)) return true
  }
  return false
}

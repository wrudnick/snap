import * as THREE from 'three'

import type { Rail } from '@/game/rail'
import type { ResolvedSection } from '@/game/sections'

/**
 * The route, sampled — for one question: does the player walk through a wall?
 *
 * OSM footprints are the real Chicago and the route is drawn over them by hand,
 * so nothing makes the two agree. This is deliberately a *test* rather than a
 * runtime filter. Culling whichever footprints the route touches was the first
 * attempt and it is a trap: at any clearance wide enough to be worth having it
 * deleted 900 North Michigan, the Drake and the Thompson — buildings the route
 * merely walks close to, whose absence leaves holes on the Magnificent Mile far
 * worse than the near-miss it was fixing. And a route that ends up inside a
 * restaurant on purpose is indistinguishable, from the outside, from one that
 * has gone wrong.
 *
 * So the route gets fixed and this holds it fixed.
 *
 * It used to answer a second question — which ground the route ribbon had
 * already paved — back when the ground was extruded along the rail. It isn't
 * any more: streets pave themselves from OSM and everything else is a polygon
 * fixed in the world, so what is paved has nothing to do with where the camera
 * goes.
 */

export interface CorridorSample {
  x: number
  z: number
  /** Unit vector pointing right of travel, in the XZ plane. */
  rx: number
  rz: number
  /**
   * Whether the route is meant to be inside a building here. The last section
   * walks in through a kitchen door, so containment there is the point.
   */
  indoors: boolean
}

/** Metres between samples. */
const STEP = 3

export function buildCorridor(rail: Rail, sections: ResolvedSection[]): CorridorSample[] {
  const steps = Math.max(2, Math.ceil(rail.length / STEP))
  const samples: CorridorSample[] = []

  const point = new THREE.Vector3()
  const right = new THREE.Vector3()

  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    rail.positionAt(t, point)
    rail.rightAt(t, right)
    samples.push({
      x: point.x,
      z: point.z,
      rx: right.x,
      rz: right.z,
      indoors: sectionFor(sections, t).kind === 'interior',
    })
  }

  return samples
}

function sectionFor(sections: ResolvedSection[], t: number): ResolvedSection {
  for (const s of sections) if (t >= s.tStart && t < s.tEnd) return s
  return sections[sections.length - 1]!
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

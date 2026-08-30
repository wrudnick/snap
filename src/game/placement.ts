import * as THREE from 'three'

import { groundHeightAt } from '@/content/models/groundHeight'
import { EYE_HEIGHT, type SubjectPlacement } from '@/content/routes/types'
import type { Rail } from '@/game/rail'
import type { ResolvedSection } from '@/game/sections'

/**
 * Resolve route-relative placements into world positions.
 *
 * Done once at load: `at` is authored against the rail, so a subject sits beside
 * the path no matter how the path is later refitted.
 */
// Shared with the underpass floor and the prop placer — see EYE_HEIGHT.

/**
 * Section-relative anchors resolved against the route's actual section spans.
 *
 * An unknown section id would silently drop the subject at t=0, on the beach,
 * which is the kind of thing nobody notices for a month — so it throws.
 */
function anchorT(at: NonNullable<SubjectPlacement['at']>, sections: ResolvedSection[]): number {
  if ('t' in at) return at.t
  const section = sections.find((s) => s.id === at.section)
  if (!section) {
    throw new Error(`Subject anchored to unknown section "${at.section}"`)
  }
  return section.tStart + at.u * (section.tEnd - section.tStart)
}

export function resolvePlacements(
  rail: Rail,
  sections: ResolvedSection[],
  placements: SubjectPlacement[],
): SubjectPlacement[] {
  const point = new THREE.Vector3()
  const right = new THREE.Vector3()

  return placements.map((p) => {
    if (!p.at) return p
    const t = anchorT(p.at, sections)
    rail.positionAt(t, point)
    rail.rightAt(t, right)

    // `offset` is metres left of travel, so subtract the right-hand normal.
    const x = point.x - right.x * p.at.offset
    const z = point.z - right.z * p.at.offset

    /**
     * The ground under the subject, not under the route.
     *
     * This used to be `point.y - EYE_HEIGHT` — the rail's own height at the
     * anchor — which is right only where the street is level with the path. A
     * car parked out in Michigan Avenue while the route was still climbing out
     * of the underpass took the route's height and hung a metre above the road.
     * The rail's height is now only the hint that says which surface is meant,
     * so a subject in the tunnel still lands on the tunnel floor rather than on
     * the deck overhead.
     */
    const ground = groundHeightAt(x, z, point.y - EYE_HEIGHT)

    return {
      ...p,
      rotationY: p.alignToRoute
        ? (p.rotationY ?? 0) + rail.headingAt(t)
        : p.rotationY,
      position: [x, ground + (p.at.y ?? 0), z] as [number, number, number],
    }
  })
}

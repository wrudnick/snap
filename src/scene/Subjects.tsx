import { useMemo } from 'react'
import * as THREE from 'three'

import { groundHeightAt } from '@/content/models/groundHeight'

import type { RouteDef, SubjectPlacement } from '@/content/routes/types'
import { type Rail, segmentActive } from '@/game/rail'
import type { ResolvedSection } from '@/game/sections'

import { SubjectView } from './Subject'
import { useActiveSegment } from './useActiveSegment'

/**
 * Assign each placement to the rail segment it sits nearest.
 *
 * Done against the actual spline rather than a linear z mapping, so it stays
 * correct on routes that double back or turn corners.
 */
function assignSegments(
  rail: Rail,
  placements: SubjectPlacement[],
  samples = 240,
): Array<{ placement: SubjectPlacement; segment: number }> {
  const points = rail.samplePoints(samples)
  const v = new THREE.Vector3()

  return placements.map((placement) => {
    v.set(...(placement.position ?? [0, 0, 0]))
    let bestIndex = 0
    let bestDistance = Infinity

    for (let i = 0; i < points.length; i++) {
      const d = points[i]!.distanceToSquared(v)
      if (d < bestDistance) {
        bestDistance = d
        bestIndex = i
      }
    }

    return { placement, segment: rail.segmentAt(bestIndex / (samples - 1)) }
  })
}

/**
 * Resolve route-relative placements into world positions.
 *
 * Done once at load: `at` is authored against the rail, so a subject sits beside
 * the path no matter how the path is later refitted.
 */
/** Route waypoints are authored at eye height; ground sits this far below. */
const EYE_HEIGHT = 1.7

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

function resolvePlacements(
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

export function Subjects({
  route,
  rail,
  sections,
}: {
  route: RouteDef
  rail: Rail
  sections: ResolvedSection[]
}) {
  const resolved = useMemo(
    () => resolvePlacements(rail, sections, route.subjects),
    [rail, sections, route.subjects],
  )
  const placed = useMemo(() => assignSegments(rail, resolved), [rail, resolved])
  const segment = useActiveSegment()

  // Subjects outside the window unmount, which also unregisters them from the
  // capture registry — so they can't be photographed from three blocks away.
  const window = route.activeWindows?.subjects ?? route.activeWindow
  const active = placed.filter((p) => segmentActive(p.segment, segment, window))

  return (
    <group>
      {active.map(({ placement }) => (
        <SubjectView key={placement.id} placement={placement} />
      ))}
    </group>
  )
}

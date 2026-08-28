import { useMemo } from 'react'
import * as THREE from 'three'

import type { RouteDef, SubjectPlacement } from '@/content/routes/types'
import { type Rail, segmentActive } from '@/game/rail'

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

function resolvePlacements(rail: Rail, placements: SubjectPlacement[]): SubjectPlacement[] {
  const point = new THREE.Vector3()
  const right = new THREE.Vector3()

  return placements.map((p) => {
    if (!p.at) return p
    rail.positionAt(p.at.t, point)
    rail.rightAt(p.at.t, right)

    // Ground follows the rail, which dips 2.8 m below grade in the underpass and
    // climbs back. Defaulting `y` to 0 leaves subjects floating there — so the
    // default is the ground *under this point of the route*, and an explicit `y`
    // is a lift above it rather than an absolute height.
    const ground = point.y - EYE_HEIGHT

    // `offset` is metres left of travel, so subtract the right-hand normal.
    return {
      ...p,
      position: [
        point.x - right.x * p.at.offset,
        ground + (p.at.y ?? 0),
        point.z - right.z * p.at.offset,
      ] as [number, number, number],
    }
  })
}

export function Subjects({ route, rail }: { route: RouteDef; rail: Rail }) {
  const resolved = useMemo(
    () => resolvePlacements(rail, route.subjects),
    [rail, route.subjects],
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

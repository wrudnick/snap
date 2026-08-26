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
    v.set(...placement.position)
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

export function Subjects({ route, rail }: { route: RouteDef; rail: Rail }) {
  const placed = useMemo(() => assignSegments(rail, route.subjects), [rail, route.subjects])
  const segment = useActiveSegment()

  // Subjects outside the window unmount, which also unregisters them from the
  // capture registry — so they can't be photographed from three blocks away.
  const active = placed.filter((p) => segmentActive(p.segment, segment, route.activeWindow))

  return (
    <group>
      {active.map(({ placement }) => (
        <SubjectView key={placement.id} placement={placement} />
      ))}
    </group>
  )
}

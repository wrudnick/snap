import { useMemo } from 'react'
import * as THREE from 'three'

import type { RouteDef, SubjectPlacement } from '@/content/routes/types'
import { resolvePlacements } from '@/game/placement'
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

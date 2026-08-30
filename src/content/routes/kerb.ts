import * as THREE from 'three'

import { buildingAt, lateralClearance, nearestStreet } from '@/content/models/footprints'
import { CURVE_TENSION } from './types'

/**
 * Move a drawn route out of the roadway and onto the pavement.
 *
 * The route was drawn in the map editor with snap-to-street, and street data is
 * centrelines — so the line follows the middle of the road. Measured against
 * the kerbs it comes out 4.5 to 10 metres *inside* Michigan Avenue's
 * carriageway, which means the player spends the whole avenue walking down the
 * centre of six lanes of traffic. Delaware and the Triangle are the same, by
 * five metres.
 *
 * The authored waypoints are left exactly as drawn and corrected here instead,
 * so the route file still says what was drawn and this says what was done to
 * it. Which side of the street a waypoint is on is preserved — that part is a
 * real authoring decision — and only the distance from the centreline changes.
 *
 * Applied per section by id, because the correction is only meaningful where
 * the route is following a surface street: the beach, the underpass and the
 * restaurant interior have no kerb to walk on, and the underpass in particular
 * runs beneath Lake Shore Drive, whose centreline is the wrong thing to measure
 * against entirely.
 */

/** Metres from the kerb to stand — a pavement's width, near its middle. */
const STAND_OFF = 2.6

/** How far a single waypoint may be moved before we assume we have it wrong. */
const MAX_SHIFT = 14

/** Offsets sampled around a curve point, for the camera's own width. */
const CLEARANCE: Array<[number, number]> = [
  [0, 0],
  [1.7, 0], [-1.7, 0], [0, 1.7], [0, -1.7],
  [1.2, 1.2], [1.2, -1.2], [-1.2, 1.2], [-1.2, -1.2],
]

export function walkTheKerb(
  waypoints: Array<[number, number, number]>,
  sections: Array<{ id: string; waypoints: [number, number] }>,
  correct: string[],
): Array<[number, number, number]> {
  const inScope = new Set<number>()
  for (const section of sections) {
    if (!correct.includes(section.id)) continue
    for (let i = section.waypoints[0]; i <= section.waypoints[1]; i++) inScope.add(i)
  }

  const corrected = waypoints.map((point, index) => {
    if (!inScope.has(index)) return point
    const [x, y, z] = point
    const street = nearestStreet(x, z)
    if (!street) return point

    const lateral = (x - street.x) * street.rx + (z - street.z) * street.rz

    /**
     * Down the middle of the pavement, not a fixed distance past the kerb.
     *
     * A flat 2.6 m is a good walking line on Michigan Avenue and puts you
     * through the shop windows on Delaware, where the pavement is barely two
     * metres wide — and a shopfront is mounted on the building face, so being
     * merely outside the footprint is not enough. Halfway between the kerb and
     * whatever the buildings leave is right on both, and it is self-limiting.
     */
    const room = lateralClearance(street.x, street.z, street.rx, street.rz, 26)
    const target = Math.min(street.half + STAND_OFF, (street.half + room) / 2)
    if (target < street.half + 0.8) return point
    // Already on the pavement or beyond it: leave it alone. Only a waypoint
    // inside the carriageway is wrong.
    if (Math.abs(lateral) >= target) return point

    // Keep the side. A waypoint exactly on the centreline has no side of its
    // own, so it takes the side the previous corrected point took — resolved by
    // the caller's ordering, and +1 at the very start.
    const side = lateral === 0 ? 1 : Math.sign(lateral)

    /**
     * As far out as the pavement actually goes.
     *
     * A flat 2.6 m past the kerb is right on a wide avenue and inside the
     * shopfronts on Delaware, where the pavement is barely two metres. Stepping
     * inward until the point is clear of every footprint finds the real width;
     * if nothing on this side is walkable the waypoint is left as drawn rather
     * than moved somewhere worse.
     */
    for (let stand = target; stand >= street.half + 0.8; stand -= 0.3) {
      const shift = stand * side - lateral
      if (Math.abs(shift) > MAX_SHIFT) continue
      const nx = x + street.rx * shift
      const nz = z + street.rz * shift
      // Checked with a margin, because the camera has width even if a point
      // does not: a waypoint that merely fails to be inside a wall still
      // scrapes along it.
      if (buildingAt(nx, nz)) continue
      if (buildingAt(nx + street.rx * 1.4 * side, nz + street.rz * 1.4 * side)) continue
      return [nx, y, nz] as [number, number, number]
    }
    return point
  })

  /**
   * Now check the curve, not just the points.
   *
   * Moving a waypoint sideways moves the spline through it, and a Catmull-Rom
   * through corrected points either side of an uncorrected corner swings wide:
   * pushing Michigan Avenue onto its pavement sent the curve straight through
   * One Magnificent Mile, even though every individual waypoint was clear.
   *
   * So the corrected line is evaluated the way the Rail will build it, and any
   * waypoint whose stretch passes through a footprint is put back where it was
   * drawn. Repeated until the curve is clean or there is nothing left to
   * revert — reverting one point changes the two spans either side of it.
   */
  const reverted = new Set<number>()
  for (let pass = 0; pass < 6; pass++) {
    const curve = new THREE.CatmullRomCurve3(
      corrected.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
      false,
      'catmullrom',
      CURVE_TENSION,
    )
    const steps = Math.ceil(curve.getLength() / 1.5)
    const point = new THREE.Vector3()
    const guilty = new Set<number>()

    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      curve.getPointAt(t, point)
      /**
       * With the near plane's margin, not as a bare point.
       *
       * A camera that merely fails to be inside a wall still scrapes along it:
       * the geometry sweep asks for clearance, so the correction has to check
       * for clearance too, or it hands back a line that passes every
       * waypoint-level test and fails the one that matters.
       */
      if (!CLEARANCE.some(([dx, dz]) => buildingAt(point.x + dx, point.z + dz))) continue
      // Blame the nearest corrected waypoint on either side of this sample.
      const near = Math.round(t * (corrected.length - 1))
      for (const j of [near - 1, near, near + 1]) {
        if (j < 0 || j >= corrected.length) continue
        if (!inScope.has(j) || reverted.has(j)) continue
        guilty.add(j)
      }
    }

    if (guilty.size === 0) break
    for (const j of guilty) {
      corrected[j] = waypoints[j]!
      reverted.add(j)
    }
  }

  return corrected
}

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

/**
 * Offsets sampled around a curve point, for the camera's own width.
 *
 * 0.9 m, not 1.7. The geometry sweep asks for 0.45 m of clearance from a wall;
 * demanding nearly four times that meant no position on Michigan Avenue's
 * pavement qualified — the towers stand close to the kerb — so every correction
 * there backed off to zero and the player stayed in the middle of the road. Two
 * pavement slabs of margin is comfortable and achievable.
 */
const CLEARANCE: Array<[number, number]> = [
  [0, 0],
  [0.9, 0], [-0.9, 0], [0, 0.9], [0, -0.9],
  [0.64, 0.64], [0.64, -0.64], [-0.64, 0.64], [-0.64, -0.64],
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

  /** The full correction for each waypoint, as a world-space offset. */
  const shifts = waypoints.map((point, index): [number, number] => {
    if (!inScope.has(index)) return [0, 0]
    const [x, , z] = point
    const street = nearestStreet(x, z)
    if (!street) return [0, 0]

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
    /**
     * `lateralClearance` walks outward from the street centre and stops at the
     * first footprint on *either* side, so on Michigan Avenue — towers close on
     * one side, plaza on the other — it comes back smaller than the
     * carriageway's own half-width. Halfway between the kerb and that is then
     * inside the road, the guard below rejected it, and not one Michigan
     * waypoint was corrected at all.
     *
     * When the measurement is not informative, take the standard stand-off and
     * let the curve check back it off if the geometry cannot take it. That
     * check is the real safety net; this is only a first guess.
     */
    const informative = room > street.half + 1
    const target = informative
      ? Math.min(street.half + STAND_OFF, (street.half + room) / 2)
      : street.half + STAND_OFF
    // Already on the pavement or beyond it: leave it alone. Only a waypoint
    // inside the carriageway is wrong.
    if (Math.abs(lateral) >= target) return [0, 0]

    // Keep the side. A waypoint exactly on the centreline has no side of its
    // own, so it takes the outward one.
    const side = lateral === 0 ? 1 : Math.sign(lateral)
    const shift = target * side - lateral
    if (Math.abs(shift) > MAX_SHIFT) return [0, 0]
    return [street.rx * shift, street.rz * shift]
  })

  /**
   * Apply as much of each correction as the curve can take.
   *
   * Moving a waypoint sideways moves the spline through it, and a Catmull-Rom
   * through corrected points either side of an uncorrected corner swings wide:
   * pushing Michigan Avenue onto its pavement sent the curve straight through
   * One Magnificent Mile even though every individual waypoint was clear.
   *
   * So the corrected line is evaluated the way the Rail will build it, and any
   * waypoint whose stretch fouls a footprint has its correction halved — not
   * thrown away. All-or-nothing reverting was the first attempt and it undid
   * four of Michigan's five waypoints over a single bad sample near the corner,
   * which left the player back in the middle of the road. Backing off converges
   * on the largest correction the geometry actually allows.
   */
  const factors = waypoints.map(() => 1)
  const build = () =>
    waypoints.map(([x, y, z], i): [number, number, number] => [
      x + shifts[i]![0] * factors[i]!,
      y,
      z + shifts[i]![1] * factors[i]!,
    ])

  for (let pass = 0; pass < 8; pass++) {
    const corrected = build()
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
       * With the near plane's margin, not as a bare point: a camera that merely
       * fails to be inside a wall still scrapes along it.
       */
      if (!CLEARANCE.some(([dx, dz]) => buildingAt(point.x + dx, point.z + dz))) continue
      // Blame the nearest corrected waypoints on either side of this sample.
      const near = Math.round(t * (corrected.length - 1))
      for (const j of [near - 1, near, near + 1]) {
        if (j < 0 || j >= corrected.length) continue
        if (factors[j]! <= 0) continue
        guilty.add(j)
      }
    }

    if (guilty.size === 0) break
    for (const j of guilty) factors[j] = factors[j]! < 0.2 ? 0 : factors[j]! * 0.5
  }

  return build()
}

import * as THREE from 'three'

import { groundHeightAt } from '@/content/models/groundHeight'
import { getSubject } from '@/content/subjects'
import { inCarriageway, nearestStreet } from '@/content/models/footprints'
import { fitToStreet, lanePath } from '@/game/streetFit'
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

/** How close the walking line comes to a point, near the anchor it was placed at. */
function railDistance(rail: Rail, t: number, x: number, z: number): number {
  const probe = new THREE.Vector3()
  let best = Infinity
  for (let d = -0.14; d <= 0.14; d += 0.002) {
    const u = Math.max(0, Math.min(1, t + d))
    rail.positionAt(u, probe)
    best = Math.min(best, Math.hypot(probe.x - x, probe.z - z))
  }
  return best
}

/**
 * Shift a vehicle along its street until it is off the walking line.
 *
 * Along, never across: moving it sideways would put it back on the pavement,
 * which is the thing being fixed. Gives up and leaves it where it was if no
 * space within twenty-five metres works, which is honest — better a car on the
 * line than a car teleported to another block.
 */
function clearOfRail(rail: Rail, t: number, x: number, z: number): [number, number] {
  /**
   * Clearance measured from the vehicle's centre.
   *
   * Generous, because the check that matters measures the car's *oriented
   * footprint* against the line, not its centre, and because the route can pass
   * the same spot twice at very different `t` — it doubles back around the
   * block — so a window that is too narrow declares a space that the player
   * walks through two minutes later.
   */
  const NEEDED = 4.2
  if (railDistance(rail, t, x, z) >= NEEDED) return [x, z]
  const street = nearestStreet(x, z, 70)
  if (!street) return [x, z]

  const dirX = street.rz
  const dirZ = -street.rx
  const side = Math.sign((x - street.x) * street.rx + (z - street.z) * street.rz) || 1
  const lane = street.half * 0.5

  /**
   * The other side of the road counts as a space.
   *
   * On Rush Street the route runs *inside* the carriageway, so every point in
   * the near lane is on the walking line and shifting along it never helps —
   * the path follows the same street. The opposing lane is where a car goes
   * when your side is occupied, and it is a better answer than the pavement.
   * Own side first, so nothing crosses the road that did not have to.
   */
  for (const s of [side, -side]) {
    for (const along of [0, 5, -5, 9, -9, 14, -14, 19, -19, 25, -25, 32, -32, 40, -40]) {
      const qx = street.x + street.rx * s * lane + dirX * along
      const qz = street.z + street.rz * s * lane + dirZ * along
      if (!inCarriageway(qx, qz)) continue
      if (railDistance(rail, t, qx, qz) >= NEEDED) return [qx, qz]
    }
  }
  return [x, z]
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
    const authored: [number, number] = [
      point.x - right.x * p.at.offset,
      point.z - right.z * p.at.offset,
    ]

    /**
     * Then moved to where its species belongs.
     *
     * The offset says roughly where; the streets and footprints say exactly
     * where. Without this a refit of the path quietly walks pedestrians into
     * traffic and parks taxis on the kerb, and neither shows up in any test.
     */
    const def = getSubject(p.species)
    const [x, z] = fitToStreet(authored[0], authored[1], def?.habitat ?? 'any')



    const rotationY = p.alignToRoute ? (p.rotationY ?? 0) + rail.headingAt(t) : p.rotationY

    /**
     * Vehicles moved off the walking line.
     *
     * Putting a car in its lane is only right if the lane is not where the
     * player walks, and on Michigan and Lake Shore Drive the route runs inside
     * the kerb — so fitting the traffic to the road parked fourteen vehicles on
     * the path. Rather than leave them on the pavement to avoid it, they shift
     * *along* the street until the path is clear, which is what a parked car
     * does: it finds a space further down.
     */
    const [fx, fz] = def && (def.habitat === 'road' || p.driveSpeed)
      ? clearOfRail(rail, t, x, z)
      : [x, z]

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
    const ground = groundHeightAt(fx, fz, point.y - EYE_HEIGHT)

    return {
      ...p,
      rotationY,
      position: [fx, ground + (p.at.y ?? 0), fz] as [number, number, number],
      // Anything that drives gets the lane it is standing in to follow.
      drivePath: p.driveSpeed
        ? (lanePath(fx, fz, rotationY ?? 0, p.driveSpan ?? 160) ?? undefined)
        : undefined,
    }
  })
}

import { CITY } from '@/content/models/city'
import {
  buildingAt,
  inCarriageway,
  nearestStreet,
  type NearestStreet,
} from '@/content/models/footprints'

/**
 * Put a subject where its species belongs.
 *
 * Authored placements are metres left of the *route*, and the route runs along
 * the pavement and gets refitted whenever the path moves. An offset that once
 * put a tourist against a shop window ends up in a traffic lane; one that put a
 * taxi in a lane ends up on the kerb. Measured across the route as authored:
 * forty pedestrians standing in the carriageway, twenty of the fifty-nine
 * drivers not on a road at all, and forty-two subjects of every kind standing
 * inside buildings.
 *
 * The fix is not to re-author two hundred and fifty offsets by hand — they
 * would rot again the next time the path moved. The offsets say roughly where,
 * and this says exactly where, against the streets and footprints as they
 * actually are.
 */

/** Metres of pavement between the kerb and where a person is put. */
const PAVEMENT_INSET = 2.2
/** How far from the centreline a vehicle sits, as a share of the half-width. */
const LANE = 0.5

/**
 * Move a point onto the carriageway or onto the pavement, whichever it wants.
 *
 * Sideways only — it keeps whichever side of the centreline it started on, so
 * nothing hops across the street from where it was authored.
 */
function toHabitat(
  x: number,
  z: number,
  habitat: 'road' | 'pavement' | 'any',
  street: NearestStreet | null,
): [number, number] {
  if (habitat === 'any' || !street) return [x, z]
  const road = inCarriageway(x, z)
  if (habitat === 'road' ? road : !road) return [x, z]

  const side = Math.sign((x - street.x) * street.rx + (z - street.z) * street.rz) || 1
  const out = habitat === 'road' ? street.half * LANE : street.half + PAVEMENT_INSET
  const across: [number, number] = [
    street.x + street.rx * side * out,
    street.z + street.rz * side * out,
  ]
  if (habitat === 'road') return across

  /**
   * A pedestrian can walk along the pavement, not only across it.
   *
   * Straight out from the centreline is the obvious move and it fails on
   * Michigan Avenue, where the mapped footprints run right over the kerb: the
   * spot two metres behind the kerb is inside a shop, so getting out of the
   * shop put the person back in the road, and a dozen of them ended up standing
   * in four lanes of traffic. Stepping along the frontage finds the gap between
   * two buildings — a doorway, an alley mouth, the corner of a block — which is
   * where someone would actually be standing.
   *
   * The street's direction is the right-hand normal turned a quarter turn.
   */
  const dirX = street.rz
  const dirZ = -street.rx
  for (const along of [0, 3, -3, 6, -6, 9, -9, 12, -12, 16, -16]) {
    const qx = across[0] + dirX * along
    const qz = across[1] + dirZ * along
    if (!inCarriageway(qx, qz) && !buildingAt(qx, qz)) return [qx, qz]
  }
  return across
}

/**
 * Get out of the wall by walking towards the road.
 *
 * The first version pushed straight out through the nearest edge of the
 * footprint, which is wrong on any plot that is not convex: on an L-shaped
 * building the nearest edge is often the inside of the notch, and "outward"
 * from it is further into the building. It moved forty-two subjects and left
 * forty-six inside walls.
 *
 * A carriageway is never inside a building, so stepping towards the centreline
 * always escapes, and the first step that is clear leaves the subject just
 * outside the building line — which for a pedestrian is exactly where they
 * should be standing anyway.
 */
function escapeBuilding(x: number, z: number, street: NearestStreet | null): [number, number] {
  if (!buildingAt(x, z)) return [x, z]
  if (street) {
    for (let s = 0.04; s <= 1.0001; s += 0.04) {
      const qx = x + (street.x - x) * s
      const qz = z + (street.z - z) * s
      if (!buildingAt(qx, qz)) {
        // Back off a little further so it is standing clear of the wall, not
        // scraping it — the outline pass makes a graze look like clipping.
        const bx = qx + (street.x - x) * 0.02
        const bz = qz + (street.z - z) * 0.02
        return buildingAt(bx, bz) ? [qx, qz] : [bx, bz]
      }
    }
  }
  return [x, z]
}

/**
 * Both corrections, in order, then checked again.
 *
 * Escaping a wall can drop something in a traffic lane and leaving a lane can
 * push it into a wall, so one pass of each is not enough.
 */
export function fitToStreet(
  x: number,
  z: number,
  habitat: 'road' | 'pavement' | 'any',
): [number, number] {
  let px = x
  let pz = z
  for (let round = 0; round < 3; round++) {
    const street = nearestStreet(px, pz, 70)
    ;[px, pz] = toHabitat(px, pz, habitat, street)
    ;[px, pz] = escapeBuilding(px, pz, street)
  }
  return [px, pz]
}

/**
 * A lane to drive down, following the street the car is standing on.
 *
 * Cars were advanced in a straight line along their own facing for a hundred
 * and sixty metres. Michigan Avenue bends, Lake Shore Drive bends hard, and the
 * route turns two corners, so a straight line leaves the carriageway within a
 * few seconds, crosses the pavement and drives through a building — which is
 * exactly what it looked like.
 *
 * The centreline is in the map already. This walks it out from wherever the car
 * was placed, in whichever direction the car is facing, and offsets into the
 * right-hand lane. What comes back is a path; the driving code follows it.
 */
export function lanePath(
  x: number,
  z: number,
  heading: number,
  span: number,
): Array<[number, number]> | null {
  const street = nearestStreet(x, z, 70)
  if (!street) return null

  // The polyline this point sits on. Names repeat across ways, so the segment
  // distance decides rather than the name.
  let best: { points: Array<[number, number]>; index: number; t: number } | null = null
  let bestDistance = Infinity
  for (const candidate of CITY.streets) {
    for (let i = 0; i + 1 < candidate.p.length; i++) {
      const [ax, az] = candidate.p[i]!
      const [bx, bz] = candidate.p[i + 1]!
      const dx = bx - ax
      const dz = bz - az
      const len2 = dx * dx + dz * dz || 1
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2))
      const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t))
      if (d < bestDistance) {
        bestDistance = d
        best = { points: candidate.p, index: i, t }
      }
    }
  }
  if (!best || bestDistance > 70) return null

  /**
   * Which way along the polyline the car is pointing.
   *
   * Models face local −Z, so a car at `rotationY = a` is heading
   * `(−sin a, −cos a)`; if that opposes the polyline's own direction the walk
   * runs backwards down it.
   */
  const [ax, az] = best.points[best.index]!
  const [bx, bz] = best.points[best.index + 1]!
  const segLen = Math.hypot(bx - ax, bz - az) || 1
  const forward = ((bx - ax) / segLen) * -Math.sin(heading) + ((bz - az) / segLen) * -Math.cos(heading) >= 0
  const points = forward ? best.points : [...best.points].reverse()
  const startIndex = forward ? best.index : best.points.length - 2 - best.index

  // Walk out along the centreline, half the span behind and half in front, so
  // the car is authored where it should be seen and loops well away from there.
  const centre: Array<[number, number]> = []
  let walked = 0
  for (let i = startIndex; i + 1 < points.length && walked < span; i++) {
    const [px, pz] = points[i]!
    centre.push([px, pz])
    walked += Math.hypot(points[i + 1]![0] - px, points[i + 1]![1] - pz)
  }
  centre.push(points[Math.min(points.length - 1, startIndex + centre.length)]!)
  if (centre.length < 2) return null

  // Offset into the right-hand lane, which is the side traffic drives on here.
  const lane: Array<[number, number]> = []
  for (let i = 0; i < centre.length; i++) {
    const [px, pz] = centre[i]!
    const [qx, qz] = centre[Math.min(i + 1, centre.length - 1)]!
    const [ox, oz] = centre[Math.max(i - 1, 0)]!
    const dx = qx - ox
    const dz = qz - oz
    const len = Math.hypot(dx, dz) || 1
    // Right of travel, in three's left-handed ground plane.
    const rx = -dz / len
    const rz = dx / len
    const half = nearestStreet(px, pz, 70)?.half ?? street.half
    lane.push([px + rx * half * LANE, pz + rz * half * LANE])
  }
  return lane
}

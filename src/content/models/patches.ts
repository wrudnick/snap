import { SURFACE, type SurfaceKind } from '@/render/ground'

import { CITY } from './city'

/**
 * Ground that isn't a street, defined in world space.
 *
 * The ground used to be extruded sideways along the camera rail, which coupled
 * two things that have no business being coupled: where the player walks, and
 * where the world's surfaces are. It failed in both directions. A rail that
 * turns sharply folds its own ribbon into a flap lying across the road — every
 * corner on the route was doing it — and moving a waypoint in the editor could
 * silently unpave a block.
 *
 * Streets pave themselves from the OSM network (see cityGround). Everything
 * else — sand, water, park, alley, restaurant floor — is a polygon fixed in the
 * world, authored here. The route can now be dragged anywhere at all and the
 * ground does not move, because the ground was never the route's business.
 */

export interface GroundPatch {
  id: string
  kind: SurfaceKind
  color: number
  /** Height above grade. */
  y: number
  /** Polygon in world XZ. Convex or mildly concave; triangulated by ear clipping. */
  ring: Array<[number, number]>
  /**
   * Rotation of the pattern frame, radians. Sand ripples run along the shore
   * and floorboards along the room, so the shader's coordinates are turned to
   * match rather than locked to the world axes.
   */
  patternAngle?: number
  /** Drawn over lower layers where they overlap. */
  layer?: number
}

const SAND = 0xd8c9a4
const WET_SAND = 0xcabb95
const LAKE_SHALLOW = 0x6f9bb0
const LAKE_DEEP = 0x3f6d8c
const PARK_GREEN = 0x5f7247
const ALLEY_FLOOR = 0x3f3c37
const INTERIOR_FLOOR = 0x4a3526

/** Where two named streets meet, from the OSM ways themselves. */
function intersection(a: RegExp, b: RegExp): [number, number] | null {
  const segments = (match: RegExp) => {
    const out: Array<[number, number, number, number]> = []
    for (const s of CITY.streets) {
      if (!match.test(s.n)) continue
      for (let i = 1; i < s.p.length; i++) {
        out.push([s.p[i - 1]![0], s.p[i - 1]![1], s.p[i]![0], s.p[i]![1]])
      }
    }
    return out
  }

  for (const [ax, az, bx, bz] of segments(a)) {
    for (const [cx, cz, dx, dz] of segments(b)) {
      const r1x = bx - ax
      const r1z = bz - az
      const r2x = dx - cx
      const r2z = dz - cz
      const denominator = r1x * r2z - r1z * r2x
      if (Math.abs(denominator) < 1e-9) continue
      const t = ((cx - ax) * r2z - (cz - az) * r2x) / denominator
      const u = ((cx - ax) * r1z - (cz - az) * r1x) / denominator
      if (t >= -0.02 && t <= 1.02 && u >= -0.02 && u <= 1.02) {
        return [ax + r1x * t, az + r1z * t]
      }
    }
  }
  return null
}

/**
 * Mariano Park, from the three streets that enclose it.
 *
 * Rush, State and Bellevue genuinely make a triangle, and its corners are
 * shared OSM nodes — so this is measured rather than drawn, and it stays right
 * if the export is ever refreshed. Inset from the kerbs so the lawn doesn't
 * cover the road.
 */
function marianoPark(): Array<[number, number]> | null {
  const corners = [
    intersection(/^North Rush Street$/, /^East Bellevue Place$/),
    intersection(/^North State Street$/, /^East Bellevue Place$/),
    intersection(/^North Rush Street$/, /^North State Street$/),
  ]
  if (corners.some((c) => !c)) return null

  const points = corners as Array<[number, number]>
  const cx = points.reduce((sum, p) => sum + p[0], 0) / 3
  const cz = points.reduce((sum, p) => sum + p[1], 0) / 3
  // Pull each corner toward the centre by the width of a carriageway plus a
  // pavement, which is roughly where a park's railing sits.
  return points.map(([x, z]) => {
    const length = Math.hypot(x - cx, z - cz) || 1
    const pull = Math.min(length * 0.45, 13)
    return [x + ((cx - x) / length) * pull, z + ((cz - z) / length) * pull]
  })
}

/**
 * Oak Street Beach.
 *
 * The lakefront is the one place with no street to pave and no footprints to
 * measure against — so it is measured against Lake Shore Drive instead. The
 * beach waypoints all sit 19 to 70 m from the Drive on its lake side, so the
 * shoreline is a band running parallel to it: sand, then a strip of wet sand,
 * then water out past the far plane.
 *
 * The first version of this was drawn by hand from the satellite image and put
 * the sand 250 m from where the route actually walks, so the game opened on a
 * screen captioned OAK STREET BEACH with paving slabs underfoot. Bands off a
 * real street cannot miss that way.
 */
const BEACH_SAND: Array<[number, number]> = [
  [7, -177],
  [286, -39],
  [320, -109],
  [42, -247],
]

const WET: Array<[number, number]> = [
  [42, -247],
  [320, -109],
  [328, -125],
  [50, -263],
]

const LAKE: Array<[number, number]> = [
  [50, -263],
  [328, -125],
  [517, -504],
  [239, -643],
]

const DEEP_LAKE: Array<[number, number]> = [
  [185, -535],
  [464, -397],
  [909, -1292],
  [630, -1430],
]

/**
 * A polyline widened into a ring.
 *
 * Long thin spaces are far easier to get right as a centreline and a width than
 * as four corners — the first hand-drawn attempt at the alley and the restaurant
 * missed the route almost entirely, covering one waypoint out of four each. A
 * centreline can be read straight off the map.
 */
function strip(path: Array<[number, number]>, halfWidth: number): Array<[number, number]> {
  const left: Array<[number, number]> = []
  const right: Array<[number, number]> = []

  for (let i = 0; i < path.length; i++) {
    const [x, z] = path[i]!
    const previous = path[i - 1] ?? path[i]!
    const next = path[i + 1] ?? path[i]!
    const dx = next[0] - previous[0]
    const dz = next[1] - previous[1]
    const length = Math.hypot(dx, dz) || 1
    const rx = -dz / length
    const rz = dx / length
    left.push([x - rx * halfWidth, z - rz * halfWidth])
    right.push([x + rx * halfWidth, z + rz * halfWidth])
  }

  return [...left, ...right.reverse()]
}

/**
 * The service alley behind the Triangle, and the restaurant it leads into.
 *
 * OSM maps the buildings either side but not the gap between them, and the
 * interior of a restaurant is nobody's open data — so both are drawn. These are
 * the two places in the world that exist *because* of the route rather than
 * before it, which is why they are the two that had to be measured off it.
 */
const ALLEY = strip([
  [-306, -120.8],
  [-283, -120.0],
  [-258, -119.2],
], 4.6)

/**
 * The dining room, as a room.
 *
 * A rectangle rather than a strip: the route wanders around inside it rather
 * than running down the middle, so a centreline would leave the corners bare.
 */
const RESTAURANT: Array<[number, number]> = [
  [-308, -143],
  [-262, -143],
  [-262, -122],
  [-308, -122],
]

export const GROUND_PATCHES: GroundPatch[] = [
  // Water first, then sand over it, so the shoreline is a hard edge rather than
  // a seam that has to line up.
  { id: 'lake-deep', kind: SURFACE.water, color: LAKE_DEEP, y: -0.9, ring: DEEP_LAKE, patternAngle: 0.461, layer: 0 },
  { id: 'lake', kind: SURFACE.water, color: LAKE_SHALLOW, y: -0.6, ring: LAKE, patternAngle: 0.461, layer: 1 },
  { id: 'wet-sand', kind: SURFACE.sand, color: WET_SAND, y: -0.1, ring: WET, patternAngle: 0.461, layer: 2 },
  { id: 'beach', kind: SURFACE.sand, color: SAND, y: 0.05, ring: BEACH_SAND, patternAngle: 0.461, layer: 3 },
  { id: 'mariano-park', kind: SURFACE.park, color: PARK_GREEN, y: 0.18, ring: marianoPark() ?? [], layer: 4 },
  { id: 'alley', kind: SURFACE.concrete, color: ALLEY_FLOOR, y: 0.02, ring: ALLEY, patternAngle: 0.76, layer: 4 },
  { id: 'restaurant', kind: SURFACE.interior, color: INTERIOR_FLOOR, y: 0.05, ring: RESTAURANT, patternAngle: 1.05, layer: 5 },
].filter((p) => p.ring.length >= 3)

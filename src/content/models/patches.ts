import * as THREE from 'three'

import { ROUTES } from '@/content/routes/goldcoast'
import { CURVE_TENSION, EYE_HEIGHT } from '@/content/routes/types'
import { SURFACE, type SurfaceKind } from '@/render/ground'

import { CITY } from './city'
import { applyLimits, curveLimits, type Frame } from './ribbon'

/**
 * The route's own floor height at a point, or null if the route is not near it.
 *
 * The underpass is the one piece of ground that exists *because* of the route —
 * it is the cut the player walks down — and its height was authored separately
 * from the route's waypoints. The two disagreed: descending the ramp the floor
 * sat 20 to 30 cm above the camera's feet, and under Lake Shore Drive there was
 * no surface below the camera at all. You walked the whole underpass sunk into
 * the tarmac.
 *
 * So the plan stays authored — where the cut runs is a design decision — and
 * the profile is derived. They cannot drift apart again, because there is only
 * one of them.
 *
 * Imports the route, which is safe: nothing in the route's own import graph
 * reaches the ground. It is not the ribbon-follows-rail coupling that was
 * removed earlier, because only this one patch is route-shaped; the streets
 * still pave themselves from OSM and know nothing about where the player goes.
 */
const routeFloor = (() => {
  let samples: THREE.Vector3[] | null = null

  return (x: number, z: number): number | null => {
    if (!samples) {
      const curve = new THREE.CatmullRomCurve3(
        ROUTES.goldcoast!.waypoints.map(([wx, wy, wz]) => new THREE.Vector3(wx, wy, wz)),
        false,
        'catmullrom',
        CURVE_TENSION,
      )
      const steps = Math.ceil(curve.getLength() / 0.5)
      samples = curve.getSpacedPoints(steps)
    }

    let best: THREE.Vector3 | null = null
    let bestDistance = Infinity
    for (const point of samples) {
      const d = (point.x - x) ** 2 + (point.z - z) ** 2
      if (d < bestDistance) {
        bestDistance = d
        best = point
      }
    }
    // Beyond the width of the cut the plan runs on past where the route goes;
    // those ends keep the height they were drawn with.
    if (!best || bestDistance > 30 * 30) return null
    return best.y - EYE_HEIGHT
  }
})()

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
  /** Height above grade, for rings that lie flat. */
  y: number
  /** Polygon in world XZ. Convex or mildly concave; triangulated by ear clipping. */
  ring: Array<[number, number]>
  /**
   * Per-vertex height, parallel to `ring`. Only the underpass needs it: its
   * floor ramps five metres down and back up, and a flat polygon cannot.
   */
  heights?: number[]
  /**
   * Points per side, when this ring is a ribbon rather than a blob.
   *
   * Ear clipping triangulates a *polygon*, and it is free to join any two
   * vertices it likes — down a long thin ribbon that means triangles spanning
   * from one end to the other, interpolating between heights fifty metres
   * apart. The underpass floor read half a metre high in the middle of the
   * tunnel for exactly this reason, with the camera below it, while the rails
   * either side of that point had the correct height.
   *
   * Set, the ring is triangulated as a strip instead: each quad spans one
   * segment and nothing else, so a vertex height can only ever influence the
   * ground beside it.
   */
  ribbon?: number
  /**
   * Whether streets and fill stop where this patch covers them.
   *
   * True for everything at grade. False for the underpass, which is *below*
   * Lake Shore Drive rather than instead of it — culling the road there would
   * put a hole in the carriageway that runs over the top.
   */
  cullsAbove?: boolean
  /**
   * Whether the generic paving between streets stops over this patch, even
   * when the streets themselves do not.
   *
   * The underpass needs exactly this split. It must not cull streets — Lake
   * Shore Drive runs *over* it, and removing the carriageway there would put a
   * hole in the road. But it must cull the fill, or the trench is roofed over
   * by paving along its whole length and the ramp mouth is capped: you walk
   * down and straight through the ground, which is what it looked like.
   *
   * Defaults to whatever `cullsAbove` says.
   */
  cullsFill?: boolean
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
const TUNNEL_FLOOR = 0x4a4540

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
    // Pulled in only as far as the kerb. Thirteen metres left a token scrap of
    // green in the middle of a large paved triangle; the park is most of what
    // is inside those three streets.
    const pull = Math.min(length * 0.28, 8)
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
 * A polyline with heights, widened into a ring.
 *
 * Same idea as `strip`, but the points carry a y — which the underpass needs
 * and nothing else does, because it is the only piece of ground in the world
 * that is not at grade.
 */
function ramp(
  path: Array<[number, number, number]>,
  halfWidth: number,
): { ring: Array<[number, number]>; heights: number[]; ribbon: number } {
  // Reassigned below once densified.
  /**
   * Densified before the heights are taken.
   *
   * The plan is drawn with samples about eight metres apart, which is plenty
   * for the shape of the cut in plan view and far too coarse for its profile:
   * the route drops nearly a metre over one of those spans as it enters, and a
   * straight line between two derived heights sits well above the curve it is
   * meant to follow. The camera went under the ramp surface at exactly the
   * points where the descent was steepest.
   *
   * Four metres, not two. Shorter rows track the spline more closely and also
   * make the fold limit bite harder — the derivation in `ribbon.ts` bounds the
   * offset by |f|²/|k|, so halving the row length quarters the width a corner
   * can carry, and at two metres the ramp pinched shut at the turn off Lake
   * Shore Drive. Four keeps the height error to a couple of centimetres and
   * leaves the corner four times the slack.
   */
  const SPACING = 4
  const dense: Array<[number, number, number]> = []
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, , az] = path[i]!
    const [bx, , bz] = path[i + 1]!
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / SPACING))
    for (let k = 0; k < steps; k++) {
      const f = k / steps
      dense.push([ax + (bx - ax) * f, 0, az + (bz - az) * f])
    }
  }
  dense.push(path[path.length - 1]!)
  path = dense

  const left: Array<[number, number]> = []
  const right: Array<[number, number]> = []
  const leftY: number[] = []
  const rightY: number[] = []

  /**
   * Frames first, so the width can be limited before it is used.
   *
   * The cut turns back on itself where it drops off Lake Shore Drive, and a
   * ribbon offset blindly at a corner that tight folds into a flap lying across
   * its own floor — the same failure `ribbon.ts` exists for, and the reason the
   * camera spent the descent inside a brown wall. Densifying the plan made it
   * far worse rather than better: more rows through the turn means more of them
   * folded.
   */
  const frames: Frame[] = []
  for (let i = 0; i < path.length; i++) {
    const [x, authoredY, z] = path[i]!
    // Height from the route where the route is near, authored height at the
    // ends where it is not. See routeFloor.
    const derived = routeFloor(x, z)
    const y = derived ?? authoredY
    path[i] = [x, y, z]
    const previous = path[i - 1] ?? path[i]!
    const next = path[i + 1] ?? path[i]!
    const dx = next[0] - previous[0]
    const dz = next[2] - previous[2]
    const length = Math.hypot(dx, dz) || 1
    frames.push({ x, z, rx: -dz / length, rz: dx / length })
  }

  const limits = curveLimits(frames)
  for (let i = 0; i < frames.length; i++) {
    const { x, z, rx, rz } = frames[i]!
    const y = path[i]![1]
    // Negative is the left rail, positive the right; `applyLimits` picks the
    // bound for whichever side is inside the turn.
    const l = applyLimits(-halfWidth, limits, i)
    const r = applyLimits(halfWidth, limits, i)
    left.push([x + rx * l, z + rz * l])
    right.push([x + rx * r, z + rz * r])
    leftY.push(y)
    rightY.push(y)
  }

  // Published *after* the derivation, so `addCutWalls` builds the retaining
  // walls from the same heights the floor uses. Pushed before it, the walls
  // kept the authored profile and stood in the wrong place against the ramp.
  UNDERPASS_PATH.push(...path)

  return {
    ring: [...left, ...right.reverse()],
    heights: [...leftY, ...rightY.reverse()],
    ribbon: left.length,
  }
}

/**
 * The floor of the Oak Street underpass.
 *
 * This is the one piece of ground that is not at grade, and when the ground
 * stopped being extruded along the rail it stopped existing at all — the route
 * still dipped five metres and the world no longer came with it, so the middle
 * of the tunnel was the camera hanging in empty space under a floating city.
 *
 * These are the rail's own positions, sampled every seven metres and baked,
 * rather than the waypoints interpolated by hand — which is what the first
 * attempt did, and the spline bulges away from its own chords enough that the
 * floor slid out from under the middle of the descent. Sampled densely, too:
 * at twelve points the strip pinched on the inside of the two hard bends and
 * the floor went missing there instead. Heights are the rail
 * less eye height, because waypoints are authored 1.7 m above the floor.
 *
 * The underpass joins the alley and the restaurant as ground that follows the
 * route: all three are places that exist *because* of the route rather than
 * before it, so all three move with it.
 */
/** Half-width of the cut, shared with the wall builder. */
export const UNDERPASS_HALF = 5.4

/** The centreline of the cut, floor heights included. */
export const UNDERPASS_PATH: Array<[number, number, number]> = []

const UNDERPASS = ramp(
  [
    [173, 0.0, -144],
    [177, 0.0, -136],
    [174, 0.1, -128],
    [171, 0.1, -119],
    [167, 0.1, -111],
    [161, 0.0, -104],
    [154, -0.7, -108],
    [146, -1.4, -113],
    [139, -2.2, -118],
    [131, -2.9, -124],
    [124, -3.6, -129],
    [116, -4.4, -134],
    [108, -4.9, -137],
    [101, -5.0, -132],
    [94, -5.0, -125],
    [87, -5.0, -119],
    [81, -5.0, -113],
    [74, -5.0, -107],
    [67, -4.9, -100],
    [61, -4.7, -95],
    [55, -4.2, -88],
    [48, -3.7, -82],
    [43, -3.2, -75],
    [41, -2.8, -66],
    [39, -2.3, -57],
    [37, -1.9, -48],
    [35, -1.4, -40],
    [32, -0.8, -31],
    [29, -0.1, -22],
    [27, 0.0, -14],
    [24, 0.0, -5],
  ],
  UNDERPASS_HALF,
)

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
  {
    id: 'underpass',
    kind: SURFACE.concrete,
    color: TUNNEL_FLOOR,
    y: 0,
    ring: UNDERPASS.ring,
    heights: UNDERPASS.heights,
    ribbon: UNDERPASS.ribbon,
    cullsFill: true,
    patternAngle: 0.9,
    layer: 6,
    // Lake Shore Drive runs over the top of this, not instead of it.
    cullsAbove: false,
  },
].filter((p) => p.ring.length >= 3)

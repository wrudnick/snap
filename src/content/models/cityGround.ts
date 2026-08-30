import * as THREE from 'three'

import { SURFACE, type SurfaceKind } from '@/render/ground'

import { CITY, type CityStreet } from './city'
import { ASPHALT, SIDEWALK } from './surfaces'
import { buildingAt, dominantStreet, inCarriageway, lateralClearance } from './footprints'
import { applyLimits, curveLimits } from './ribbon'
import {
  GROUND_PATCHES,
  UNDERPASS_HALF,
  UNDERPASS_PATH,
  type GroundPatch,
} from './patches'
import { carriagewayHalfWidth, streetRank } from './streetWidths'

export { carriagewayHalfWidth }

/**
 * Ground for the whole city, not just the route.
 *
 * The route ribbon paves the street the player walks down and nothing else, so
 * every cross street was an unpaved gap and every block interior was open sky
 * with buildings standing in it. From a street camera you see four intersections
 * at a time, and all four of them were holes.
 *
 * The OSM export has carried 263 street ways since the import and nothing had
 * ever read them. They're the whole answer: each one becomes a ribbon with the
 * same lane profile as the route's — pavement, kerb, carriageway, kerb,
 * pavement — carrying the same `aGround`/`aSurface` attributes, so it picks up
 * the paving, markings and kerbs from the ground shader with no new code.
 *
 * Merged into one geometry: the entire city floor is a single draw call.
 */

/** Pavement each side of the kerb. */
const WALK = 4.5

/** Kerb width — matched to the route ribbon so both read as the same kerb. */
const KERB = 0.6

/**
 * Heights, all relative to the route ribbon's road at zero.
 *
 * The city ground sits *below* the route ribbon everywhere they overlap, so the
 * ribbon always wins the depth test. Segments under the ribbon are dropped
 * outright, so this only matters at the seams.
 */
const ROAD_Y = -0.03
const WALK_Y = 0.14
// Well below the streets. The per-chain lift can drop a carriageway to −0.09,
// and a fill at −0.10 then sits a centimetre under it — which is the z-fight
// this whole layering exists to avoid.
const FILL_Y = -0.3

/**
 * Longest street segment before it gets subdivided, in metres.
 *
 * OSM records a straight block as two points, so a single quad can be fifty
 * metres long — far too coarse to decide "is this under the route ribbon",
 * which is how a cross street's pavement ended up floating across the middle of
 * Delaware Place. Small quads make the cull precise and cost nothing.
 */
const MAX_SEGMENT = 5

/** Block fill: cell size, and how far from a street a cell has to be to exist. */
const FILL_CELL = 20
const FILL_REACH = 90
/**
 * Fill is not pavement.
 *
 * It used to be the same colour and the same 1.5 m slab pattern as the
 * sidewalks, which turned every block interior into a paved plaza — the
 * Triangle read as a car park because most of what you can see there is fill.
 * It is back lots and service yards: darker, and scored like concrete rather
 * than laid like paving.
 */
const FILL_COLOR = 0x5f5a52
const FILL_KIND = SURFACE.concrete

interface GroundLane {
  offset: number
  y: number
  color: number
  kind: SurfaceKind
}

/** Narrowest a carriageway may be squeezed to before the street is dropped. */
export const MIN_HALF = 2.5

/** How fast the carriageway may narrow, in metres of width per metre travelled. */
const WIDTH_TAPER = 0.25

/**
 * How wide each point of a street can actually be paved.
 *
 * The name-based table is a judgement call — 24 street names and no road
 * classification in the export — and where it runs wider than the buildings
 * allow, a tower grows out of the middle of the road. Michigan at ten metres
 * swallowed the Water Tower, which stands on an island in the roadway, plus the
 * Drake and the Pumping Station; The Shops at North Bridge contains the whole
 * of East Grand because the mall genuinely bridges over it.
 *
 * So the table is an upper bound and the buildings set the real one. Widths are
 * tapered rather than stepped, for the same reason ribbon offsets are: a width
 * that collapses between two rows folds the edge just like a corner does.
 */
export function halfWidths(street: CityStreet, points: Array<[number, number]>): number[] {
  const configured = carriagewayHalfWidth(street.n)
  const raw = points.map(([x, z], i) => {
    const next = points[i + 1] ?? points[i - 1] ?? [x, z]
    const dx = next[0] - x
    const dz = next[1] - z
    const length = Math.hypot(dx, dz) || 1
    // Half a metre of margin, so the kerb does not touch the wall.
    const room = lateralClearance(x, z, -dz / length, dx / length, configured + 1) - 0.5
    return Math.min(configured, Math.max(0, room))
  })

  for (let i = 1; i < raw.length; i++) {
    const step = Math.hypot(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1])
    raw[i] = Math.min(raw[i]!, raw[i - 1]! + step * WIDTH_TAPER)
  }
  for (let i = raw.length - 2; i >= 0; i--) {
    const step = Math.hypot(points[i + 1]![0] - points[i]![0], points[i + 1]![1] - points[i]![1])
    raw[i] = Math.min(raw[i]!, raw[i + 1]! + step * WIDTH_TAPER)
  }
  return raw
}

function laneProfileFor(half: number, twin = 0): GroundLane[] {
  const road = (offset: number): GroundLane => ({
    offset,
    y: ROAD_Y,
    color: ASPHALT,
    // One carriageway of a divided road takes the surface that draws no centre
    // line; see SURFACE.oneWay.
    kind: twin === 0 ? SURFACE.asphalt : SURFACE.oneWay,
  })
  const walk = (offset: number): GroundLane => ({
    offset,
    y: WALK_Y,
    color: SIDEWALK,
    kind: SURFACE.sidewalk,
  })

  if (twin !== 0) {
    // Half a street. The carriageway reaches past the centreline toward the
    // twin so the two halves meet rather than leaving a seam; the height offset
    // that stops them fighting where they overlap is applied per chain by the
    // caller.
    const inner = half * 1.6 * twin
    const outer = -half * twin
    return [
      road(inner),
      road(inner - 0.001 * twin),
      road(outer),
      road(outer),
      walk(outer - KERB * twin),
      walk(outer - (KERB + WALK) * twin),
    ]
  }

  return [
    walk(-(half + KERB + WALK)),
    walk(-(half + KERB)),
    road(-half),
    road(half),
    walk(half + KERB),
    walk(half + KERB + WALK),
  ]
}

/**
 * Which side a street's parallel twin is on, if it has one.
 *
 * Michigan Avenue and Lake Shore Drive are mapped as two ways about 14 m apart
 * — the two directions of one road. Paving each as a whole street gives two
 * carriageways with a strip of pavement invented between them, so the
 * Magnificent Mile came out as a dual carriageway with a central reservation
 * nobody has ever stood on.
 *
 * A way that has a twin gets paved as half a street: carriageway on the inner
 * side out to meet its twin, kerb and pavement on the outer side only. The two
 * halves join in the middle into one wide road with pavements down the outside,
 * which is what the street actually is.
 *
 * Returns +1 or −1 for the side the twin lies on, or 0 for an ordinary street.
 */
function twinSide(street: CityStreet, points: Array<[number, number]>): number {
  /**
   * Sampled at five points along the way, not just the middle.
   *
   * After `mergeWays` a street is one long chain, and two chains of the same
   * street rarely cover the same stretch — so the midpoint of Michigan Avenue's
   * northern chain can sit a long way from any point of its southern one, the
   * single-point test answers "no twin", and both halves get paved as whole
   * streets with their own centre line and their own pavements on both sides.
   * That is what put the player on a strip of pavement in the middle of the
   * avenue with a double yellow painted against the kerb.
   *
   * The votes are counted rather than taken first-past-the-post so one stray
   * side street running alongside cannot flip the answer.
   */
  let left = 0
  let right = 0

  for (const frac of [0.15, 0.3, 0.5, 0.7, 0.85]) {
    const i = Math.floor((points.length - 1) * frac)
    const mid = points[i]
    const next = points[i + 1] ?? points[i - 1]
    if (!mid || !next) continue

    const dx = next[0] - mid[0]
    const dz = next[1] - mid[1]
    const length = Math.hypot(dx, dz) || 1
    const rx = -dz / length
    const rz = dx / length

    for (const other of CITY.streets) {
      if (other === street || other.n !== street.n) continue
      for (const [x, z] of other.p) {
        const ox = x - mid[0]
        const oz = z - mid[1]
        const lateral = ox * rx + oz * rz
        const along = ox * -rz + oz * rx
        // Beside us rather than ahead: a twin runs alongside, a continuation
        // carries on in front.
        if (Math.abs(along) < 12 && Math.abs(lateral) > 6 && Math.abs(lateral) < 26) {
          if (lateral > 0) right++
          else left++
        }
      }
    }
  }

  if (right === 0 && left === 0) return 0
  return right >= left ? 1 : -1
}

/**
 * Chain each street's ways into as few continuous polylines as possible.
 *
 * OSM splits a street at every junction, so Michigan Avenue arrives as 56
 * separate ways. Paving each one independently means each ribbon flares at its
 * own endpoints and overlaps its neighbour's — at exactly the same height,
 * which z-fights along the whole avenue. It also restarts the distance-along
 * coordinate at every fragment, so lane dashes reset mid-block.
 *
 * Chaining by shared endpoints fixes both: one polyline per carriageway, one
 * unbroken run of markings, and nothing to fight with.
 */
function mergeWays(streets: CityStreet[]): CityStreet[] {
  const merged: CityStreet[] = []
  const byName = new Map<string, CityStreet[]>()
  for (const s of streets) {
    const list = byName.get(s.n)
    if (list) list.push(s)
    else byName.set(s.n, [s])
  }

  const JOIN = 1.5

  for (const [name, ways] of byName) {
    const pending = ways.map((w) => [...w.p])

    while (pending.length > 0) {
      const chain = pending.pop()!
      let extended = true

      while (extended) {
        extended = false
        for (let i = 0; i < pending.length; i++) {
          const other = pending[i]!
          const head = chain[0]!
          const tail = chain[chain.length - 1]!
          const otherHead = other[0]!
          const otherTail = other[other.length - 1]!

          const close = (a: [number, number], b: [number, number]) =>
            Math.hypot(a[0] - b[0], a[1] - b[1]) < JOIN

          if (close(tail, otherHead)) chain.push(...other.slice(1))
          else if (close(tail, otherTail)) chain.push(...[...other].reverse().slice(1))
          else if (close(head, otherTail)) chain.unshift(...other.slice(0, -1))
          else if (close(head, otherHead)) chain.unshift(...[...other].reverse().slice(0, -1))
          else continue

          pending.splice(i, 1)
          extended = true
          break
        }
      }

      merged.push({ n: name, p: chain })
    }
  }

  return merged
}

/** Insert points so no segment is longer than MAX_SEGMENT. */
function resample(points: Array<[number, number]>): Array<[number, number]> {
  const out: Array<[number, number]> = []
  for (let i = 0; i < points.length; i++) {
    const [x, z] = points[i]!
    out.push([x, z])
    const next = points[i + 1]
    if (!next) continue
    const steps = Math.floor(Math.hypot(next[0] - x, next[1] - z) / MAX_SEGMENT)
    for (let k = 1; k < steps; k++) {
      out.push([x + ((next[0] - x) * k) / steps, z + ((next[1] - z) * k) / steps])
    }
  }
  return out
}

/** Per-vertex direction along a polyline, averaged at the joints. */
function directions(points: Array<[number, number]>): Array<[number, number]> {
  const dirs: Array<[number, number]> = []
  for (let i = 0; i < points.length; i++) {
    let dx = 0
    let dz = 0
    if (i > 0) {
      const [ax, az] = points[i - 1]!
      const [bx, bz] = points[i]!
      const len = Math.hypot(bx - ax, bz - az) || 1
      dx += (bx - ax) / len
      dz += (bz - az) / len
    }
    if (i < points.length - 1) {
      const [ax, az] = points[i]!
      const [bx, bz] = points[i + 1]!
      const len = Math.hypot(bx - ax, bz - az) || 1
      dx += (bx - ax) / len
      dz += (bz - az) / len
    }
    const len = Math.hypot(dx, dz) || 1
    dirs.push([dx / len, dz / len])
  }
  return dirs
}

export interface CityGroundResult {
  geometry: THREE.BufferGeometry
  streetCount: number
  fillCells: number
}

/** Ray-cast point-in-polygon on the XZ plane. */
function inRing(ring: Array<[number, number]>, x: number, z: number): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i]!
    const [xj, zj] = ring[j]!
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}

/**
 * Is this covered by an authored surface?
 *
 * Streets and fill stand back where sand, water, a park or a restaurant floor
 * already covers the ground. This replaces the old test against the route's own
 * ribbon — which is the whole point of the change: what is paved is now a fact
 * about the world, not about where the camera goes.
 */
function underPatch(x: number, z: number): boolean {
  return GROUND_PATCHES.some((p) => p.cullsAbove !== false && inRing(p.ring, x, z))
}

let cached: CityGroundResult | null = null

/**
 * Memoised: deterministic input, and the height sampler needs the same
 * geometry the scene is drawing rather than a second 56,000-triangle copy of
 * it built alongside.
 */
export function buildCityGround(): CityGroundResult {
  cached ??= buildCityGroundUncached()
  return cached
}

function buildCityGroundUncached(): CityGroundResult {
  const positions: number[] = []
  const colors: number[] = []
  const grounds: number[] = []
  const surfaces: number[] = []
  const indices: number[] = []

  const colour = new THREE.Color()

  const pushVertex = (
    x: number,
    y: number,
    z: number,
    lateral: number,
    along: number,
    color: number,
    kind: SurfaceKind,
  ) => {
    positions.push(x, y, z)
    colour.setHex(color)
    colors.push(colour.r, colour.g, colour.b)
    grounds.push(lateral, along)
    surfaces.push(kind)
  }

  let streetCount = 0

  const streets = mergeWays(CITY.streets)

  /**
   * How many chains of this street name have been laid already.
   *
   * A street that survives merging as more than one chain is either a dual
   * carriageway or a piece OSM left disconnected, and in both cases the chains
   * overlap where they meet. Coplanar overlap is what z-fights, so each chain
   * of a name is laid a few centimetres below the last. Chains of *different*
   * names never need this: the dominance rule already stops the lesser one at
   * the greater one's kerb.
   */
  const chainsSoFar = new Map<string, number>()

  for (const street of streets) {
    if (street.p.length < 2) continue
    const points = resample(street.p)

    const dirs = directions(points)
    const halves = halfWidths(street, points)
    const twin = twinSide(street, points)
    const rank = streetRank(street.n)
    const chain = chainsSoFar.get(street.n) ?? 0
    chainsSoFar.set(street.n, chain + 1)
    // Three centimetres is far too small to see as a step and far too large for
    // the depth buffer to confuse at any distance the ground is visible from.
    // Six levels because Michigan and State survive merging as four and five
    // chains; capping lower puts two of them back at the same height.
    const lift = -0.03 * Math.min(chain, 5)

    /**
     * A quad stops where a more important street's carriageway already covers
     * it. Otherwise every junction is two ribbons at the same height fighting
     * for the depth buffer across the whole crossing.
     *
     * A street's twin is exempt: those are the two halves of one road and they
     * are *meant* to meet, which is handled by their heights instead.
     */
    const dominated = (x: number, z: number): boolean => {
      const other = dominantStreet(x, z)
      return other !== null && other.name !== street.n && other.rank > rank
    }
    // Streets bend too, and a ribbon offset sideways folds wherever the bend is
    // tighter than the ribbon is wide. Gentler here than on the old route
    // ribbon, but a right-angled OSM corner would still do it.
    const limits = curveLimits(
      points.map(([x, z], i) => ({ x, z, rx: -dirs[i]![1], rz: dirs[i]![0] })),
    )

    // Distance along this way, so paving and lane dashes stay continuous.
    let along = 0
    const rows: Array<{
      start: number
      x: number
      z: number
      rx: number
      rz: number
      lanes: GroundLane[]
    } | null> = []

    for (let i = 0; i < points.length; i++) {
      const [x, z] = points[i]!
      if (i > 0) {
        const [px, pz] = points[i - 1]!
        along += Math.hypot(x - px, z - pz)
      }

      const [dx, dz] = dirs[i]!
      const rx = -dz
      const rz = dx

      // Under a building — the mall bridges the street here, so there is no
      // street surface to paint. Breaking the strip is better than paving
      // through the inside of it.
      const half = halves[i]!
      if (half < MIN_HALF || buildingAt(x, z)) {
        rows.push(null)
        continue
      }

      const lanes = laneProfileFor(half, twin).map((lane) => ({
        ...lane,
        y: lane.y + lift,
        offset: applyLimits(lane.offset, limits, i),
      }))
      const start = positions.length / 3
      for (const lane of lanes) {
        pushVertex(
          x + rx * lane.offset,
          lane.y,
          z + rz * lane.offset,
          lane.offset,
          along,
          lane.color,
          lane.kind,
        )
      }
      rows.push({ start, x, z, rx, rz, lanes })
    }

    let emitted = false
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1]
      const b = rows[i]
      if (!a || !b) continue
      const lanes = a.lanes
      for (let l = 0; l < lanes.length - 1; l++) {
        // Cull per quad, testing every corner and the centre.
        //
        // Culling whole ways by their centreline was the first attempt and it
        // left Rush Street painted twice: the route ribbon is fourteen metres
        // wide and the street ribbon twelve, so two carriageways with two sets
        // of markings overlapped for the length of the block while neither
        // centreline sat inside the other. Testing only the centre was the
        // second, and it floated a cross street's pavement across the middle of
        // Delaware. Any corner overlapping is enough to drop the quad — a
        // slightly over-eager cull leaves a gap under the route ribbon, which
        // nobody can see, where an under-eager one leaves a slab in mid-air.
        const inner = lanes[l]!.offset
        const outer = lanes[l + 1]!.offset
        const mid = (inner + outer) / 2
        // A pavement is never inside a road. Rank decides which of two
        // crossing *carriageways* is paved through a junction, but it says
        // nothing about pavements — and a higher-ranked street's pavement bands
        // were being drawn straight across the carriageway it crosses, which is
        // the slabs of kerb lying in the middle of the road.
        const isWalk = lanes[l]!.kind === SURFACE.sidewalk && lanes[l + 1]!.kind === SURFACE.sidewalk

        let overlaps = false
        for (const row of [a, b] as const) {
          for (const o of [inner, mid, outer]) {
            const px = row.x + row.rx * o
            const pz = row.z + row.rz * o
            if (underPatch(px, pz) || dominated(px, pz) || (isWalk && inCarriageway(px, pz))) {
              overlaps = true
              break
            }
          }
          if (overlaps) break
        }
        if (overlaps) continue

        indices.push(
          a.start + l,
          b.start + l,
          a.start + l + 1,
          a.start + l + 1,
          b.start + l,
          b.start + l + 1,
        )
        emitted = true
      }
    }

    if (emitted) streetCount++
  }

  const fillCells = buildFill(pushVertex, indices, () => positions.length / 3)

  // Authored surfaces last, so they sit over the fill they displaced.
  for (const patch of [...GROUND_PATCHES].sort((a, b) => (a.layer ?? 0) - (b.layer ?? 0))) {
    addPatch(patch, pushVertex, indices, () => positions.length / 3)
  }

  addCutWalls(pushVertex, indices, () => positions.length / 3)

  // Ground faces up, always. Rather than get the winding right in four
  // different builders — street strips wind by which way the street bends, and
  // a hand-drawn patch winds however it was drawn — any triangle that came out
  // pointing down is flipped here.
  //
  // The old ground papered over this with `side: DoubleSide`, which hides a
  // reversed normal by lighting both faces. That works and costs a rendering
  // branch on every ground fragment, and it means nothing can ever *check* the
  // geometry is right.
  faceUp(positions, indices)

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.setAttribute('aGround', new THREE.Float32BufferAttribute(grounds, 2))
  geometry.setAttribute('aSurface', new THREE.Float32BufferAttribute(surfaces, 1))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return { geometry, streetCount, fillCells }
}

/**
 * Paving between the streets.
 *
 * A rectangle over the whole export would run out into Lake Michigan, so cells
 * only exist near a street. That keeps the fill following the city's actual
 * shape and stops at the shoreline for free, because there are no streets in
 * the lake.
 */
function buildFill(
  pushVertex: (
    x: number,
    y: number,
    z: number,
    lateral: number,
    along: number,
    color: number,
    kind: SurfaceKind,
  ) => void,
  indices: number[],
  vertexCount: () => number,
): number {
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity

  // Street points bucketed by FILL_REACH, so the proximity test reads nine
  // buckets instead of thirteen hundred points.
  const buckets = new Map<string, Array<[number, number]>>()
  const key = (cx: number, cz: number) => `${cx},${cz}`

  for (const street of CITY.streets) {
    for (const [x, z] of street.p) {
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minZ = Math.min(minZ, z)
      maxZ = Math.max(maxZ, z)
      const k = key(Math.floor(x / FILL_REACH), Math.floor(z / FILL_REACH))
      const list = buckets.get(k)
      if (list) list.push([x, z])
      else buckets.set(k, [[x, z]])
    }
  }

  const nearStreet = (x: number, z: number): boolean => {
    const cx = Math.floor(x / FILL_REACH)
    const cz = Math.floor(z / FILL_REACH)
    for (let ox = -1; ox <= 1; ox++) {
      for (let oz = -1; oz <= 1; oz++) {
        const list = buckets.get(key(cx + ox, cz + oz))
        if (!list) continue
        for (const [px, pz] of list) {
          if (Math.hypot(x - px, z - pz) <= FILL_REACH) return true
        }
      }
    }
    return false
  }

  let cells = 0

  for (let x = minX; x < maxX; x += FILL_CELL) {
    for (let z = minZ; z < maxZ; z += FILL_CELL) {
      const cx = x + FILL_CELL / 2
      const cz = z + FILL_CELL / 2
      if (!nearStreet(cx, cz)) continue

      // Dropped only when the WHOLE cell is under an authored surface.
      //
      // The opposite rule — drop on the centre — quietly took the rest of the
      // cell with it, leaving a strip of missing ground with the sky showing
      // through it. The fill is the floor of last resort: street quads above it
      // cull aggressively so they never leave a ledge sticking out of the road,
      // and this catches whatever they give up. Ground hidden underneath costs
      // nothing; a hole does not.
      const corners: Array<[number, number]> = [
        [x, z],
        [x + FILL_CELL, z],
        [x, z + FILL_CELL],
        [x + FILL_CELL, z + FILL_CELL],
        [cx, cz],
      ]
      if (corners.every(([px, pz]) => underPatch(px, pz))) continue

      const base = vertexCount()
      // Lateral/along are just world coordinates here: the fill has no
      // centreline, and the paving grid only needs to be continuous.
      pushVertex(x, FILL_Y, z, x, z, FILL_COLOR, FILL_KIND)
      pushVertex(x + FILL_CELL, FILL_Y, z, x + FILL_CELL, z, FILL_COLOR, FILL_KIND)
      pushVertex(x, FILL_Y, z + FILL_CELL, x, z + FILL_CELL, FILL_COLOR, FILL_KIND)
      pushVertex(
        x + FILL_CELL,
        FILL_Y,
        z + FILL_CELL,
        x + FILL_CELL,
        z + FILL_CELL,
        FILL_COLOR,
        FILL_KIND,
      )
      indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3)
      cells++
    }
  }

  return cells
}

/**
 * One authored surface, triangulated.
 *
 * Ear clipping via three's own `ShapeUtils`, so a mildly concave outline works
 * and nothing here has to reimplement a triangulator. The pattern frame is
 * rotated per patch: sand ripples have to run along the shore, and floorboards
 * along the room, neither of which is aligned to the world axes.
 */
function addPatch(
  patch: GroundPatch,
  pushVertex: (
    x: number,
    y: number,
    z: number,
    lateral: number,
    along: number,
    color: number,
    kind: SurfaceKind,
  ) => void,
  indices: number[],
  vertexCount: () => number,
): void {
  const angle = patch.patternAngle ?? 0
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)

  const base = vertexCount()
  patch.ring.forEach(([x, z], i) => {
    const y = patch.heights?.[i] ?? patch.y
    pushVertex(x, y, z, x * cos - z * sin, x * sin + z * cos, patch.color, patch.kind)
  })

  const contour = patch.ring.map(([x, z]) => new THREE.Vector2(x, z))
  for (const face of THREE.ShapeUtils.triangulateShape(contour, [])) {
    const [a, b, c] = face
    if (a === undefined || b === undefined || c === undefined) continue
    // Reversed, because +Z is south: a ring wound clockwise on the map is
    // counter-clockwise seen from above, and a downward normal renders black.
    indices.push(base + a, base + c, base + b)
  }
}

/**
 * Flip any triangle whose normal points downwards.
 *
 * Skips vertical faces: the retaining walls of the underpass are deliberately
 * upright, their Y normal is zero, and "make it face up" is meaningless for
 * them — applying it would flip them at random depending on rounding.
 */
function faceUp(positions: number[], indices: number[]): void {
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i]! * 3
    const b = indices[i + 1]! * 3
    const c = indices[i + 2]! * 3

    const ux = positions[b]! - positions[a]!
    const uz = positions[b + 2]! - positions[a + 2]!
    const vx = positions[c]! - positions[a]!
    const vz = positions[c + 2]! - positions[a + 2]!

    const normalY = uz * vx - ux * vz
    const spanY =
      Math.max(positions[a + 1]!, positions[b + 1]!, positions[c + 1]!) -
      Math.min(positions[a + 1]!, positions[b + 1]!, positions[c + 1]!)
    if (spanY > 0.5 && Math.abs(normalY) < spanY) continue

    if (normalY < 0) {
      const swap = indices[i + 1]!
      indices[i + 1] = indices[i + 2]!
      indices[i + 2] = swap
    }
  }
}

/**
 * The sides of the underpass cut.
 *
 * The floor is five metres down and the ground either side is at grade, and
 * ground faces up — so from inside the trench there was simply nothing between
 * the floor and the sky, and you could see straight out through the sides into
 * the city. A dark tunnel sky hid it; a daylight one does not.
 *
 * These are the retaining walls, and they belong to the ground rather than to
 * the props: a wall built from separate panels leaves gaps at every joint on a
 * curve, which is exactly what you would see through.
 */
function addCutWalls(
  pushVertex: (
    x: number,
    y: number,
    z: number,
    lateral: number,
    along: number,
    color: number,
    kind: SurfaceKind,
  ) => void,
  indices: number[],
  vertexCount: () => number,
): void {
  const WALL_COLOR = 0x6f6a61
  const TOP = 0.06

  /**
   * Wall lines offset from the path with mitred corners.
   *
   * Built per segment, each quad used its own segment's normal, so at every
   * bend segment i's far edge and segment i+1's near edge sat at different
   * lateral positions — the wall came apart into leaning panels with daylight
   * between them, which is most of what read as a janky underpass.
   *
   * Averaging the two adjacent segment normals at each vertex makes consecutive
   * quads share their endpoints exactly, so the wall is continuous by
   * construction rather than by luck.
   */
  const normals: Array<[number, number]> = []
  for (let i = 0; i < UNDERPASS_PATH.length; i++) {
    const prev = UNDERPASS_PATH[Math.max(0, i - 1)]!
    const next = UNDERPASS_PATH[Math.min(UNDERPASS_PATH.length - 1, i + 1)]!
    const dx = next[0] - prev[0]
    const dz = next[2] - prev[2]
    const length = Math.hypot(dx, dz) || 1
    normals.push([-dz / length, dx / length])
  }

  let along = 0
  for (let i = 1; i < UNDERPASS_PATH.length; i++) {
    const [ax, ay, az] = UNDERPASS_PATH[i - 1]!
    const [bx, by, bz] = UNDERPASS_PATH[i]!
    const [arx, arz] = normals[i - 1]!
    const [brx, brz] = normals[i]!
    const length = Math.hypot(bx - ax, bz - az) || 1

    // Nothing to retain where the ramp has climbed back to street level. Tested
    // per end rather than per segment, so the wall tapers out instead of
    // stopping dead one segment early.
    const aHeight = TOP - ay
    const bHeight = TOP - by
    if (aHeight < 0.08 && bHeight < 0.08) {
      along += length
      continue
    }

    for (const side of [-1, 1] as const) {
      const x0 = ax + arx * UNDERPASS_HALF * side
      const z0 = az + arz * UNDERPASS_HALF * side
      const x1 = bx + brx * UNDERPASS_HALF * side
      const z1 = bz + brz * UNDERPASS_HALF * side

      const base = vertexCount()
      pushVertex(x0, ay, z0, along, 0, WALL_COLOR, SURFACE.concrete)
      pushVertex(x1, by, z1, along + length, 0, WALL_COLOR, SURFACE.concrete)
      pushVertex(x1, TOP, z1, along + length, Math.abs(bHeight), WALL_COLOR, SURFACE.concrete)
      pushVertex(x0, TOP, z0, along, Math.abs(aHeight), WALL_COLOR, SURFACE.concrete)

      // Wound to face into the cut, which is the only side anyone sees.
      if (side < 0) indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
      else indices.push(base, base + 2, base + 1, base, base + 3, base + 2)

      /**
       * A parapet standing above the wall.
       *
       * An upstand, not a flat coping laid over the pavement: a horizontal band
       * at street level is coplanar with the street it sits on, and the ground
       * sweep caught it z-fighting along the whole length of the cut.
       */
      const PARAPET = 0.42
      const cap = vertexCount()
      pushVertex(x0, TOP, z0, along, 0, 0x8a857b, SURFACE.concrete)
      pushVertex(x1, TOP, z1, along + length, 0, 0x8a857b, SURFACE.concrete)
      pushVertex(x1, TOP + PARAPET, z1, along + length, PARAPET, 0x8a857b, SURFACE.concrete)
      pushVertex(x0, TOP + PARAPET, z0, along, PARAPET, 0x8a857b, SURFACE.concrete)
      if (side < 0) indices.push(cap, cap + 1, cap + 2, cap, cap + 2, cap + 3)
      else indices.push(cap, cap + 2, cap + 1, cap, cap + 3, cap + 2)
    }

    along += length
  }
}

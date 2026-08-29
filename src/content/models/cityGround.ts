import * as THREE from 'three'

import { SURFACE, type SurfaceKind } from '@/render/ground'

import { CITY, type CityStreet } from './city'
import { ASPHALT, SIDEWALK } from './environment'
import { buildingAt, lateralClearance } from './footprints'
import { applyLimits, curveLimits } from './ribbon'
import { GROUND_PATCHES, type GroundPatch } from './patches'
import { carriagewayHalfWidth } from './streetWidths'

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
const FILL_Y = -0.1

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
const FILL_COLOR = 0x8b8377

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

function laneProfileFor(half: number): GroundLane[] {
  return [
    { offset: -(half + KERB + WALK), y: WALK_Y, color: SIDEWALK, kind: SURFACE.sidewalk },
    { offset: -(half + KERB), y: WALK_Y, color: SIDEWALK, kind: SURFACE.sidewalk },
    { offset: -half, y: ROAD_Y, color: ASPHALT, kind: SURFACE.asphalt },
    { offset: half, y: ROAD_Y, color: ASPHALT, kind: SURFACE.asphalt },
    { offset: half + KERB, y: WALK_Y, color: SIDEWALK, kind: SURFACE.sidewalk },
    { offset: half + KERB + WALK, y: WALK_Y, color: SIDEWALK, kind: SURFACE.sidewalk },
  ]
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
  return GROUND_PATCHES.some((p) => inRing(p.ring, x, z))
}

export function buildCityGround(): CityGroundResult {
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

  for (const street of CITY.streets) {
    if (street.p.length < 2) continue
    const points = resample(street.p)

    const dirs = directions(points)
    const halves = halfWidths(street, points)
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

      const lanes = laneProfileFor(half).map((lane) => ({
        ...lane,
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
        let overlaps = false
        for (const row of [a, b] as const) {
          for (const o of [inner, mid, outer]) {
            if (underPatch(row.x + row.rx * o, row.z + row.rz * o)) {
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
      pushVertex(x, FILL_Y, z, x, z, FILL_COLOR, SURFACE.sidewalk)
      pushVertex(x + FILL_CELL, FILL_Y, z, x + FILL_CELL, z, FILL_COLOR, SURFACE.sidewalk)
      pushVertex(x, FILL_Y, z + FILL_CELL, x, z + FILL_CELL, FILL_COLOR, SURFACE.sidewalk)
      pushVertex(
        x + FILL_CELL,
        FILL_Y,
        z + FILL_CELL,
        x + FILL_CELL,
        z + FILL_CELL,
        FILL_COLOR,
        SURFACE.sidewalk,
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
  for (const [x, z] of patch.ring) {
    pushVertex(x, patch.y, z, x * cos - z * sin, x * sin + z * cos, patch.color, patch.kind)
  }

  const contour = patch.ring.map(([x, z]) => new THREE.Vector2(x, z))
  for (const face of THREE.ShapeUtils.triangulateShape(contour, [])) {
    const [a, b, c] = face
    if (a === undefined || b === undefined || c === undefined) continue
    // Reversed, because +Z is south: a ring wound clockwise on the map is
    // counter-clockwise seen from above, and a downward normal renders black.
    indices.push(base + a, base + c, base + b)
  }
}

/** Flip any triangle whose normal points downwards. */
function faceUp(positions: number[], indices: number[]): void {
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i]! * 3
    const b = indices[i + 1]! * 3
    const c = indices[i + 2]! * 3

    const ux = positions[b]! - positions[a]!
    const uz = positions[b + 2]! - positions[a + 2]!
    const vx = positions[c]! - positions[a]!
    const vz = positions[c + 2]! - positions[a + 2]!

    if (uz * vx - ux * vz < 0) {
      const swap = indices[i + 1]!
      indices[i + 1] = indices[i + 2]!
      indices[i + 2] = swap
    }
  }
}

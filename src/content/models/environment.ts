import * as THREE from 'three'

import type { RouteDef, SectionKind } from '@/content/routes/types'
import type { Rail } from '@/game/rail'
import type { ResolvedSection } from '@/game/sections'
import { makeRng, pick, range, rangeInt } from '@/lib/rng'
import { SURFACE, type SurfaceKind } from '@/render/ground'

import { applyLimits, curveLimits } from './ribbon'

/**
 * Route-following environment generation.
 *
 * The old generator laid a straight street down the Z axis. This one walks the
 * spline, so the world follows the route through Oak Street's turn onto Rush and
 * around Mariano Park without any of it being hand-placed.
 *
 * Two outputs:
 *
 *  - A **ground ribbon**: one vertex-coloured mesh covering sand, road,
 *    sidewalk, tunnel floor and interior flooring for the entire route. A curved
 *    path can't be paved with stretched boxes, and a ribbon is one draw call for
 *    all 540 m.
 *  - **Side props**: instanced boxes placed perpendicular to the path, with the
 *    mix chosen per section kind.
 *
 * Deterministic from the route seed, so the world is identical every load —
 * photo scores have to be comparable between runs.
 */

export interface Prop {
  position: [number, number, number]
  scale: [number, number, number]
  rotationY: number
  color: number
  segment: number
}

/** One lateral lane of the ground ribbon, offset from the centreline. */
export interface Lane {
  /** Metres right of the path centre. Negative is left. */
  offset: number
  /** Height above grade. */
  height: number
  color: number
  /**
   * Which material this edge of the ribbon is made of.
   *
   * Two adjacent lanes sharing a kind make a solid band; two differing make a
   * boundary, and the ground shader draws the kerb, shoreline or lawn edge that
   * belongs there. Which is why the profiles below pair their lanes up: a band
   * needs both its edges to agree, or the material blends across the whole
   * width instead of meeting at a line.
   */
  kind: SurfaceKind
}

export interface EnvironmentData {
  /** Vertex-coloured ground for the whole route. One draw call. */
  ground: THREE.BufferGeometry
  buildings: Prop[]
  poles: Prop[]
  heads: Prop[]
  clutter: Prop[]
  /**
   * Buildings on streets the player never walks — the grid running south to the
   * river. Never gated: they exist to be seen from a long way off, and they are
   * one instanced draw call regardless of count.
   */
  skyline: Prop[]
}

// ---------------------------------------------------------------------------
// Per-section lateral profiles
// ---------------------------------------------------------------------------

export const SAND = 0xd8c9a4
export const ASPHALT = 0x44484f
export const SIDEWALK = 0x9a9184
const TUNNEL_FLOOR = 0x4a4540
const PARK_GREEN = 0x5f7247
const ALLEY_FLOOR = 0x3f3c37
const INTERIOR_FLOOR = 0x4a3526
const LAKE_SHALLOW = 0x6f9bb0
const LAKE_DEEP = 0x3f6d8c

/**
 * The cross-section of each kind of place, left to right.
 *
 * These widths are what make each act *feel* different before a single building
 * exists: the beach is 60 m across, the alley is 4.
 */
export function laneProfile(kind: SectionKind): Lane[] {
  switch (kind) {
    case 'beach':
      // Much wider than the other sections, and deliberately so: this is the
      // only place with an open horizon, and the ribbon has to reach far enough
      // that the player sees lake and shoreline rather than empty sky where the
      // ground stops. Lake is to the right of travel (east), city to the left.
      return [
        { offset: -70, height: 0.4, color: 0x9a8f78, kind: SURFACE.sand },
        { offset: -26, height: 0.1, color: SAND, kind: SURFACE.sand },
        { offset: -6, height: 0.05, color: SAND, kind: SURFACE.sand },
        // Wet sand, then a metre and a bit of waterline. The narrow gap is the
        // whole point: it's the band the shader fills with foam, and an eight
        // metre ramp into the lake gave a soft gradient where a beach has a
        // hard, wandering edge.
        { offset: 13, height: 0.0, color: 0xcabb95, kind: SURFACE.sand },
        { offset: 14.4, height: -0.06, color: LAKE_SHALLOW, kind: SURFACE.water },
        { offset: 26, height: -0.35, color: LAKE_SHALLOW, kind: SURFACE.water },
        { offset: 150, height: -0.5, color: LAKE_DEEP, kind: SURFACE.water },
      ]
    case 'tunnel':
      return [
        { offset: -3.4, height: 0.0, color: TUNNEL_FLOOR, kind: SURFACE.concrete },
        { offset: 0, height: 0.0, color: 0x555049, kind: SURFACE.concrete },
        { offset: 3.4, height: 0.0, color: TUNNEL_FLOOR, kind: SURFACE.concrete },
      ]
    case 'avenue':
      return [
        { offset: -19, height: 0.16, color: SIDEWALK, kind: SURFACE.sidewalk },
        { offset: -9, height: 0.16, color: SIDEWALK, kind: SURFACE.sidewalk },
        { offset: -8.4, height: 0.0, color: ASPHALT, kind: SURFACE.asphalt },
        { offset: 8.4, height: 0.0, color: ASPHALT, kind: SURFACE.asphalt },
        { offset: 9, height: 0.16, color: SIDEWALK, kind: SURFACE.sidewalk },
        { offset: 19, height: 0.16, color: SIDEWALK, kind: SURFACE.sidewalk },
      ]
    case 'boutique':
      return [
        { offset: -13, height: 0.16, color: SIDEWALK, kind: SURFACE.sidewalk },
        { offset: -6, height: 0.16, color: 0xa39a8b, kind: SURFACE.sidewalk },
        { offset: -5.4, height: 0.0, color: ASPHALT, kind: SURFACE.asphalt },
        { offset: 5.4, height: 0.0, color: ASPHALT, kind: SURFACE.asphalt },
        { offset: 6, height: 0.16, color: 0xa39a8b, kind: SURFACE.sidewalk },
        { offset: 13, height: 0.16, color: SIDEWALK, kind: SURFACE.sidewalk },
      ]
    case 'dining':
      return [
        { offset: -14, height: 0.16, color: 0x9c9384, kind: SURFACE.sidewalk },
        { offset: -6.2, height: 0.16, color: 0x9c9384, kind: SURFACE.sidewalk },
        { offset: -5.6, height: 0.0, color: ASPHALT, kind: SURFACE.asphalt },
        { offset: 5.6, height: 0.0, color: ASPHALT, kind: SURFACE.asphalt },
        { offset: 6.2, height: 0.16, color: 0x9c9384, kind: SURFACE.sidewalk },
        { offset: 14, height: 0.16, color: 0x9c9384, kind: SURFACE.sidewalk },
      ]
    case 'park':
      // The lawn used to blend into the pavement across eight metres. Paired
      // edges give Mariano Park a hard mown line, which is what a city park
      // actually has and what the reference art would draw.
      return [
        { offset: -15, height: 0.16, color: SIDEWALK, kind: SURFACE.sidewalk },
        { offset: -7.6, height: 0.16, color: SIDEWALK, kind: SURFACE.sidewalk },
        { offset: -7, height: 0.2, color: PARK_GREEN, kind: SURFACE.park },
        { offset: 7, height: 0.2, color: PARK_GREEN, kind: SURFACE.park },
        { offset: 7.6, height: 0.16, color: SIDEWALK, kind: SURFACE.sidewalk },
        { offset: 15, height: 0.16, color: SIDEWALK, kind: SURFACE.sidewalk },
      ]
    case 'alley':
      return [
        { offset: -2.6, height: 0.0, color: ALLEY_FLOOR, kind: SURFACE.concrete },
        { offset: 2.6, height: 0.0, color: ALLEY_FLOOR, kind: SURFACE.concrete },
      ]
    case 'interior':
      return [
        { offset: -2.4, height: 0.0, color: INTERIOR_FLOOR, kind: SURFACE.interior },
        { offset: 0, height: 0.0, color: 0x53402f, kind: SURFACE.interior },
        { offset: 2.4, height: 0.0, color: INTERIOR_FLOOR, kind: SURFACE.interior },
      ]
  }
}

// ---------------------------------------------------------------------------

const BUILDING_COLORS: Record<string, number[]> = {
  // Michigan Avenue: limestone, terracotta, dark granite.
  avenue: [0xcfc4ad, 0xb9a88c, 0x6f6a63, 0xa8917a, 0x8d99a8],
  // Oak Street: pale low-rise boutiques.
  boutique: [0xded3bd, 0xc9bda6, 0xb0a894, 0xd6cdbe],
  // Rush Street: warmer brick and painted stucco.
  dining: [0x9c6a52, 0xb08163, 0x8a6b55, 0xc0a184],
  park: [0xa89880, 0x8f8471, 0xbfae94],
  alley: [0x6b6155, 0x5c554b],
  interior: [0x5a3f2c, 0x6b4a33],
  beach: [0xbfb49c],
  tunnel: [0x3e3934],
}

/**
 * Build the ground ribbon.
 *
 * Steps along the spline emitting one row of vertices per lane, then stitches
 * consecutive rows into quads. Because rows come from `getPointAt`, the surface
 * follows every curve of the route exactly.
 */
function buildGround(
  rail: Rail,
  sections: ResolvedSection[],
  stepMetres = 4,
): THREE.BufferGeometry {
  const totalLength = rail.length
  const steps = Math.max(2, Math.ceil(totalLength / stepMetres))

  const positions: number[] = []
  const colors: number[] = []
  // Metres across and metres along, so the shader can size paving and place
  // road markings in real units rather than in normalised UVs — a slab has to
  // be the same square on a 5 m alley and a 38 m avenue.
  const grounds: number[] = []
  const surfaces: number[] = []
  const indices: number[] = []

  const point = new THREE.Vector3()
  const right = new THREE.Vector3()
  const colour = new THREE.Color()

  // Every row's centre and right vector up front, so each row can see the step
  // after it and know how hard the route is turning there.
  const centres: THREE.Vector3[] = []
  const rights: THREE.Vector3[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const p = new THREE.Vector3()
    const r = new THREE.Vector3()
    rail.positionAt(t, p)
    rail.rightAt(t, r)
    centres.push(p)
    rights.push(r)
  }

  // Offset limits that stop the ribbon folding at the corners. See ribbon.ts.
  const limits = curveLimits(
    centres.map((c, i) => ({ x: c.x, z: c.z, rx: rights[i]!.x, rz: rights[i]!.z })),
  )

  // Rows can differ in lane count between section kinds, so stitch only where
  // consecutive rows agree — a mismatch means a section boundary, and a visible
  // seam there is better than a twisted ribbon.
  let previousRow: { start: number; lanes: number } | null = null

  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const section = sectionFor(sections, t)
    const lanes = laneProfile(section.kind)
    const shift = section.ribbonShift ?? 0

    point.copy(centres[i]!)
    right.copy(rights[i]!)

    const rowStart = positions.length / 3

    for (const lane of lanes) {
      const offset = applyLimits(lane.offset + shift, limits, i)
      positions.push(
        point.x + right.x * offset,
        // Waypoints sit at eye height; ground is below that.
        point.y - 1.7 + lane.height,
        point.z + right.z * offset,
      )
      colour.setHex(lane.color)
      colors.push(colour.r, colour.g, colour.b)
      grounds.push(offset, t * totalLength)
      surfaces.push(lane.kind)
    }

    if (previousRow && previousRow.lanes === lanes.length) {
      for (let l = 0; l < lanes.length - 1; l++) {
        const a = previousRow.start + l
        const b = previousRow.start + l + 1
        const c = rowStart + l
        const d = rowStart + l + 1
        indices.push(a, c, b, b, c, d)
      }
    }

    previousRow = { start: rowStart, lanes: lanes.length }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.setAttribute('aGround', new THREE.Float32BufferAttribute(grounds, 2))
  geometry.setAttribute('aSurface', new THREE.Float32BufferAttribute(surfaces, 1))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function sectionFor(sections: ResolvedSection[], t: number): ResolvedSection {
  for (const s of sections) {
    if (t >= s.tStart && t < s.tEnd) return s
  }
  return sections[sections.length - 1]!
}

/**
 * Place props alongside the path.
 *
 * Walks each section at its own cadence and offset, so Michigan Avenue gets
 * towers set well back while the alley gets bins two metres from your shoulder.
 */
function buildProps(
  route: RouteDef,
  rail: Rail,
  sections: ResolvedSection[],
): Pick<EnvironmentData, 'buildings' | 'poles' | 'heads' | 'clutter'> {
  const rng = makeRng(route.seed)
  const buildings: Prop[] = []
  const poles: Prop[] = []
  const heads: Prop[] = []
  const clutter: Prop[] = []

  const point = new THREE.Vector3()
  const right = new THREE.Vector3()

  const at = (t: number, offset: number): [number, number, number] => {
    rail.positionAt(t, point)
    rail.rightAt(t, right)
    return [point.x + right.x * offset, point.y - 1.7, point.z + right.z * offset]
  }

  const headingAt = (t: number) => rail.headingAt(t)

  for (const section of sections) {
    const palette = BUILDING_COLORS[section.kind] ?? BUILDING_COLORS.avenue!
    const spanMetres = (section.tEnd - section.tStart) * rail.length
    // Everything on the street is placed relative to the street, not the rail.
    // Lampposts at a fixed offset from a rail that runs along the sidewalk end
    // up standing in the carriageway.
    const shift = section.ribbonShift ?? 0

    // Frontage width, setback from the kerb, and height range per kind. Null
    // for every outdoor section, because OSM supplies real footprints there —
    // only the tunnel, alley and restaurant interior still need massing.
    //
    // This used to `continue` on null, which quietly took the street furniture,
    // the clutter and the patios with it: since the OSM import, not one
    // lamppost, bin or planter had been placed on any street the player walks
    // down. That is most of why the route reads as deserted.
    const spec = frontageSpec(section.kind)
    const count = spec ? Math.max(1, Math.round(spanMetres / spec.frontage)) : 0

    for (let side of [-1, 1] as const) {
      for (let i = 0; spec && i < count; i++) {
        // Skip the occasional plot so the street reads as buildings, not a wall.
        if (rng() < spec.gapChance) continue

        const t = section.tStart + ((i + 0.5) / count) * (section.tEnd - section.tStart)
        const depth = range(rng, spec.depth[0], spec.depth[1])
        const height = range(rng, spec.height[0], spec.height[1])
        const width = range(rng, spec.frontage * 0.8, spec.frontage * 1.05)
        const offset = shift + side * (spec.setback + depth / 2)

        const [x, y, z] = at(t, offset)
        buildings.push({
          position: [x, y + height / 2, z],
          scale: [depth, height, width],
          rotationY: headingAt(t),
          color: pick(rng, palette),
          segment: Math.min(route.segmentCount - 1, Math.floor(t * route.segmentCount)),
        })
      }
    }

    // Street furniture: lampposts outdoors, pipes and bins in the alley,
    // trees in the park.
    const furniture = furnitureSpec(section.kind)
    if (furniture) {
      const spacing = Math.max(1, Math.round(spanMetres / furniture.spacing))
      const lanes = laneProfile(section.kind)
      const edges = furniture.from && lanes.length >= 6 ? {
        // outer (frontage) and inner (kerb) edge of each sidewalk, shifted onto
        // the real street.
        frontage: [lanes[0]!.offset + shift, lanes[5]!.offset + shift] as const,
        kerb: [lanes[1]!.offset + shift, lanes[4]!.offset + shift] as const,
      } : null

      const lateralFor = (side: -1 | 1): number => {
        if (!edges) return shift + side * furniture.offset
        const inset = furniture.inset ?? 1.2
        const pair = edges[furniture.from!]
        return side < 0
          ? (furniture.from === 'kerb' ? pair[0] - inset : pair[0] + inset)
          : (furniture.from === 'kerb' ? pair[1] + inset : pair[1] - inset)
      }

      for (let side of [-1, 1] as const) {
        for (let i = 0; i < spacing; i++) {
          const t =
            section.tStart + ((i + 0.35) / spacing) * (section.tEnd - section.tStart)
          const [x, y, z] = at(t, lateralFor(side))
          const segment = Math.min(
            route.segmentCount - 1,
            Math.floor(t * route.segmentCount),
          )

          poles.push({
            position: [x, y + furniture.poleHeight / 2, z],
            scale: [furniture.poleWidth, furniture.poleHeight, furniture.poleWidth],
            rotationY: headingAt(t),
            color: furniture.poleColor,
            segment,
          })
          heads.push({
            position: [x, y + furniture.poleHeight + furniture.headSize[1] / 2, z],
            scale: furniture.headSize,
            rotationY: headingAt(t),
            color: furniture.headColor,
            segment,
          })
        }
      }
    }

    // Loose clutter — bins, planters, patio tables. Also gives the occlusion
    // term something to work with, which is what makes hiding subjects possible.
    const clutterCount = rangeInt(rng, 2, Math.max(3, Math.round(spanMetres / 12)))
    const clutterSpec = clutterOffsets(section.kind)
    for (let i = 0; i < clutterCount; i++) {
      const t = range(rng, section.tStart, section.tEnd)
      const side = rng() < 0.5 ? -1 : 1
      const [x, y, z] = at(t, shift + side * range(rng, clutterSpec[0], clutterSpec[1]))
      const size = range(rng, 0.6, 1.2)
      clutter.push({
        position: [x, y + size / 2, z],
        scale: [size, size * range(rng, 0.8, 1.5), size],
        rotationY: range(rng, 0, Math.PI),
        color: pick(rng, [0x2f4f3a, 0x384b52, 0x4a3f38, 0x6b5a44]),
        segment: Math.min(route.segmentCount - 1, Math.floor(t * route.segmentCount)),
      })
    }

    if (section.kind === 'dining') {
      addPatios(section, route, rail.length, rng, at, poles, heads, clutter)
    }
  }

  return { buildings, poles, heads, clutter }
}

/**
 * The strip the whole route exists to photograph.
 *
 * Rush Street was a correctly-paved, correctly-lit, entirely empty road. The
 * dining is the reason the section is called dining and the reason the escorts
 * and the old men are standing there, and none of it was built.
 *
 * Patios go against the building line rather than at a fixed offset, because
 * the sidewalk is not where it used to be — `ribbonShift` slid the street off
 * the rail and onto the real one, so the bands are read out of the lane profile
 * instead of hardcoded.
 */
function addPatios(
  section: ResolvedSection,
  route: RouteDef,
  railLength: number,
  rng: () => number,
  at: (t: number, offset: number) => [number, number, number],
  poles: Prop[],
  heads: Prop[],
  clutter: Prop[],
): void {
  const lanes = laneProfile(section.kind)
  const shift = section.ribbonShift ?? 0
  if (lanes.length < 6) return

  // Outer half of each sidewalk: tables sit against the frontage, not the kerb.
  const zones: Array<[number, number]> = [
    [lanes[0]!.offset + shift, lanes[0]!.offset + shift + 4.5],
    [lanes[5]!.offset + shift - 4.5, lanes[5]!.offset + shift],
  ]

  const span = section.tEnd - section.tStart
  const spanMetres = span * railLength
  // One cluster every eight metres, alternating sides.
  const clusters = Math.max(6, Math.round(spanMetres / 8))
  /** Metres along the route, as a fraction of t. */
  const perMetre = 1 / railLength
  const segmentOf = (t: number) =>
    Math.min(route.segmentCount - 1, Math.floor(t * route.segmentCount))

  const CANOPY = [0xc4553f, 0x2f7d74, 0xd8a53f, 0x8f4a63]

  for (let i = 0; i < clusters; i++) {
    const t = section.tStart + ((i + 0.5) / clusters) * span
    const zone = zones[i % 2]!
    const base = range(rng, zone[0], zone[1])
    const segment = segmentOf(t)

    const table = at(t, base)
    clutter.push({
      position: [table[0], table[1] + 0.36, table[2]],
      scale: [0.95, 0.72, 0.95],
      rotationY: range(rng, 0, Math.PI),
      color: 0x4a3a2c,
      segment,
    })

    // Chairs around it. Offsetting both laterally and along the route keeps a
    // cluster from reading as a row.
    const chairs = rangeInt(rng, 2, 4)
    for (let c = 0; c < chairs; c++) {
      const angle = (c / chairs) * Math.PI * 2 + range(rng, -0.3, 0.3)
      const dt = Math.cos(angle) * 0.95 * perMetre
      const seat = at(t + dt, base + Math.sin(angle) * 0.95)
      clutter.push({
        position: [seat[0], seat[1] + 0.45, seat[2]],
        scale: [0.44, 0.9, 0.44],
        rotationY: angle,
        color: 0x36302a,
        segment,
      })
    }

    // Umbrella: a thin pole and a flat canopy, in the one saturated colour on
    // the street. At dawn the whole strip is grey-blue, and these are what make
    // it read as a place people go to.
    if (rng() < 0.75) {
      poles.push({
        position: [table[0], table[1] + 1.1, table[2]],
        scale: [0.09, 2.2, 0.09],
        rotationY: 0,
        color: 0x2a2620,
        segment,
      })
      heads.push({
        position: [table[0], table[1] + 2.3, table[2]],
        scale: [2.5, 0.14, 2.5],
        rotationY: range(rng, 0, Math.PI / 2),
        color: pick(rng, CANOPY),
        segment,
      })
    }

    // A planter marking the patio's edge toward the road.
    if (rng() < 0.55) {
      const kerbward = zone[0] < 0 ? zone[1] + 1.2 : zone[0] - 1.2
      const planter = at(t + range(rng, -1.5, 1.5) * perMetre, kerbward)
      clutter.push({
        position: [planter[0], planter[1] + 0.4, planter[2]],
        scale: [0.8, 0.8, 0.8],
        rotationY: range(rng, 0, Math.PI),
        color: pick(rng, [0x3f5a3a, 0x4a5f42, 0x55483a]),
        segment,
      })
    }
  }
}

interface FrontageSpec {
  frontage: number
  setback: number
  depth: [number, number]
  height: [number, number]
  gapChance: number
}

/**
 * Frontage rules for the *enclosures* only.
 *
 * Outdoor massing now comes from real OpenStreetMap footprints, so the
 * generator no longer invents buildings for the street sections — it would just
 * z-fight the real ones. What OSM cannot supply is the inside of things: tunnel
 * walls, the alley's flanks, the restaurant's shell. Those stay procedural.
 */
function frontageSpec(kind: SectionKind): FrontageSpec | null {
  switch (kind) {
    case 'beach':
    case 'avenue':
    case 'boutique':
    case 'dining':
    case 'park':
      return null
    case 'tunnel':
      // The tunnel's "buildings" are its walls — tall, tight, unbroken.
      return { frontage: 8, setback: 3.6, depth: [1.2, 1.6], height: [4, 4.4], gapChance: 0 }
    case 'alley':
      return { frontage: 10, setback: 2.8, depth: [10, 16], height: [16, 30], gapChance: 0 }
    case 'interior':
      // Walls and ceiling of the restaurant.
      return { frontage: 6, setback: 2.6, depth: [1, 1.4], height: [3.4, 3.6], gapChance: 0 }
  }
}

interface FurnitureSpec {
  spacing: number
  /**
   * Where on the sidewalk this stands.
   *
   * `kerb` puts it a short step in from the road — lampposts, street trees.
   * `frontage` puts it against the building — awnings. Both are measured from
   * the lane profile rather than from the rail, because the rail runs along the
   * sidewalk's inner edge: a fixed offset from the street's centre put Rush
   * Street's awnings 10 cm from the camera, filling a quarter of the frame.
   */
  from?: 'kerb' | 'frontage'
  /** Metres in from whichever edge `from` names. */
  inset?: number
  /** Fallback lateral offset for kinds with no kerb — beach, park, tunnel. */
  offset: number
  poleHeight: number
  poleWidth: number
  poleColor: number
  headSize: [number, number, number]
  headColor: number
}

function furnitureSpec(kind: SectionKind): FurnitureSpec | null {
  switch (kind) {
    case 'avenue':
      // Chicago's double-globe standards, plus the flagpoles that give the
      // Mag Mile its silhouette.
      return {
        spacing: 22, from: 'kerb', inset: 1.4, offset: 9.6, poleHeight: 5.2, poleWidth: 0.18,
        poleColor: 0x2f3238, headSize: [0.5, 0.5, 0.5], headColor: 0xffe9c0,
      }
    case 'boutique':
      // Street trees: trunk and canopy through the same instanced pair.
      return {
        spacing: 12, from: 'kerb', inset: 1.6, offset: 6.6, poleHeight: 3.4, poleWidth: 0.26,
        poleColor: 0x5a4636, headSize: [3.4, 2.6, 3.4], headColor: 0x5d7a46,
      }
    case 'dining':
      // Awnings, against the frontage they belong to.
      return {
        spacing: 10, from: 'frontage', inset: 1.6, offset: 6.8, poleHeight: 2.6, poleWidth: 0.12,
        poleColor: 0x2b2b2b, headSize: [3.0, 0.32, 3.0], headColor: 0x8d2f2f,
      }
    case 'park':
      return {
        spacing: 9, offset: 5.2, poleHeight: 3.8, poleWidth: 0.3,
        poleColor: 0x574434, headSize: [4.2, 3.0, 4.2], headColor: 0x557040,
      }
    case 'beach':
      return {
        spacing: 30, offset: 11, poleHeight: 3.2, poleWidth: 0.14,
        poleColor: 0x6b6255, headSize: [0.4, 0.4, 0.4], headColor: 0xf0e6cf,
      }
    default:
      return null
  }
}

function clutterOffsets(kind: SectionKind): [number, number] {
  switch (kind) {
    case 'beach':
      return [6, 20]
    case 'tunnel':
      return [1.8, 3.0]
    case 'alley':
      return [1.4, 2.4]
    case 'interior':
      return [1.2, 2.2]
    case 'park':
      return [4, 12]
    default:
      return [6.5, 12]
  }
}

/**
 * Buildings along a corridor the route never walks.
 *
 * Walks the polyline placing frontages perpendicular to the local direction, so
 * a corridor that bends still gets buildings squared to the street rather than
 * to the world axes.
 */
function buildCorridors(route: RouteDef): Prop[] {
  const props: Prop[] = []
  if (!route.corridors) return props

  const rng = makeRng(route.seed ^ 0x9e3779b9)

  for (const corridor of route.corridors) {
    for (let leg = 0; leg < corridor.path.length - 1; leg++) {
      const [x0, z0] = corridor.path[leg]!
      const [x1, z1] = corridor.path[leg + 1]!

      const dx = x1 - x0
      const dz = z1 - z0
      const legLength = Math.hypot(dx, dz)
      if (legLength < 1) continue

      // Unit direction along the street, and its right-hand normal.
      const ux = dx / legLength
      const uz = dz / legLength
      const nx = -uz
      const nz = ux
      const heading = Math.atan2(-ux, -uz)

      const count = Math.max(1, Math.round(legLength / corridor.frontage))

      for (const side of [-1, 1] as const) {
        for (let i = 0; i < count; i++) {
          if (rng() < corridor.gapChance) continue

          const along = ((i + 0.5) / count) * legLength
          const depth = range(rng, corridor.depth[0], corridor.depth[1])
          const height = range(rng, corridor.height[0], corridor.height[1])
          const width = range(rng, corridor.frontage * 0.78, corridor.frontage * 1.04)
          const offset = side * (corridor.setback + depth / 2)

          props.push({
            position: [
              x0 + ux * along + nx * offset,
              height / 2,
              z0 + uz * along + nz * offset,
            ],
            scale: [depth, height, width],
            rotationY: heading,
            color: pick(rng, corridor.palette),
            // Never gated, so the value is unused; -1 marks it as such.
            segment: -1,
          })
        }
      }
    }
  }

  return props
}

export function generateEnvironment(
  route: RouteDef,
  rail: Rail,
  sections: ResolvedSection[],
): EnvironmentData {
  return {
    ground: buildGround(rail, sections),
    skyline: buildCorridors(route),
    ...buildProps(route, rail, sections),
  }
}

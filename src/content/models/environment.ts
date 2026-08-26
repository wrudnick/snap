import * as THREE from 'three'

import type { RouteDef, SectionKind } from '@/content/routes/types'
import type { Rail } from '@/game/rail'
import type { ResolvedSection } from '@/game/sections'
import { makeRng, pick, range, rangeInt } from '@/lib/rng'

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
interface Lane {
  /** Metres right of the path centre. Negative is left. */
  offset: number
  /** Height above grade. */
  height: number
  color: number
}

export interface EnvironmentData {
  /** Vertex-coloured ground for the whole route. One draw call. */
  ground: THREE.BufferGeometry
  buildings: Prop[]
  poles: Prop[]
  heads: Prop[]
  clutter: Prop[]
}

// ---------------------------------------------------------------------------
// Per-section lateral profiles
// ---------------------------------------------------------------------------

const SAND = 0xd8c9a4
const ASPHALT = 0x44484f
const SIDEWALK = 0x9a9184
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
function laneProfile(kind: SectionKind): Lane[] {
  switch (kind) {
    case 'beach':
      // Much wider than the other sections, and deliberately so: this is the
      // only place with an open horizon, and the ribbon has to reach far enough
      // that the player sees lake and shoreline rather than empty sky where the
      // ground stops. Lake is to the right of travel (east), city to the left.
      return [
        { offset: -70, height: 0.4, color: 0x9a8f78 },
        { offset: -26, height: 0.1, color: SAND },
        { offset: -6, height: 0.05, color: SAND },
        { offset: 14, height: 0.0, color: 0xcabb95 },
        { offset: 22, height: -0.3, color: LAKE_SHALLOW },
        { offset: 150, height: -0.5, color: LAKE_DEEP },
      ]
    case 'tunnel':
      return [
        { offset: -3.4, height: 0.0, color: TUNNEL_FLOOR },
        { offset: 0, height: 0.0, color: 0x555049 },
        { offset: 3.4, height: 0.0, color: TUNNEL_FLOOR },
      ]
    case 'avenue':
      return [
        { offset: -19, height: 0.16, color: SIDEWALK },
        { offset: -9, height: 0.16, color: SIDEWALK },
        { offset: -8.4, height: 0.0, color: ASPHALT },
        { offset: 8.4, height: 0.0, color: ASPHALT },
        { offset: 9, height: 0.16, color: SIDEWALK },
        { offset: 19, height: 0.16, color: SIDEWALK },
      ]
    case 'boutique':
      return [
        { offset: -13, height: 0.16, color: SIDEWALK },
        { offset: -6, height: 0.16, color: 0xa39a8b },
        { offset: -5.4, height: 0.0, color: ASPHALT },
        { offset: 5.4, height: 0.0, color: ASPHALT },
        { offset: 6, height: 0.16, color: 0xa39a8b },
        { offset: 13, height: 0.16, color: SIDEWALK },
      ]
    case 'dining':
      return [
        { offset: -14, height: 0.16, color: 0x9c9384 },
        { offset: -6.2, height: 0.16, color: 0x9c9384 },
        { offset: -5.6, height: 0.0, color: ASPHALT },
        { offset: 5.6, height: 0.0, color: ASPHALT },
        { offset: 6.2, height: 0.16, color: 0x9c9384 },
        { offset: 14, height: 0.16, color: 0x9c9384 },
      ]
    case 'park':
      return [
        { offset: -15, height: 0.16, color: SIDEWALK },
        { offset: -7, height: 0.2, color: PARK_GREEN },
        { offset: 7, height: 0.2, color: PARK_GREEN },
        { offset: 15, height: 0.16, color: SIDEWALK },
      ]
    case 'alley':
      return [
        { offset: -2.6, height: 0.0, color: ALLEY_FLOOR },
        { offset: 2.6, height: 0.0, color: ALLEY_FLOOR },
      ]
    case 'interior':
      return [
        { offset: -2.4, height: 0.0, color: INTERIOR_FLOOR },
        { offset: 0, height: 0.0, color: 0x53402f },
        { offset: 2.4, height: 0.0, color: INTERIOR_FLOOR },
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
  const indices: number[] = []

  const point = new THREE.Vector3()
  const right = new THREE.Vector3()
  const colour = new THREE.Color()

  // Rows can differ in lane count between section kinds, so stitch only where
  // consecutive rows agree — a mismatch means a section boundary, and a visible
  // seam there is better than a twisted ribbon.
  let previousRow: { start: number; lanes: number } | null = null

  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const section = sectionFor(sections, t)
    const lanes = laneProfile(section.kind)

    rail.positionAt(t, point)
    rail.rightAt(t, right)

    const rowStart = positions.length / 3

    for (const lane of lanes) {
      positions.push(
        point.x + right.x * lane.offset,
        // Waypoints sit at eye height; ground is below that.
        point.y - 1.7 + lane.height,
        point.z + right.z * lane.offset,
      )
      colour.setHex(lane.color)
      colors.push(colour.r, colour.g, colour.b)
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

    // Frontage width, setback from the kerb, and height range per kind. These
    // are the numbers that make Michigan feel like a canyon and Oak feel like a
    // shopping street.
    const spec = frontageSpec(section.kind)
    if (!spec) continue

    const count = Math.max(1, Math.round(spanMetres / spec.frontage))

    for (let side of [-1, 1] as const) {
      for (let i = 0; i < count; i++) {
        // Skip the occasional plot so the street reads as buildings, not a wall.
        if (rng() < spec.gapChance) continue

        const t = section.tStart + ((i + 0.5) / count) * (section.tEnd - section.tStart)
        const depth = range(rng, spec.depth[0], spec.depth[1])
        const height = range(rng, spec.height[0], spec.height[1])
        const width = range(rng, spec.frontage * 0.8, spec.frontage * 1.05)
        const offset = side * (spec.setback + depth / 2)

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
      for (let side of [-1, 1] as const) {
        for (let i = 0; i < spacing; i++) {
          const t =
            section.tStart + ((i + 0.35) / spacing) * (section.tEnd - section.tStart)
          const [x, y, z] = at(t, side * furniture.offset)
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
      const [x, y, z] = at(t, side * range(rng, clutterSpec[0], clutterSpec[1]))
      const size = range(rng, 0.6, 1.2)
      clutter.push({
        position: [x, y + size / 2, z],
        scale: [size, size * range(rng, 0.8, 1.5), size],
        rotationY: range(rng, 0, Math.PI),
        color: pick(rng, [0x2f4f3a, 0x384b52, 0x4a3f38, 0x6b5a44]),
        segment: Math.min(route.segmentCount - 1, Math.floor(t * route.segmentCount)),
      })
    }
  }

  return { buildings, poles, heads, clutter }
}

interface FrontageSpec {
  frontage: number
  setback: number
  depth: [number, number]
  height: [number, number]
  gapChance: number
}

function frontageSpec(kind: SectionKind): FrontageSpec | null {
  switch (kind) {
    case 'beach':
      // Only the far wall of Gold Coast towers behind the Drive.
      return { frontage: 26, setback: 48, depth: [14, 24], height: [30, 70], gapChance: 0.25 }
    case 'tunnel':
      // The tunnel's "buildings" are its walls — tall, tight, unbroken.
      return { frontage: 8, setback: 3.6, depth: [1.2, 1.6], height: [4, 4.4], gapChance: 0 }
    case 'avenue':
      return { frontage: 30, setback: 20, depth: [18, 30], height: [45, 130], gapChance: 0.05 }
    case 'boutique':
      return { frontage: 16, setback: 13.5, depth: [12, 20], height: [12, 26], gapChance: 0.08 }
    case 'dining':
      return { frontage: 18, setback: 14.5, depth: [12, 22], height: [14, 34], gapChance: 0.06 }
    case 'park':
      return { frontage: 22, setback: 16, depth: [12, 20], height: [20, 44], gapChance: 0.15 }
    case 'alley':
      return { frontage: 10, setback: 2.8, depth: [10, 16], height: [16, 30], gapChance: 0 }
    case 'interior':
      // Walls and ceiling of the restaurant.
      return { frontage: 6, setback: 2.6, depth: [1, 1.4], height: [3.4, 3.6], gapChance: 0 }
  }
}

interface FurnitureSpec {
  spacing: number
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
        spacing: 22, offset: 9.6, poleHeight: 5.2, poleWidth: 0.18,
        poleColor: 0x2f3238, headSize: [0.5, 0.5, 0.5], headColor: 0xffe9c0,
      }
    case 'boutique':
      // Street trees: trunk and canopy through the same instanced pair.
      return {
        spacing: 12, offset: 6.6, poleHeight: 3.4, poleWidth: 0.26,
        poleColor: 0x5a4636, headSize: [3.4, 2.6, 3.4], headColor: 0x5d7a46,
      }
    case 'dining':
      return {
        spacing: 10, offset: 6.8, poleHeight: 2.6, poleWidth: 0.12,
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

export function generateEnvironment(
  route: RouteDef,
  rail: Rail,
  sections: ResolvedSection[],
): EnvironmentData {
  return {
    ground: buildGround(rail, sections),
    ...buildProps(route, rail, sections),
  }
}

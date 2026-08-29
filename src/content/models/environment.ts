import * as THREE from 'three'

import type { RouteDef, SectionKind } from '@/content/routes/types'
import type { Rail } from '@/game/rail'
import type { ResolvedSection } from '@/game/sections'
import { makeRng, pick, range, rangeInt } from '@/lib/rng'

import { inCarriageway, lateralClearance, nearestStreet } from './footprints'

/**
 * Props alongside the route.
 *
 * Props only. The ground is NOT here and deliberately so: it used to be a
 * ribbon extruded sideways along the camera rail, which coupled where the
 * player walks to where the world's surfaces are. That folded into a flap at
 * every corner, and it meant dragging a waypoint in the editor could unpave a
 * block. Streets now pave themselves from OSM and everything else is a polygon
 * fixed in the world — see cityGround and patches.
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

export interface EnvironmentData {
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

/** Surface colours shared with the city ground. */
export const SAND = 0xd8c9a4
export const ASPHALT = 0x44484f
export const SIDEWALK = 0x9a9184

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
        const offset = side * (spec.setback + depth / 2)

        const [x, y, z] = at(t, offset)
        // Props are placed at an offset from the rail, which knows nothing
        // about the streets around it. At the Triangle that stood the alley's
        // walls in Bellevue Place; in the underpass it stood them in Lake Shore
        // Drive. A building in the road is the most obviously broken thing the
        // player can be shown, so anything landing in one is dropped.
        //
        // Corners, not the centre: a 16 m deep wall alongside a street clears
        // it at the middle and still has both ends in the carriageway.
        if (footprintInRoad(x, z, depth, width, headingAt(t))) continue
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

      /**
       * Where a piece of furniture stands, relative to the street it belongs to.
       *
       * Everything used to be offset from the rail, so a lamppost's position
       * depended on where the *camera* went — and with the rail running along a
       * sidewalk, a symmetric offset put one side of the furniture in the road
       * and the other on the player's head. Asking the street where its kerb is
       * makes the answer independent of the route, which is the whole point.
       */
      const placeFor = (t: number, side: -1 | 1): [number, number, number] | null => {
        const [rx, ry, rz] = at(t, 0)
        const street = nearestStreet(rx, rz)
        if (!street) {
          const [x, y, z] = at(t, side * furniture.offset)
          return inCarriageway(x, z) ? null : [x, y, z]
        }

        const inset = furniture.inset ?? 1.2
        let lateral = street.half + inset
        if (furniture.from === 'frontage') {
          // As far back as the buildings allow, so an awning meets its wall.
          const room = lateralClearance(street.x, street.z, street.rx, street.rz, 26)
          lateral = Math.max(street.half + 1.5, room - inset)
        }

        const x = street.x + street.rx * lateral * side
        const z = street.z + street.rz * lateral * side
        return inCarriageway(x, z) ? null : [x, ry, z]
      }

      for (let side of [-1, 1] as const) {
        for (let i = 0; i < spacing; i++) {
          const t =
            section.tStart + ((i + 0.35) / spacing) * (section.tEnd - section.tStart)
          const place = placeFor(t, side)
          if (!place) continue
          const [x, y, z] = place
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
      if (inCarriageway(x, z)) continue
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

/** Does any corner of this box's footprint land in a carriageway? */
function footprintInRoad(
  x: number,
  z: number,
  depth: number,
  width: number,
  rotationY: number,
): boolean {
  const cos = Math.cos(rotationY)
  const sin = Math.sin(rotationY)
  const corners: Array<[number, number]> = [
    [-depth / 2, -width / 2],
    [depth / 2, -width / 2],
    [depth / 2, width / 2],
    [-depth / 2, width / 2],
  ]
  return corners.some(([dx, dz]) =>
    inCarriageway(x + dx * cos - dz * sin, z + dx * sin + dz * cos),
  )
}

/**
 * The strip the whole route exists to photograph.
 *
 * Rush Street was a correctly-paved, correctly-lit, entirely empty road. The
 * dining is the reason the section is called dining and the reason the escorts
 * and the old men are standing there, and none of it was built.
 *
 * Patios go against the building line of whatever street they are beside,
 * asked for at each cluster's own position. A fixed offset from the rail put
 * them in the road on one side and under the camera on the other.
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
  const span = section.tEnd - section.tStart
  const spanMetres = span * railLength
  // One cluster every eight metres, alternating sides.
  const clusters = Math.max(6, Math.round(spanMetres / 8))
  const segmentOf = (t: number) =>
    Math.min(route.segmentCount - 1, Math.floor(t * route.segmentCount))

  const CANOPY = [0xc4553f, 0x2f7d74, 0xd8a53f, 0x8f4a63]

  for (let i = 0; i < clusters; i++) {
    const t = section.tStart + ((i + 0.5) / clusters) * span
    const side: -1 | 1 = i % 2 === 0 ? -1 : 1
    const segment = segmentOf(t)

    const [railX, railY, railZ] = at(t, 0)
    const street = nearestStreet(railX, railZ)
    if (!street) continue

    // Against the frontage, a table's depth in from it.
    const room = lateralClearance(street.x, street.z, street.rx, street.rz, 26)
    const band = Math.max(street.half + 1.6, room - range(rng, 1.4, 3.2))
    const centreX = street.x + street.rx * band * side
    const centreZ = street.z + street.rz * band * side
    if (inCarriageway(centreX, centreZ)) continue

    // A local frame: along the street, and across it.
    const alongX = -street.rz
    const alongZ = street.rx

    const place = (forward: number, across: number): [number, number] => [
      centreX + alongX * forward + street.rx * across * side,
      centreZ + alongZ * forward + street.rz * across * side,
    ]

    const [tableX, tableZ] = place(0, 0)
    clutter.push({
      position: [tableX, railY + 0.36, tableZ],
      scale: [0.95, 0.72, 0.95],
      rotationY: range(rng, 0, Math.PI),
      color: 0x4a3a2c,
      segment,
    })

    const chairs = rangeInt(rng, 2, 4)
    for (let c = 0; c < chairs; c++) {
      const angle = (c / chairs) * Math.PI * 2 + range(rng, -0.3, 0.3)
      const [cx, cz] = place(Math.cos(angle) * 0.95, Math.sin(angle) * 0.95)
      clutter.push({
        position: [cx, railY + 0.45, cz],
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
        position: [tableX, railY + 1.1, tableZ],
        scale: [0.09, 2.2, 0.09],
        rotationY: 0,
        color: 0x2a2620,
        segment,
      })
      heads.push({
        position: [tableX, railY + 2.3, tableZ],
        scale: [2.5, 0.14, 2.5],
        rotationY: range(rng, 0, Math.PI / 2),
        color: pick(rng, CANOPY),
        segment,
      })
    }

    // A planter marking the patio's edge toward the road.
    if (rng() < 0.55) {
      const [px, pz] = place(range(rng, -1.5, 1.5), -1.6)
      if (!inCarriageway(px, pz)) {
        clutter.push({
          position: [px, railY + 0.4, pz],
          scale: [0.8, 0.8, 0.8],
          rotationY: range(rng, 0, Math.PI),
          color: pick(rng, [0x3f5a3a, 0x4a5f42, 0x55483a]),
          segment,
        })
      }
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
    skyline: buildCorridors(route),
    ...buildProps(route, rail, sections),
  }
}

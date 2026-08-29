import * as THREE from 'three'

import type { RouteDef, SectionKind } from '@/content/routes/types'
import type { Rail } from '@/game/rail'
import type { ResolvedSection } from '@/game/sections'
import { makeRng, pick, range, rangeInt } from '@/lib/rng'

import { buildingAt, inCarriageway, lateralClearance, nearestStreet } from './footprints'

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

  /**
   * The camera's path, for keeping things out of it.
   *
   * Props are placed at an offset from the rail with no idea what the rail does
   * next, so where the route bends the inside of a curve swings into it — the
   * underpass walls clipped the camera for nine separate metres of the tunnel.
   * Sampled every two metres and every prop checked against the whole thing,
   * which is cheap enough at load and impossible to get wrong per-section.
   */
  const railPoints: Array<[number, number]> = []
  {
    const p = new THREE.Vector3()
    const steps = Math.ceil(rail.length / 2)
    for (let i = 0; i <= steps; i++) {
      rail.positionAt(i / steps, p)
      railPoints.push([p.x, p.z])
    }
  }
  const nearRail = (x: number, z: number, radius: number) =>
    railPoints.some(([px, pz]) => Math.hypot(x - px, z - pz) < radius)

  /**
   * Does this box's footprint come near the path?
   *
   * Corners, not the centre. A tunnel wall is eight metres long and sits four
   * metres off the rail, so its middle clears the path comfortably while both
   * of its ends sweep across it on the inside of a bend — which is exactly what
   * the underpass was doing.
   */
  const boxNearRail = (
    x: number,
    z: number,
    depth: number,
    width: number,
    rotationY: number,
    margin: number,
  ): boolean => {
    const cos = Math.cos(rotationY)
    const sin = Math.sin(rotationY)
    // Sampled along the length rather than at the corners. A six-metre wall
    // tested only at its ends has four metres of face between the samples, and
    // the restaurant's walls slipped through exactly there.
    const steps = Math.max(2, Math.ceil(width))
    for (let i = 0; i <= steps; i++) {
      const dz = -width / 2 + (width * i) / steps
      for (const dx of [-depth / 2, 0, depth / 2]) {
        if (nearRail(x + dx * cos - dz * sin, z + dx * sin + dz * cos, margin)) return true
      }
    }
    return false
  }

  /**
   * Small props already placed, so two don't occupy the same spot.
   *
   * Placement is random within a band, and random placement collides: a bin
   * inside a planter inside a table reads as one broken object rather than as
   * three.
   */
  const placed: Array<[number, number, number]> = []
  const clashes = (x: number, z: number, radius: number) =>
    placed.some(([px, pz, pr]) => Math.hypot(x - px, z - pz) < (radius + pr) * 0.75)

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
        // 2.4 m, not the near plane's 1.3. A wall that merely fails to clip the
        // camera still fills half the frame as you pass it — the restaurant
        // ended with forty percent of the last shot being a brown rectangle.
        if (boxNearRail(x, z, depth, width, headingAt(t), 2.4)) continue
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
          if (inCarriageway(x, z) || buildingAt(x, z) || nearRail(x, z, 1.6)) return null
          return [x, y, z]
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
        if (inCarriageway(x, z) || buildingAt(x, z) || nearRail(x, z, 1.6)) return null
        return [x, ry, z]
      }

      for (let side of [-1, 1] as const) {
        for (let i = 0; i < spacing; i++) {
          const t =
            section.tStart + ((i + 0.35) / spacing) * (section.tEnd - section.tStart)
          const place = placeFor(t, side)
          if (!place) continue
          const [x, y, z] = place
          // Claimed, so a patio umbrella isn't later planted through an
          // awning's support pole.
          if (clashes(x, z, 1.4)) continue
          placed.push([x, z, 1.4])
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
          if (furniture.canopy) {
            const [cw, ch, cd] = furniture.headSize
            const base = y + furniture.poleHeight
            for (const [lift, scale, sway] of [
              [ch * 0.28, 1.0, 0],
              [ch * 0.62, 0.78, 0.22],
              [ch * 0.86, 0.5, -0.16],
            ] as const) {
              heads.push({
                position: [x + sway * cw * 0.3, base + lift, z + sway * cd * 0.2],
                scale: [cw * scale, ch * 0.5, cd * scale],
                rotationY: headingAt(t) + sway * 2,
                color: furniture.headColor,
                segment,
              })
            }
          } else {
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
      if (inCarriageway(x, z) || buildingAt(x, z)) continue
      if (nearRail(x, z, size / 2 + 1.2) || clashes(x, z, size)) continue
      placed.push([x, z, size])
      clutter.push({
        position: [x, y + size / 2, z],
        scale: [size, size * range(rng, 0.8, 1.5), size],
        rotationY: range(rng, 0, Math.PI),
        color: pick(rng, [0x2f4f3a, 0x384b52, 0x4a3f38, 0x6b5a44]),
        segment: Math.min(route.segmentCount - 1, Math.floor(t * route.segmentCount)),
      })
    }

    if (section.kind === 'dining') {
      addPatios(section, route, rail.length, rng, at, poles, heads, clutter, {
        nearRail,
        clashes,
        claim: (x, z, r) => placed.push([x, z, r]),
      })
    }

    if (section.kind === 'tunnel') {
      addTunnelRoof(section, route, rail.length, at, buildings)
    }

    if (section.kind === 'interior') {
      addBar(section, route, rail.length, rng, at, headingAt, poles, heads, clutter, {
        nearRail,
        clashes,
        claim: (x, z, r) => placed.push([x, z, r]),
      })
    }
  }

  return { buildings, poles, heads, clutter }
}

/**
 * The bar the route ends at.
 *
 * The last section is called Through the Kitchen and finishes at "the end of
 * the bar", and there was no bar — you walked down a corridor and stopped
 * facing a wall. A counter runs along the second half of the section with
 * stools down it, bottles behind, and low lamps over it, so the walk ends
 * somewhere rather than just stopping.
 */
function addBar(
  section: ResolvedSection,
  route: RouteDef,
  railLength: number,
  rng: () => number,
  at: (t: number, offset: number) => [number, number, number],
  headingAt: (t: number) => number,
  poles: Prop[],
  heads: Prop[],
  clutter: Prop[],
  guards: {
    nearRail: (x: number, z: number, radius: number) => boolean
    clashes: (x: number, z: number, radius: number) => boolean
    claim: (x: number, z: number, radius: number) => void
  },
): void {
  const { nearRail, clashes, claim } = guards
  const span = section.tEnd - section.tStart
  const spanMetres = span * railLength
  // The counter occupies the back half: kitchen first, then the room.
  const from = section.tStart + span * 0.45
  const length = span * 0.5
  const steps = Math.max(6, Math.round((spanMetres * 0.5) / 1.2))
  const segmentOf = (t: number) =>
    Math.min(route.segmentCount - 1, Math.floor(t * route.segmentCount))

  /** Which side the counter runs down. Stools face it from the other. */
  const SIDE = -1
  const COUNTER = 2.6
  const GANTRY = 3.7
  const STOOL = 1.4

  for (let i = 0; i <= steps; i++) {
    const t = from + (i / steps) * length
    const segment = segmentOf(t)
    const heading = headingAt(t)

    // The room bends, so a counter laid at a fixed offset swings into the path
    // on the inside of the turn — the same way the tunnel walls did.
    const [bx, by, bz] = at(t, SIDE * COUNTER)
    if (!nearRail(bx, bz, 1.35)) {
      clutter.push({
        position: [bx, by + 0.55, bz],
        scale: [1.3, 1.1, 1.35],
        rotationY: heading,
        color: 0x3a2b20,
        segment,
      })
    }

    // The back gantry: bottles, read at this scale as a band of colour.
    if (i % 2 === 0) {
      const [sx, sy, sz] = at(t, SIDE * GANTRY)
      if (!nearRail(sx, sz, 1.2)) clutter.push({
        position: [sx, sy + 1.15, sz],
        scale: [0.7, 2.3, 1.2],
        rotationY: heading,
        color: pick(rng, [0x5c3a2a, 0x4a3550, 0x2f4a44]),
        segment,
      })
    }

    // Stools, on the room side.
    if (i % 2 === 1) {
      const [tx, ty, tz] = at(t, SIDE * STOOL)
      if (!nearRail(tx, tz, 0.9) && !clashes(tx, tz, 0.5)) claim(tx, tz, 0.5)
      if (!nearRail(tx, tz, 0.9)) clutter.push({
        position: [tx, ty + 0.4, tz],
        scale: [0.42, 0.8, 0.42],
        rotationY: heading + range(rng, -0.4, 0.4),
        color: 0x33241c,
        segment,
      })
    }

    // Low lamps over the counter.
    if (i % 3 === 0) {
      const [lx, ly, lz] = at(t, SIDE * COUNTER)
      poles.push({
        position: [lx, ly + 2.55, lz],
        scale: [0.05, 0.9, 0.05],
        rotationY: 0,
        color: 0x241c16,
        segment,
      })
      heads.push({
        position: [lx, ly + 2.02, lz],
        scale: [0.42, 0.28, 0.42],
        rotationY: heading,
        color: 0xffcf8a,
        segment,
      })
    }
  }
}

/**
 * The deck over the underpass.
 *
 * Without it the section is a trench with the sky overhead, not a tunnel — and
 * the whole point of the underpass is that Lake Shore Drive runs over the top
 * of you. Slabs are placed at a fixed world height rather than at a height
 * above the floor, so the roof appears only across the deep middle and the
 * ramps at either end stay open to the sky, which is how you see where you are
 * going in and coming out.
 */
function addTunnelRoof(
  section: ResolvedSection,
  route: RouteDef,
  railLength: number,
  at: (t: number, offset: number) => [number, number, number],
  buildings: Prop[],
): void {
  const span = section.tEnd - section.tStart
  const steps = Math.max(4, Math.round((span * railLength) / 6))
  /** Underside of the deck. Below grade, so the road above is unbroken. */
  const DECK_Y = -0.55
  const THICKNESS = 0.5
  /** Eye height above the floor, plus room to spare over the top of your head. */
  const HEADROOM = 1.7 + 1.5

  for (let i = 0; i <= steps; i++) {
    const t = section.tStart + (i / steps) * span
    const [x, y, z] = at(t, 0)
    // `y` is the floor. Roofing a stretch with less than head height under it
    // puts the deck through the camera, which is exactly what it did on the
    // ramps at either end.
    if (y + HEADROOM > DECK_Y) continue
    buildings.push({
      position: [x, DECK_Y + THICKNESS / 2, z],
      scale: [9.5, THICKNESS, 7.5],
      rotationY: 0,
      color: 0x2e2822,
      segment: Math.min(route.segmentCount - 1, Math.floor(t * route.segmentCount)),
    })
  }
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
  guards: {
    nearRail: (x: number, z: number, radius: number) => boolean
    clashes: (x: number, z: number, radius: number) => boolean
    claim: (x: number, z: number, radius: number) => void
  },
): void {
  const { nearRail, clashes, claim } = guards
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
    // Patios went in without any of the placement guards, so they were the last
    // things left standing inside buildings and on top of one another.
    const clear = (x: number, z: number, radius: number) =>
      !inCarriageway(x, z) && !buildingAt(x, z) && !nearRail(x, z, radius) && !clashes(x, z, radius)

    // Against the frontage, a table's depth in from it.
    const room = lateralClearance(street.x, street.z, street.rx, street.rz, 26)
    const band = Math.max(street.half + 1.6, room - range(rng, 1.4, 3.2))
    const centreX = street.x + street.rx * band * side
    const centreZ = street.z + street.rz * band * side
    if (!clear(centreX, centreZ, 1.6)) continue
    claim(centreX, centreZ, 1.6)

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
      if (buildingAt(cx, cz) || nearRail(cx, cz, 1.1)) continue
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
      if (clear(px, pz, 0.9)) {
        claim(px, pz, 0.9)
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
      // The tunnel's "buildings" are its walls. Short segments, because an
      // eight-metre box cannot follow a curve — the ends swing inward and clip
      // the camera, and consecutive boxes pile into each other on the inside.
      return { frontage: 3.5, setback: 4.4, depth: [1.2, 1.6], height: [4, 4.4], gapChance: 0 }
    case 'alley':
      return { frontage: 10, setback: 2.8, depth: [10, 16], height: [16, 30], gapChance: 0 }
    case 'interior':
      // Walls and ceiling of the restaurant. Wide enough for a bar, stools and
      // room to walk past them — at the old 2.6 m setback the room was six
      // metres across and the gantry ended up inside the wall.
      return { frontage: 6, setback: 4.2, depth: [1, 1.4], height: [3.4, 3.6], gapChance: 0 }
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
  /**
   * Build the head as a clump of boxes instead of one.
   *
   * A single 3.4 m cube on a pole is not a tree, it is a billboard, and a
   * street lined with them was the most obviously wrong thing in frame. Three
   * offset boxes of decreasing size read as a canopy from the ground, which is
   * the only place this game has a camera.
   */
  canopy?: boolean
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
      // Street trees. Tall bare trunk, canopy well above head height, so you
      // walk under them rather than into them.
      return {
        spacing: 12, from: 'kerb', inset: 1.6, offset: 6.6, poleHeight: 4.4, poleWidth: 0.22,
        poleColor: 0x5a4636, headSize: [3.6, 3.4, 3.6], headColor: 0x5d7a46, canopy: true,
      }
    case 'dining':
      // Awnings, against the frontage they belong to.
      return {
        spacing: 10, from: 'frontage', inset: 1.6, offset: 6.8, poleHeight: 2.6, poleWidth: 0.12,
        poleColor: 0x2b2b2b, headSize: [3.0, 0.32, 3.0], headColor: 0x8d2f2f,
      }
    case 'park':
      return {
        spacing: 9, offset: 5.2, poleHeight: 4.6, poleWidth: 0.28,
        poleColor: 0x574434, headSize: [4.4, 4.0, 4.4], headColor: 0x557040, canopy: true,
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

import * as THREE from 'three'

import type { RouteDef, SectionKind } from '@/content/routes/types'
import type { Rail } from '@/game/rail'
import type { ResolvedSection } from '@/game/sections'
import { makeRng, pick, range, rangeInt } from '@/lib/rng'

import { buildingAt, inCarriageway, lateralClearance, nearestStreet } from './footprints'
import { groundHeightAt } from './groundHeight'

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
  /**
   * Which composite object this box is a part of, if any.
   *
   * A bin is a body, a lid, a band and a base; a planter is a tub with a rim
   * and soil inside it. Those parts are *supposed* to intersect — that is what
   * makes them one object rather than four things standing near each other. The
   * overlap sweep needs to tell that apart from a bin planted inside a planter,
   * and a shared id is the only honest way to say which is which.
   */
  composite?: number
}

export interface EnvironmentData {
  buildings: Prop[]
  poles: Prop[]
  heads: Prop[]
  clutter: Prop[]
  /**
   * Everything drawn from a sphere rather than a box: tree canopies and the
   * bulbs on a string of lights. One instanced mesh covers the lot.
   */
  blobs: Prop[]
  /**
   * Buildings on streets the player never walks — the grid running south to the
   * river. Never gated: they exist to be seen from a long way off, and they are
   * one instanced draw call regardless of count.
   */
  skyline: Prop[]
  /**
   * Light sources — bulbs, lamp globes, lit signs.
   *
   * Drawn unlit, so their colour is exactly what is authored here whatever the
   * scene lighting is doing. A bulb shaded like everything else goes dark at
   * dusk, which is precisely when it is supposed to be the brightest thing on
   * the street: Rush Street's strings of lights read as rows of black beads.
   */
  lamps: Prop[]
}

// Surface colours live in `surfaces.ts` so `cityGround` can have them without
// importing this module; re-exported here because callers already ask for them
// from the environment.
export { ASPHALT, SAND, SIDEWALK } from './surfaces'

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
): Pick<EnvironmentData, 'buildings' | 'poles' | 'heads' | 'clutter' | 'blobs' | 'lamps'> {
  const rng = makeRng(route.seed)
  const buildings: Prop[] = []
  const poles: Prop[] = []
  const heads: Prop[] = []
  const clutter: Prop[] = []
  const blobs: Prop[] = []
  const lamps: Prop[] = []

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
    /**
     * Asks whether the path is inside the box, not whether the box is near the
     * path.
     *
     * Those sound the same and are not. This used to sample a grid of points on
     * the box's own surface and test each against the route, which misses the
     * case that matters most: a box big enough to *contain* a stretch of the
     * route, with all of its sampled points further than the margin from it.
     * An eighteen-metre alley wall did exactly that at the end of the route and
     * the camera finished the run inside it.
     *
     * Rotating each path point into the box's frame is both correct and
     * cheaper — one transform per point instead of a grid per box.
     */
    const cos = Math.cos(rotationY)
    const sin = Math.sin(rotationY)
    const halfDepth = depth / 2 + margin
    const halfWidth = width / 2 + margin

    for (const [px, pz] of railPoints) {
      const dx = px - x
      const dz = pz - z
      // Inverse of the box's rotation: transpose, since it is orthonormal.
      const along = dx * cos + dz * sin
      const across = -dx * sin + dz * cos
      if (Math.abs(along) <= halfDepth && Math.abs(across) <= halfWidth) return true
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

  /**
   * A point beside the route, standing on the ground that is actually there.
   *
   * The height used to be `point.y - 1.7` — the rail's own height, whatever the
   * lateral offset. That is right only where the street is level with the path,
   * and Rush Street's frontages ended up hanging a metre above their pavement
   * with daylight under them, because the route runs along a kerb that is not
   * the level the buildings stand at.
   *
   * The rail's height stays as the *hint* that says which surface is meant, so
   * a tunnel wall still lands on the tunnel floor rather than on Lake Shore
   * Drive's deck four metres above it.
   */
  const at = (t: number, offset: number): [number, number, number] => {
    rail.positionAt(t, point)
    rail.rightAt(t, right)
    const x = point.x + right.x * offset
    const z = point.z + right.z * offset
    return [x, groundHeightAt(x, z, point.y - 1.7), z]
  }

  const headingAt = (t: number) => rail.headingAt(t)

  /**
   * A spot on the pavement, measured from the kerb of whatever street is here.
   *
   * The furniture pass already does this for lampposts; street furniture proper
   * needs the same answer, and for the same reason: offsetting from the rail
   * ties a bin's position to where the *camera* goes, which puts it in the road
   * on one side and in your face on the other.
   */
  const sidewalkAt = (
    t: number,
    side: -1 | 1,
    inset: number,
  ): [number, number, number] | null => {
    const [rx, ry, rz] = at(t, 0)
    const street = nearestStreet(rx, rz)
    if (!street) return null
    const lateral = street.half + inset
    const x = street.x + street.rx * lateral * side
    const z = street.z + street.rz * lateral * side
    if (inCarriageway(x, z) || buildingAt(x, z)) return null
    return [x, groundHeightAt(x, z, ry), z]
  }

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
        // On the inside of a hard bend, consecutive wall segments bunch up and
        // sit inside one another — which reads as one thick broken wall rather
        // than as a run of panels. Abutting is fine; occupying the same spot is
        // not, and the same claim the clutter uses tells them apart.
        if (clashes(x, z, depth / 2)) continue
        placed.push([x, z, depth / 2])
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
            addCanopy(
              blobs,
              rngFor(section.id, i, side),
              x,
              y + furniture.poleHeight,
              z,
              furniture.headSize,
              furniture.headColor,
              segment,
            )
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

    /**
     * Street furniture: bins, planters and bus stops.
     *
     * This used to be `clutterCount` random boxes in four muted colours, offset
     * from the rail, rotated at random and scaled between 0.6 and 1.2 — which
     * is what a street looks like if you describe it as "objects". Real kerbside
     * furniture is a small vocabulary of recognisable things at regular
     * spacing, so that is what goes down: a bin on the corner, planters outside
     * the shops, a shelter where the bus actually stops.
     *
     * Alleys and the restaurant interior keep the anonymous boxes, because
     * there the point genuinely is unidentifiable junk.
     */
    const segmentFor = (t: number) =>
      Math.min(route.segmentCount - 1, Math.floor(t * route.segmentCount))

    const furnished =
      section.kind === 'avenue' ||
      section.kind === 'boutique' ||
      section.kind === 'dining' ||
      section.kind === 'park'

    if (furnished) {
      /** Distinct per composite object placed, in this section. */
      let composite = 0

      /** A litter bin: body, lid, and the band round its middle. */
      const addBin = (x: number, y: number, z: number, heading: number, segment: number) => {
        const body = 0x36423a
        const id = ++composite
        clutter.push(
          { position: [x, y + 0.44, z], scale: [0.62, 0.88, 0.62], rotationY: heading, color: body, segment, composite: id },
          { position: [x, y + 0.92, z], scale: [0.72, 0.09, 0.72], rotationY: heading, color: 0x232b26, segment, composite: id },
          { position: [x, y + 0.62, z], scale: [0.65, 0.07, 0.65], rotationY: heading, color: 0x232b26, segment, composite: id },
          // The slot in the lid, which is the one feature that says bin.
          { position: [x, y + 0.98, z], scale: [0.3, 0.05, 0.14], rotationY: heading, color: 0x141815, segment, composite: id },
          { position: [x, y + 0.06, z], scale: [0.7, 0.12, 0.7], rotationY: heading, color: 0x232b26, segment, composite: id },
        )
      }

      /**
       * A planter: a stone tub, dark soil, and blobs of foliage and flowers.
       *
       * The flowers are spheres, so they ride along in the same instanced mesh
       * as the tree canopies and cost nothing extra.
       */
      const addPlanter = (
        x: number, y: number, z: number, heading: number, segment: number, r: () => number,
      ) => {
        const id = ++composite
        clutter.push(
          { position: [x, y + 0.3, z], scale: [1.15, 0.6, 1.15], rotationY: heading, color: 0xa89e8c, segment, composite: id },
          { position: [x, y + 0.62, z], scale: [1.22, 0.09, 1.22], rotationY: heading, color: 0x8d8474, segment, composite: id },
          { position: [x, y + 0.64, z], scale: [1.0, 0.06, 1.0], rotationY: heading, color: 0x3d3226, segment, composite: id },
        )
        const petals = [0xd8556a, 0xe0a13c, 0xd8d0e0, 0xc4568f, 0xe8d45a]
        for (let k = 0; k < 7; k++) {
          const a = r() * Math.PI * 2
          const reach = 0.16 + r() * 0.26
          const leaf = k % 3 !== 0
          const size = leaf ? 0.3 + r() * 0.18 : 0.16 + r() * 0.1
          blobs.push({
            position: [
              x + Math.cos(a) * reach,
              y + 0.72 + (leaf ? 0.1 : 0.24) + r() * 0.1,
              z + Math.sin(a) * reach,
            ],
            scale: [size, size * 0.8, size],
            rotationY: 0,
            color: leaf ? (r() < 0.5 ? 0x4a7a3f : 0x3f6b38) : petals[Math.floor(r() * petals.length)]!,
            segment,
          })
        }
      }

      /**
       * A bus shelter: a glass-backed box with a cantilevered roof, a bench,
       * and the flag on a pole at the kerb.
       *
       * Built to the street's own direction so the back panel is against the
       * buildings and the open side faces the road, which is the difference
       * between a shelter and a shed dropped on the pavement.
       */
      const addBusStop = (
        x: number, y: number, z: number, heading: number, side: -1 | 1, segment: number,
      ) => {
        const cos = Math.cos(heading)
        const sin = Math.sin(heading)
        // Local axes: `f` runs along the street, `n` across it toward the road.
        const f = (d: number): [number, number] => [x - sin * d, z + cos * d]
        const n = (d: number): [number, number] => [x + cos * d * -side, z + sin * d * -side]
        const both = (along: number, across: number): [number, number] => {
          const [ax, az] = f(along)
          const [nx, nz] = n(across)
          return [ax + (nx - x), az + (nz - z)]
        }

        const post = 0x3a3f45
        const glass = 0x6d8494
        const id = ++composite
        for (const along of [-1.9, 1.9]) {
          const [px, pz] = both(along, 0.7)
          clutter.push({
            position: [px, y + 1.2, pz], scale: [0.12, 2.4, 0.12],
            rotationY: heading, color: post, segment, composite: id,
          })
        }
        const [bx, bz] = both(0, 0.72)
        const [gx, gz] = both(0, 0.7)
        const [rx2, rz2] = both(0, 0.35)
        clutter.push(
          // Back panel and roof.
          { position: [gx, y + 1.3, gz], scale: [0.08, 1.9, 4.0], rotationY: heading, color: glass, segment, composite: id },
          { position: [rx2, y + 2.48, rz2], scale: [1.9, 0.12, 4.3], rotationY: heading, color: post, segment, composite: id },
          { position: [bx, y + 0.5, bz], scale: [0.4, 0.09, 3.2], rotationY: heading, color: 0x7a6a52, segment, composite: id },
          { position: [bx, y + 0.26, bz], scale: [0.3, 0.4, 0.14], rotationY: heading, color: post, segment, composite: id },
        )
        // Route flag on a pole at the kerb.
        const [fx, fz] = both(2.6, -0.4)
        clutter.push(
          { position: [fx, y + 1.5, fz], scale: [0.1, 3.0, 0.1], rotationY: heading, color: post, segment, composite: id },
          { position: [fx, y + 2.85, fz], scale: [0.5, 0.62, 0.1], rotationY: heading, color: 0x1d4f8f, segment, composite: id },
          { position: [fx, y + 2.95, fz], scale: [0.34, 0.2, 0.12], rotationY: heading, color: 0xe8e4da, segment, composite: id },
        )
      }

      const plan: Array<{ every: number; radius: number; kind: 'bin' | 'planter' | 'stop' }> = [
        { every: 34, radius: 0.9, kind: 'bin' },
        { every: 26, radius: 1.4, kind: 'planter' },
      ]
      // Shelters only where a bus actually runs.
      if (section.kind === 'avenue') plan.push({ every: 130, radius: 3.6, kind: 'stop' })

      for (const { every, radius, kind } of plan) {
        const count = Math.max(1, Math.round(spanMetres / every))
        for (const side of [-1, 1] as const) {
          for (let i = 0; i < count; i++) {
            const t =
              section.tStart +
              ((i + (kind === 'bin' ? 0.2 : kind === 'planter' ? 0.62 : 0.5)) / count) *
                (section.tEnd - section.tStart)
            const place = sidewalkAt(t, side, kind === 'stop' ? 2.6 : 1.1)
            if (!place) continue
            const [x, y, z] = place
            if (nearRail(x, z, radius + 1.1) || clashes(x, z, radius)) continue
            placed.push([x, z, radius])
            const heading = headingAt(t)
            const segment = segmentFor(t)
            if (kind === 'bin') addBin(x, y, z, heading, segment)
            else if (kind === 'planter') addPlanter(x, y, z, heading, segment, rngFor(section.id, i, side))
            else addBusStop(x, y, z, heading, side, segment)
          }
        }
      }
    } else if (section.kind !== 'beach' && section.kind !== 'alley') {
      /**
       * Alleys, the tunnel and the restaurant interior: anonymous junk is the
       * point, and it gives the occlusion term something to work with.
       *
       * Not the beach and not the alley. Both have their own furniture now —
       * the club and its parasols, the dumpsters and fire escapes — and because
       * this loop runs first, a random 1 m box was landing on the club's deck
       * and inside the alley's pallet stacks before either existed to be
       * claimed.
       */
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
          segment: segmentFor(t),
        })
      }
    }

    if (section.kind === 'dining') {
      addStringLights(section, route, rail.length, at, poles, lamps)
      addPatios(section, route, rail.length, rng, at, poles, heads, clutter, {
        nearRail,
        clashes,
        claim: (x, z, r) => placed.push([x, z, r]),
      })
    }

    if (section.kind === 'beach') {
      addBeachClub(section, route, rail.length, rng, at, headingAt, poles, heads, clutter, blobs, lamps, {
        nearRail,
        clashes,
        claim: (x, z, r) => placed.push([x, z, r]),
      })
    }

    if (section.kind === 'alley') {
      addAlleyDressing(section, route, rail.length, rng, at, headingAt, heads, clutter, lamps, nearRail)
    }

    if (section.kind === 'tunnel') {
      addTunnelRoof(section, route, rail.length, at, headingAt, buildings)
    }

    if (section.kind === 'boutique') {
      addShopfronts(section, route, rail.length, rng, at, headingAt, poles, heads, nearRail)
    }

    if (section.kind === 'interior') {
      addBar(section, route, rail.length, rng, at, headingAt, poles, heads, clutter, {
        nearRail,
        clashes,
        claim: (x, z, r) => placed.push([x, z, r]),
      })
    }
  }

  return { buildings, poles, heads, clutter, blobs, lamps }
}

/**
 * What is actually in a Chicago alley.
 *
 * The alley was two blank walls, a floor and a rat. Everything here is bolted
 * to the wall line or standing against it rather than scattered, because the
 * alley is three metres wide and anything placed at random in it ends up in the
 * camera. The wall is at the frontage setback, so props sit between 1.9 and 2.8
 * metres off the centreline — clear of the near plane, close enough to read as
 * attached to the building.
 *
 * Fire escapes are the point. They are the single most recognisable thing about
 * the space, they break up an otherwise blank thirty-metre wall, and they give
 * the light something to cut through.
 */
function addAlleyDressing(
  section: ResolvedSection,
  route: RouteDef,
  railLength: number,
  rng: () => number,
  at: (t: number, offset: number) => [number, number, number],
  headingAt: (t: number) => number,
  heads: Prop[],
  clutter: Prop[],
  lamps: Prop[],
  nearRail: (x: number, z: number, radius: number) => boolean,
): void {
  const span = section.tEnd - section.tStart
  const spanMetres = span * railLength
  const segmentFor = (t: number) =>
    Math.min(route.segmentCount - 1, Math.floor(t * route.segmentCount))

  /**
   * How far off the centreline the wall is, measured rather than assumed.
   *
   * A fixed 2.55 m put the dressing inside the buildings on the wide stretches
   * and inside the camera on the narrow ones — the alley is not a constant
   * width, and the frontage massing is not where the real buildings are. Asking
   * for the lateral clearance at each bay gets the actual face.
   */
  const MIN_WALL = 2.1
  /** Matches `frontageSpec('alley').setback`, which is where the walls stand. */
  const ALLEY_SETBACK = 2.8
  const BRICK = 0x5c554b
  const STEEL = 0x3a3f45
  const RUST = 0x7a4f38

  let id = 2000
  const bays = Math.max(4, Math.round(spanMetres / 9))

  for (const side of [-1, 1] as const) {
    for (let i = 0; i < bays; i++) {
      const t = section.tStart + ((i + 0.5) / bays) * span
      const heading = headingAt(t)
      const [rx0, , rz0] = at(t, 0)
      const [ax0, , az0] = at(t, side)
      /**
       * Capped at the frontage setback.
       *
       * `lateralClearance` only sees real OSM footprints, and the alley's walls
       * are procedural massing standing at the setback — so where OSM has
       * nothing it answers 9 m, and the fire escapes went out nine metres and
       * hung in mid-air well past the wall the player can actually see. The
       * setback is where the visible wall is; a nearer real building wins.
       */
      const room = lateralClearance(rx0, rz0, ax0 - rx0, az0 - rz0, 9)
      if (room < MIN_WALL) continue
      const WALL = Math.min(ALLEY_SETBACK - 0.1, Math.max(MIN_WALL, room - 0.15))
      const [x, y, z] = at(t, side * WALL)
      const segment = segmentFor(t)
      const wallIn = -0.25 * side
      const cos = Math.cos(heading)
      const sin = Math.sin(heading)
      /** Offset from the wall point: `along` down the alley, `out` toward it. */
      const spot = (along: number, out: number): [number, number] => [
        x - sin * along + cos * out * side,
        z + cos * along + sin * out * side,
      ]

      /**
       * The same, refusing a spot that is inside a building or in the camera.
       *
       * Checking only the bay's anchor is not enough: the dumpster sits 1.6 m
       * along it and the crate 3.4 m, and the alley walls are not straight, so
       * an anchor that clears can still have a prop three metres away inside
       * the brickwork.
       */
      const floorSpot = (along: number, out: number): [number, number] | null => {
        const [sx, sz] = spot(along, out)
        if (buildingAt(sx, sz) || nearRail(sx, sz, 1.9)) return null
        return [sx, sz]
      }
      if (nearRail(x, z, 1.9) || buildingAt(x, z)) continue
      const group = ++id

      // Downpipe, full height, and the hoppers on it.
      const pipe = floorSpot(-3.4, wallIn)
      // Reaches the ground, so this one is genuinely floor clutter.
      if (pipe) {
        clutter.push({
          position: [pipe[0], y + 5, pipe[1]], scale: [0.22, 10, 0.22],
          rotationY: heading, color: RUST, segment, composite: group,
        })
      }

      /**
       * Fire escape: two platforms and the ladder between them.
       *
       * Platforms in `heads` rather than `clutter` — they are meant to be four
       * metres up, and the ground sweep asks everything in clutter to be
       * standing on the floor.
       */
      if (i % 2 === 0) {
        for (const [level, lift] of [[0, 3.6], [1, 7.0]] as const) {
          const [ax, az] = spot(0, 0.55)
          heads.push(
            { position: [ax, y + lift, az], scale: [1.5, 0.1, 3.0], rotationY: heading, color: STEEL, segment },
            { position: [ax, y + lift + 0.5, az], scale: [0.06, 1.0, 3.0], rotationY: heading, color: STEEL, segment },
          )
          for (const end of [-1.45, 1.45]) {
            const [bx2, bz2] = spot(end, 0.55)
            heads.push({
              position: [bx2, y + lift + 0.5, bz2], scale: [1.4, 1.0, 0.06],
              rotationY: heading, color: STEEL, segment,
            })
          }
          // Ladder up to the next level, leaning along the wall.
          if (level === 0) {
            const [lx, lz] = spot(1.1, 0.5)
            heads.push({
              position: [lx, y + lift + 1.7, lz], scale: [0.5, 3.6, 0.1],
              rotationY: heading, color: STEEL, segment,
            })
          }
        }
      }

      // Air-conditioning unit and its bracket.
      if (i % 3 === 1) {
        const [ax, az] = spot(2.2, 0.42)
        // Bolted to the wall three metres up: `heads`, not `clutter`.
        heads.push(
          { position: [ax, y + 2.9, az], scale: [0.9, 0.8, 0.7], rotationY: heading, color: 0x9aa0a8, segment },
          { position: [ax, y + 2.4, az], scale: [1.0, 0.12, 0.6], rotationY: heading, color: STEEL, segment },
        )
      }

      // A caged wall light, and the conduit feeding it.
      const [wx, wz] = spot(-1.2, 0.3)
      heads.push(
        { position: [wx, y + 3.4, wz], scale: [0.3, 0.34, 0.34], rotationY: heading, color: STEEL, segment },
        { position: [wx, y + 1.9, wz], scale: [0.08, 2.6, 0.08], rotationY: heading, color: STEEL, segment },
      )
      lamps.push({
        position: [wx, y + 3.3, wz], scale: [0.34, 0.3, 0.34],
        rotationY: 0, color: 0xfff2d0, segment,
      })

      /**
       * Graffiti.
       *
       * Flat panels of saturated colour on a brown wall. It is the cheapest
       * thing on this list and it does more for the alley than any of the
       * geometry, because it is the only colour in the section.
       */
      if (i % 2 === 1) {
        const tags = [0xd8453f, 0x3f8fa8, 0xe8b23a, 0x6b4f9c, 0x4a9c7a]
        for (let k = 0; k < 3; k++) {
          const [tx, tz] = spot(-2 + k * 1.5 + rng() * 0.4, 0.06)
          heads.push({
            position: [tx, y + 1.5 + rng() * 1.1, tz],
            scale: [0.06, 0.5 + rng() * 0.5, 0.9 + rng() * 0.8],
            rotationY: heading,
            color: tags[Math.floor(rng() * tags.length)]!,
            segment,
          })
        }
      }

      // Ground clutter against the wall: a dumpster, or pallets and crates.
      const bin = i % 2 === 0 ? floorSpot(1.6, 0.62) : null
      if (bin) {
        const [dx, dz] = bin
        const lid = ++id
        clutter.push(
          { position: [dx, y + 0.6, dz], scale: [1.0, 1.2, 2.1], rotationY: heading, color: 0x2f4f3a, segment, composite: lid },
          { position: [dx, y + 1.24, dz], scale: [1.1, 0.12, 2.2], rotationY: heading, color: 0x24402e, segment, composite: lid },
          { position: [dx, y + 0.12, dz], scale: [1.05, 0.24, 0.2], rotationY: heading, color: 0x1d1f24, segment, composite: lid },
        )
      } else if (i % 2 === 1) {
        const pallets = floorSpot(2.4, 0.62)
        if (!pallets) continue
        const [cx2, cz2] = pallets
        const stack = ++id
        for (let k = 0; k < 3; k++) {
          clutter.push({
            position: [cx2, y + 0.09 + k * 0.16, cz2], scale: [0.9, 0.14, 1.1],
            rotationY: heading + k * 0.08, color: 0x8a6a44, segment, composite: stack,
          })
        }
        const crate = floorSpot(3.4, 0.6)
        if (crate) {
          clutter.push({
            position: [crate[0], y + 0.22, crate[1]], scale: [0.5, 0.44, 0.5],
            rotationY: heading + 0.3, color: 0x3f6b8f, segment, composite: stack,
          })
        }
      }

      // A back door with a step: somewhere the kitchen the route ends in could
      // plausibly be behind.
      const back = i % 3 === 2 ? floorSpot(-2.6, 0.08) : null
      if (back) {
        const [gx, gz] = back
        const door = ++id
        clutter.push(
          { position: [gx, y + 1.05, gz], scale: [0.1, 2.1, 1.0], rotationY: heading, color: 0x4a4034, segment, composite: door },
          { position: [gx, y + 0.09, gz], scale: [0.5, 0.18, 1.2], rotationY: heading, color: BRICK, segment, composite: door },
        )
      }
    }
  }

  // Cables strung across the alley, and a light or two hanging off them.
  const runs = Math.max(3, Math.round(spanMetres / 14))
  for (let i = 0; i < runs; i++) {
    const t = section.tStart + ((i + 0.6) / runs) * span
    const [x, y, z] = at(t, 0)
    const segment = segmentFor(t)
    const [ax0, , az0] = at(t, 1)
    // Long enough to reach both walls wherever they happen to be here.
    const reach = Math.min(ALLEY_SETBACK, Math.max(MIN_WALL, lateralClearance(x, z, ax0 - x, az0 - z, 9))) * 2.2
    heads.push({
      position: [x, y + 6.4, z], scale: [reach, 0.07, 0.07],
      rotationY: headingAt(t), color: 0x1d1f24, segment,
    })
    lamps.push({
      position: [x, y + 6.2, z], scale: [0.3, 0.34, 0.3],
      rotationY: 0, color: 0xfff2d0, segment,
    })
  }
}

/** A darker shade of a prop colour, for the alternate panels of a parasol. */
function shadeOfProp(color: number, factor: number): number {
  const ch = (shift: number) => Math.min(255, Math.round(((color >> shift) & 0xff) * factor))
  return (ch(16) << 16) | (ch(8) << 8) | ch(0)
}

/**
 * The beach club, and the sunshades scattered along the sand.
 *
 * Oak Street Beach has a bar on the sand at the south end — the last thing you
 * pass before the route turns down into the underpass — and without it the
 * beach is a large empty plane with three pigeons on it. A deck, a counter,
 * parasols over high tables, a run of lights and a pair of speakers give the
 * crowd somewhere to be, which is what makes placing twenty people there read
 * as a party rather than as twenty people standing in sand.
 *
 * Built to the route's heading rather than to the world axes, so the deck faces
 * the way the player is walking rather than sitting at an angle to everything.
 */
function addBeachClub(
  section: ResolvedSection,
  route: RouteDef,
  railLength: number,
  rng: () => number,
  at: (t: number, offset: number) => [number, number, number],
  headingAt: (t: number) => number,
  poles: Prop[],
  heads: Prop[],
  clutter: Prop[],
  blobs: Prop[],
  lamps: Prop[],
  guards: {
    nearRail: (x: number, z: number, radius: number) => boolean
    clashes: (x: number, z: number, radius: number) => boolean
    claim: (x: number, z: number, radius: number) => void
  },
): void {
  const { nearRail, clashes, claim } = guards
  const span = section.tEnd - section.tStart
  const segmentFor = (t: number) =>
    Math.min(route.segmentCount - 1, Math.floor(t * route.segmentCount))

  /**
   * The club sits near the end of the beach, on the inland side.
   *
   * `u` 0.84 rather than 0.5: the point is that you walk past it on the way
   * into the underpass, so it wants to be the last thing on the sand.
   */
  const clubT = section.tStart + span * 0.84
  const heading = headingAt(clubT)
  const cos = Math.cos(heading)
  const sin = Math.sin(heading)

  /**
   * Far enough out that the path never crosses the deck.
   *
   * A fixed 15 m offset is not enough on its own: the route turns southwest
   * into the underpass immediately after the club, so a point fifteen metres to
   * the side at u 0.84 is directly on the path by u 1.0 — and the player walked
   * straight through the middle of an eleven-by-fifteen-metre deck, which fills
   * the entire frame with a brown plane.
   *
   * Candidates are tested at their corners against the whole rail, near side
   * first, and the club simply moves until it clears.
   */
  const HALF_ACROSS = 6.5
  const HALF_ALONG = 8

  /**
   * Always the same side; only the distance moves.
   *
   * Props measure their offset as `+right` and subjects as `−right`, so a club
   * that picked its side at run time would put the crowd across the beach from
   * the bar half the time. `at(t, −out)` is `+out` in the subjects' sign, which
   * is the one the route file is written in.
   */
  let chosen = at(clubT, -36)
  for (const out of [17, 21, 25, 30]) {
    const [px, py, pz] = at(clubT, -out)
    let clear = true
    for (const a of [-HALF_ALONG, 0, HALF_ALONG]) {
      for (const o of [-HALF_ACROSS, 0, HALF_ACROSS]) {
        if (nearRail(px - sin * a + cos * o, pz + cos * a + sin * o, 7)) clear = false
      }
    }
    if (clear) {
      chosen = [px, py, pz]
      break
    }
  }
  const [cx, cy, cz] = chosen
  const segment = segmentFor(clubT)

  /** A point in the club's own frame: `along` the route, `out` away from it. */
  const local = (along: number, out: number): [number, number] => [
    cx - sin * along + cos * out,
    cz + cos * along + sin * out,
  ]

  /**
   * One id for the club's own structure — deck, counter, gantry, kick panel,
   * posts. They intersect each other by design, the way a building's walls meet
   * its floor. Stools and parasols get their own ids because they are separate
   * objects standing on it.
   */
  const CLUB = 900
  const DECK = 0xb08a5e
  const POST = 0x8a6a44
  const CANVAS = 0xe8e4da

  // Deck, one board colour with a darker fascia so it has an edge.
  const [dx, dz] = local(0, 0)
  clutter.push(
    { position: [dx, cy + 0.16, dz], scale: [HALF_ACROSS * 2, 0.32, HALF_ALONG * 2], rotationY: heading, color: DECK, segment, composite: CLUB },
    { position: [dx, cy + 0.34, dz], scale: [HALF_ACROSS * 2 + 0.3, 0.1, HALF_ALONG * 2 + 0.3], rotationY: heading, color: 0x8f6c46, segment, composite: CLUB },
  )
  claim(dx, dz, HALF_ALONG)

  // Bar counter along the inland edge, with a back gantry of bottles.
  const [bx, bz] = local(0, 3.6)
  const [gx, gz] = local(0, 5.0)
  clutter.push(
    { position: [bx, cy + 0.86, bz], scale: [1.1, 1.0, 9], rotationY: heading, color: 0x6b4a30, segment, composite: CLUB },
    { position: [bx, cy + 1.4, bz], scale: [1.35, 0.12, 9.2], rotationY: heading, color: 0x8f6c46, segment, composite: CLUB },
    { position: [gx, cy + 1.3, gz], scale: [0.5, 2.6, 9], rotationY: heading, color: 0x4a3524, segment, composite: CLUB },
    // Thatch over the counter, on four posts. Without it the bar is a shipping
    // container with bottles in front of it.
    { position: [bx, cy + 0.34, bz], scale: [1.2, 0.5, 9.1], rotationY: heading, color: 0x54402c, segment, composite: CLUB },
  )
  heads.push(
    { position: [bx + (gx - bx) * 0.4, cy + 2.9, bz + (gz - bz) * 0.4], scale: [3.6, 0.26, 10], rotationY: heading, color: 0xb89a62, segment },
    { position: [bx + (gx - bx) * 0.4, cy + 3.12, bz + (gz - bz) * 0.4], scale: [2.4, 0.22, 9.4], rotationY: heading, color: 0xa88a52, segment },
  )
  for (const along of [-4.2, 4.2]) {
    const [qx, qz] = local(along, 2.6)
    clutter.push({
      position: [qx, cy + 1.5, qz], scale: [0.16, 3.0, 0.16],
      rotationY: heading, color: POST, segment, composite: CLUB,
    })
  }
  for (let i = 0; i < 12; i++) {
    const [ox, oz] = local(-3.8 + i * 0.7, 4.8)
    blobs.push({
      position: [ox, cy + 1.9 + (i % 3) * 0.12, oz],
      scale: [0.16, 0.34, 0.16],
      rotationY: heading,
      color: [0x3f6b52, 0x8a5a2e, 0x6b4f9c, 0xd8a13c][i % 4]!,
      segment,
    })
  }

  // Stools along the counter.
  for (let i = 0; i < 7; i++) {
    const [sx, sz] = local(-3.6 + i * 1.2, 2.4)
    clutter.push(
      { position: [sx, cy + 0.42, sz], scale: [0.16, 0.84, 0.16], rotationY: heading, color: 0x4a4f57, segment, composite: 910 + i },
      { position: [sx, cy + 0.9, sz], scale: [0.5, 0.1, 0.5], rotationY: heading, color: 0x6b4a30, segment, composite: 910 + i },
    )
  }

  /**
   * A parasol, as four sloping panels rather than one flat slab.
   *
   * A single horizontal box at the top of a pole reads as a table balanced in
   * the air. Two crossed panels tilted down at the edges give it a ridge and a
   * silhouette that says canopy from any angle, for three extra boxes.
   */
  const parasol = (
    x: number, y: number, z: number, rot: number, span: number, color: number, seg: number, id: number,
  ) => {
    poles.push({
      position: [x, y + span * 0.42, z], scale: [0.1, span * 0.84, 0.1],
      rotationY: rot, color: POST, segment: seg,
    })
    // Canopy panels go in `heads`, not `clutter`: heads is the group for the
    // thing on top of a pole, and the ground sweep rightly asks everything in
    // clutter to be standing on the floor.
    for (let k = 0; k < 4; k++) {
      const a = rot + (k / 4) * Math.PI * 2 + Math.PI / 4
      heads.push({
        position: [
          x + Math.cos(a) * span * 0.24,
          y + span * 0.8 + (k % 2 === 0 ? 0.02 : 0),
          z + Math.sin(a) * span * 0.24,
        ],
        scale: [span * 0.78, 0.08, span * 0.78],
        rotationY: a,
        color: k % 2 === 0 ? color : shadeOfProp(color, 0.86),
        segment: seg,
        composite: id,
      })
    }
    // Finial, so the panels meet at something.
    heads.push({
      position: [x, y + span * 0.9, z], scale: [0.14, 0.22, 0.14],
      rotationY: rot, color: POST, segment: seg, composite: id,
    })
  }

  // Parasols over high tables, out on the deck.
  for (let i = 0; i < 5; i++) {
    const [px, pz] = local(-5 + i * 2.6, -1.6 - (i % 2) * 2.2)
    parasol(px, cy, pz, heading + i * 0.3, 3.2, i % 2 === 0 ? CANVAS : 0xe0a06a, segment, 930 + i)
    clutter.push(
      { position: [px, cy + 0.5, pz], scale: [0.12, 1.0, 0.12], rotationY: heading, color: 0x4a4f57, segment, composite: 930 + i },
      { position: [px, cy + 1.02, pz], scale: [1.0, 0.09, 1.0], rotationY: heading, color: 0x8f6c46, segment, composite: 930 + i },
    )
  }

  // Speaker stacks either end, and a run of lights over the deck.
  for (const along of [-5.6, 5.6]) {
    const [sx, sz] = local(along, 1.2)
    clutter.push(
      { position: [sx, cy + 0.9, sz], scale: [0.7, 1.5, 0.6], rotationY: heading, color: 0x24262b, segment, composite: 940 },
      { position: [sx, cy + 1.3, sz], scale: [0.5, 0.5, 0.66], rotationY: heading, color: 0x14161a, segment, composite: 940 },
    )
  }
  for (let i = 0; i <= 16; i++) {
    const u = i / 16
    const [lx, lz] = local(-6 + u * 12, -0.4)
    // A sag between the two masts, the same shape the Rush Street strings use.
    const sag = Math.sin(u * Math.PI) * 0.55
    lamps.push({
      position: [lx, cy + 3.2 - sag, lz], scale: [0.3, 0.3, 0.3],
      rotationY: 0, color: 0xfff2d0, segment,
    })
  }
  for (const along of [-6.2, 6.2]) {
    const [mx, mz] = local(along, -0.4)
    poles.push({
      position: [mx, cy + 1.7, mz], scale: [0.13, 3.4, 0.13],
      rotationY: heading, color: POST, segment,
    })
  }

  /**
   * Parasols out on the open sand, away from the club.
   *
   * Cheap, and they do most of the work of making the beach look occupied from
   * a distance — a plain sand plane reads as unfinished however many people are
   * lying on it.
   */
  const shades = Math.max(5, Math.round((span * railLength) / 26))
  for (let i = 0; i < shades; i++) {
    const t = section.tStart + ((i + 0.4) / shades) * span
    const out = 9 + rng() * 22
    const side = rng() < 0.62 ? -1 : 1
    const [x, y, z] = at(t, side * out)
    if (nearRail(x, z, 3.2) || clashes(x, z, 2.4)) continue
    claim(x, z, 2.4)
    const seg = segmentFor(t)
    const lean = (rng() - 0.5) * 0.24
    parasol(
      x, y, z, headingAt(t) + lean, 2.5,
      pick(rng, [0xe86a4a, 0xe8b23a, 0x3f8fa8, 0xe8e4da, 0xd8556a]),
      seg, 980 + i,
    )
    // A towel under it, and a cooler beside it.
    clutter.push(
      {
        position: [x + Math.cos(lean * 4) * 1.2, y + 0.04, z + Math.sin(lean * 4) * 1.2],
        scale: [1.5, 0.08, 2.2], rotationY: headingAt(t) + lean * 3,
        color: pick(rng, [0xe8e4da, 0xd8556a, 0x3f8fa8, 0xe8b23a]),
        segment: seg, composite: 960 + i,
      },
      {
        position: [x - Math.cos(lean * 4) * 1.1, y + 0.2, z - Math.sin(lean * 4) * 1.1],
        scale: [0.6, 0.4, 0.42], rotationY: headingAt(t),
        color: 0x3f8fa8, segment: seg, composite: 960 + i,
      },
    )
  }
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
 * A roof only where there is a road on top of it. The ramps at either end are
 * open cuts — walls and sky — and the covered stretch is exactly the width of
 * Lake Shore Drive, because that is the thing being gone under. Roofing by
 * depth instead put a lid over the ramps too, which turns a walk that dips
 * beneath a road into a corridor with no outside.
 */
function addTunnelRoof(
  section: ResolvedSection,
  route: RouteDef,
  railLength: number,
  at: (t: number, offset: number) => [number, number, number],
  headingAt: (t: number) => number,
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

    // Only under the Drive. Two metres of margin so the deck reaches its own
    // kerbs rather than stopping short and showing daylight at the edges.
    const street = nearestStreet(x, z, 60)
    if (!street || !/Lake Shore Drive/.test(street.name)) continue
    if (street.distance > street.half + 2) continue

    // `y` is the floor. Roofing a stretch with less than head height under it
    // puts the deck through the camera.
    if (y + HEADROOM > DECK_Y) continue
    buildings.push({
      position: [x, DECK_Y + THICKNESS / 2, z],
      scale: [13, THICKNESS, 6],
      /**
       * Turned to follow the cut, not left axis-aligned.
       *
       * These are 13 by 6 metre slabs stepped along a curve. Unrotated, every
       * one of them sat square to the world while the cut turned underneath, so
       * their corners stuck out past each other and the underside of Lake Shore
       * Drive read as a row of triangular teeth.
       */
      rotationY: headingAt(t),
      color: 0x2e2822,
      segment: Math.min(route.segmentCount - 1, Math.floor(t * route.segmentCount)),
    })
  }
}

/**
 * Bulbs strung across the street, catenary and all.
 *
 * Rush Street after dark is lit almost entirely from below and from these —
 * the sun is gone by the time the route gets here, so without them the whole
 * strip is a dark corridor. They also do the thing a photograph wants: a line
 * of warm points receding down the street, which gives the shot depth that a
 * flat wall of shopfronts cannot.
 */
function addStringLights(
  section: ResolvedSection,
  route: RouteDef,
  railLength: number,
  at: (t: number, offset: number) => [number, number, number],
  poles: Prop[],
  lamps: Prop[],
): void {
  const span = section.tEnd - section.tStart
  const spanMetres = span * railLength
  /** One span of cable between two poles. */
  const SPACING = 16
  const runs = Math.max(2, Math.round(spanMetres / SPACING))
  const HEIGHT = 4.6
  const SAG = 1.05
  const SIDE = 8.6

  const segmentOf = (t: number) =>
    Math.min(route.segmentCount - 1, Math.floor(t * route.segmentCount))

  for (let side of [-1, 1] as const) {
    for (let i = 0; i <= runs; i++) {
      const t = section.tStart + (i / runs) * span
      const [px, py, pz] = at(t, SIDE * side)
      if (!buildingAt(px, pz) && !inCarriageway(px, pz)) {
        poles.push({
          position: [px, py + HEIGHT / 2, pz],
          scale: [0.09, HEIGHT, 0.09],
          rotationY: 0,
          color: 0x241f1a,
          segment: segmentOf(t),
        })
      }

      if (i === runs) continue

      // Bulbs along the span, dipping in the middle. A straight line of lights
      // reads as a strip light; the sag is what makes it a string.
      const BULBS = 9
      for (let b = 1; b < BULBS; b++) {
        const along = b / BULBS
        const bt = t + (along / runs) * span
        const dip = Math.sin(along * Math.PI) * SAG
        const [bx, by, bz] = at(bt, SIDE * side)
        /**
         * Deliberately oversized for a festoon bulb.
         *
         * A true-to-life 8 cm bulb is under a pixel at the distance these are
         * photographed from, and the cel outline draws a silhouette edge right
         * round whatever is left — every string on Rush Street came out as a
         * row of black beads. At 30 cm the outline is a rim rather than the
         * whole thing, which is also how the reference art draws a light.
         */
        lamps.push({
          position: [bx, by + HEIGHT - dip, bz],
          scale: [0.3, 0.3, 0.3],
          rotationY: 0,
          color: 0xfff2d0,
          segment: segmentOf(bt),
        })
      }
    }
  }
}

/**
 * Shopfronts for the block before Rush.
 *
 * Delaware Place is the quiet, expensive stretch, and it was a street of blank
 * frontages. Awnings, a fascia sign and a lit window per unit turn a wall into
 * a row of shops — and because it faces the sunset, the glass carries most of
 * the colour in the section.
 */
function addShopfronts(
  section: ResolvedSection,
  route: RouteDef,
  railLength: number,
  rng: () => number,
  at: (t: number, offset: number) => [number, number, number],
  headingAt: (t: number) => number,
  poles: Prop[],
  heads: Prop[],
  nearRail: (x: number, z: number, radius: number) => boolean,
): void {
  const span = section.tEnd - section.tStart
  const spanMetres = span * railLength
  const units = Math.max(4, Math.round(spanMetres / 11))
  const segmentOf = (t: number) =>
    Math.min(route.segmentCount - 1, Math.floor(t * route.segmentCount))

  // Restrained: black, cream, deep green, oxblood. The point of an expensive
  // street is that nothing on it shouts.
  const FASCIA = [0x1b1a18, 0x2a2622, 0x1f2e28, 0x3a2024, 0x24283a]
  const AWNING = [0x1b1a18, 0x2f2b26, 0x243530, 0x3a2428]

  for (let i = 0; i < units; i++) {
    const t = section.tStart + ((i + 0.5) / units) * span
    const segment = segmentOf(t)
    const heading = headingAt(t)
    const side: -1 | 1 = i % 2 === 0 ? -1 : 1

    const [railX, railY, railZ] = at(t, 0)
    const street = nearestStreet(railX, railZ)
    if (!street) continue

    const room = lateralClearance(street.x, street.z, street.rx, street.rz, 26)
    const frontage = Math.max(street.half + 2.0, room - 0.6)
    const place = (lateral: number): [number, number] => [
      street.x + street.rx * lateral * side,
      street.z + street.rz * lateral * side,
    ]

    const [fx, fz] = place(frontage - 0.5)
    if (inCarriageway(fx, fz)) continue
    /**
     * No shopfront where there is no room for one.
     *
     * The fascia, awning and lit window are mounted a little proud of the
     * building face, and on a two-metre pavement that is exactly where the
     * player walks. Skipping the unit is the honest answer: a shop with its
     * window inside your head is worse than a plain wall.
     */
    if (nearRail(fx, fz, 1.9)) continue

    // Fascia board above the window, with the shop's colour.
    heads.push({
      position: [fx, railY + 3.5, fz],
      scale: [0.5, 0.7, 6.2],
      rotationY: heading,
      color: pick(rng, FASCIA),
      segment,
    })

    // Awning out over the pavement.
    const [ax, az] = place(frontage - 1.6)
    heads.push({
      position: [ax, railY + 2.85, az],
      scale: [1.9, 0.16, 5.0],
      rotationY: heading,
      color: pick(rng, AWNING),
      segment,
    })
    for (const end of [-2.2, 2.2]) {
      const [sx, sz] = place(frontage - 2.5)
      // The awning's front supports stand on the pavement, so they have to
      // clear the wall the rest of the shopfront is mounted on.
      const poleX = sx - Math.sin(heading) * end
      const poleZ = sz - Math.cos(heading) * end
      // Also out of the path. The awning stands where the pavement is, and so
      // does the player now that the route has been moved off the carriageway
      // — a support pole through the camera is the result of two separately
      // reasonable placements meeting.
      if (buildingAt(poleX, poleZ) || inCarriageway(poleX, poleZ)) continue
      if (nearRail(poleX, poleZ, 1.6)) continue
      poles.push({
        position: [poleX, railY + 1.42, poleZ],
        scale: [0.06, 2.85, 0.06],
        rotationY: 0,
        color: 0x1b1a18,
        segment,
      })
    }

    // The lit window itself — the warm rectangle that makes a shop a shop.
    const [wx, wz] = place(frontage - 0.15)
    heads.push({
      position: [wx, railY + 1.5, wz],
      scale: [0.12, 2.1, 5.4],
      rotationY: heading,
      color: 0xffd9a8,
      segment,
    })

    /**
     * No generic kerbside box here any more.
     *
     * This placed one 0.7 m dark cube per shopfront and called it "a planter or
     * a bollard". Boutique streets now get real bins and real flower planters
     * from the street-furniture pass, which runs first and claims its ground —
     * this one did not check, so it stood its cube inside them.
     */
  }
}

/**
 * A deterministic stream per tree, so a canopy is the same canopy every load.
 *
 * Trees cannot draw from the shared generator: it is consumed in placement
 * order, and adding one lamppost anywhere upstream would reshuffle every tree
 * on the route.
 */
function rngFor(sectionId: string, index: number, side: number): () => number {
  let hash = side + 7
  for (let i = 0; i < sectionId.length; i++) hash = (hash * 31 + sectionId.charCodeAt(i)) >>> 0
  return makeRng((hash * 2654435761 + index * 40503) >>> 0)
}

/**
 * A tree canopy, as a cluster of overlapping spheres.
 *
 * Three stacked boxes read as a tree at fifty metres and as a stack of crates
 * at five. A clump of spheres of different sizes gives a lumpy, cauliflower
 * outline that holds up at both — and it is the shape the reference art uses
 * for foliage, which is much closer to a bunch of grapes than to a cone.
 *
 * Every blob is one instance of one shared sphere, so a tree costs nothing in
 * draw calls no matter how many lumps it has.
 */
function addCanopy(
  blobs: Prop[],
  rng: () => number,
  x: number,
  base: number,
  z: number,
  size: [number, number, number],
  color: number,
  segment: number,
): void {
  const [width, height] = size
  const shape = Math.floor(rng() * 3)

  // Three silhouettes: a broad round crown, a tall narrow one, and a low wide
  // one. A street of identical trees reads as wallpaper however good the tree.
  const spread = shape === 1 ? 0.62 : shape === 2 ? 1.15 : 0.88
  const rise = shape === 1 ? 1.35 : shape === 2 ? 0.72 : 1.0
  const lumps = 5 + Math.floor(rng() * 4)

  for (let i = 0; i < lumps; i++) {
    // First lump is the mass; the rest are pushed out around it.
    const t = i === 0 ? 0 : rng()
    const angle = rng() * Math.PI * 2
    const reach = i === 0 ? 0 : (0.2 + t * 0.45) * width * spread
    const lift = i === 0 ? height * 0.34 : height * (0.16 + rng() * 0.55) * rise
    const scale = (i === 0 ? 0.92 : 0.42 + rng() * 0.4) * width * spread

    blobs.push({
      position: [x + Math.cos(angle) * reach, base + lift, z + Math.sin(angle) * reach],
      scale: [scale, scale * (0.72 + rng() * 0.4), scale],
      rotationY: rng() * Math.PI,
      color,
      segment,
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
      /**
       * Nothing. The cut's retaining walls are part of the ground now —
       * `addCutWalls` builds them as one continuous surface following the same
       * samples the tunnel floor is built from.
       *
       * This used to place a run of 3.5 m boxes along both sides *as well*, and
       * a box cannot follow a curve: each one met the next at an angle, so the
       * ends swung out, gaps opened between them and daylight showed through.
       * That jumble of leaning panels was the whole of what read as "janky".
       */
      return null
    case 'alley':
      return { frontage: 10, setback: 2.8, depth: [10, 16], height: [16, 30], gapChance: 0 }
    case 'interior':
      // Walls and ceiling of the restaurant. Wide enough for a bar, stools and
      // room to walk past them — at the old 2.6 m setback the room was six
      // metres across and the gantry ended up inside the wall.
      return { frontage: 6, setback: 4.2, depth: [1, 1.4], height: [3.4, 3.6], gapChance: 0 }
  }
}

export interface FurnitureSpec {
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

export function furnitureSpec(kind: SectionKind): FurnitureSpec | null {
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

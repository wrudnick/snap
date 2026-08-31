import * as THREE from 'three'

import cityData from '@/content/geo/goldcoast.json'

/**
 * The real Chicago, extruded from OpenStreetMap footprints.
 *
 * Replaces procedurally generated massing for everything outdoors. The
 * generator was good at rhythm and palette but could never produce the actual
 * shape of the Gold Coast; these are the real building outlines with real
 * heights, projected into the game's local metre frame.
 *
 * The whole city is merged into ONE non-indexed geometry with vertex colours —
 * about a thousand buildings for a single draw call. Non-indexed is deliberate:
 * duplicated vertices give each face its own normal, so `computeVertexNormals`
 * produces hard flat shading rather than smoothing a building's corners into a
 * blob, which is exactly what the cel look needs.
 */

/** What a building kind can be. See `kindOf` in scripts/convert-osm.mjs. */
export type BuildingKind =
  | 'apartments'
  | 'hotel'
  | 'office'
  | 'retail'
  | 'church'
  | 'house'
  | 'institution'
  | 'utility'
  | 'generic'

export interface CityBuilding {
  i: number
  n?: string
  h: number
  /**
   * Storeys, where OSM has them — 74% of the district.
   *
   * The single most useful facade fact available: it puts every window row on a
   * real floor instead of on one guessed by dividing height by an assumed
   * storey height. Absent for the rest, which fall back to that guess.
   */
  l?: number
  t: BuildingKind
  /** 1 when the building has a Wikipedia or Wikidata entry. */
  k?: 1
  r: Array<[number, number]>
}

export interface CityStreet {
  n: string
  p: Array<[number, number]>
}

export interface CityData {
  origin: { lat: number; lon: number }
  buildings: CityBuilding[]
  streets: CityStreet[]
}

export const CITY = cityData as unknown as CityData

/**
 * Heights OSM gets wrong.
 *
 * The dataset is good for bulk massing — roughly two thirds of footprints carry
 * a height or storey count — but several famous buildings are mapped as multiple
 * ways, so the one carrying the name is often a podium. Trump comes back at 60 m
 * against a real 423; Tribune Tower at 22 against 141. These are the ones the
 * player will actually look at, so they're corrected by hand.
 */
const HEIGHT_OVERRIDES: Record<string, number> = {
  'Trump International Hotel & Tower Chicago': 423,
  'Tribune Tower': 141,
  'Water Tower Place': 262,
  'The Drake Hotel': 40,
  'Drake Tower': 90,
  'Palmolive Building': 173,
  'John Hancock Parking': 20,
}

/**
 * Footprints suppressed because a hand-authored landmark stands there instead.
 *
 * OSM can give the Hancock's true outline and height but not its X-bracing or
 * taper, and those are what make it recognisable — so the modelled version wins
 * and the extruded box is dropped to stop the two z-fighting.
 */
const REPLACED_BY_LANDMARK = new Set(['875 N Michigan'])

/**
 * Chicago's actual materials, banded by height.
 *
 * Low-rise here is brick and painted stone; the mid-rise is 1920s limestone and
 * terracotta; the towers are glass and dark granite. Keying palette to height
 * reproduces that stratification for free, without needing per-building tags.
 */
const PALETTES: Array<{ maxHeight: number; colors: number[] }> = [
  { maxHeight: 16, colors: [0xa87a5e, 0x96684f, 0xb08a68, 0x8d7256] },
  { maxHeight: 45, colors: [0xcfc4ad, 0xbcae94, 0xd6c9ae, 0xab9c84] },
  { maxHeight: 110, colors: [0xc3b7a0, 0xa8a091, 0x8f8d86, 0xbdb3a2] },
  { maxHeight: Infinity, colors: [0x9aa7b4, 0x8593a2, 0xa9b6c2, 0x76848f] },
]

/** Deterministic per-building colour: same city on every load. */
export function heightOf(building: CityBuilding): number {
  const override = building.n ? HEIGHT_OVERRIDES[building.n] : undefined
  return override ?? building.h
}

function colorFor(building: CityBuilding, target: THREE.Color): THREE.Color {
  const band = PALETTES.find((p) => heightOf(building) <= p.maxHeight) ?? PALETTES[3]!
  const hash = Math.abs(Math.imul(building.i | 0, 0x27d4eb2d)) >>> 0
  return target.setHex(band.colors[hash % band.colors.length]!)
}

/**
 * Fan-triangulate a roof.
 *
 * Building footprints are overwhelmingly convex or near-convex, so a fan from
 * the first vertex is correct for nearly all of them and cheap for the rest —
 * a slightly wrong roof on a concave L-shaped block is invisible from street
 * level, which is the only place this game has a camera.
 */
function roofTriangles(ring: Array<[number, number]>): Array<[number, number, number]> {
  const tris: Array<[number, number, number]> = []
  for (let i = 1; i < ring.length - 1; i++) tris.push([0, i, i + 1])
  return tris
}

export interface CityGeometry {
  geometry: THREE.BufferGeometry
  buildingCount: number
  triangleCount: number
}

export function buildCityGeometry(
  buildings: CityBuilding[] = CITY.buildings.filter(
    (b) => !b.n || !REPLACED_BY_LANDMARK.has(b.n),
  ),
): CityGeometry {
  const positions: number[] = []
  const colors: number[] = []
  // Where a fragment sits on its wall: u = metres along the face from its
  // start, v = metres above grade. Metres rather than normalised UVs, because
  // floors and window bays are real-world sizes — normalising would stretch a
  // 60 m frontage's windows to the same count as a 6 m one.
  const facade: number[] = []
  // x = wall height, y = per-building seed, z = 1 for roofs (no windows).
  const meta: number[] = []

  const color = new THREE.Color()
  let seed = 0
  let wallHeight = 0
  let isRoof = 0

  const push = (x: number, y: number, z: number, u: number, v: number) => {
    positions.push(x, y, z)
    colors.push(color.r, color.g, color.b)
    facade.push(u, v)
    meta.push(wallHeight, seed, isRoof)
  }

  for (const b of buildings) {
    const ring = b.r
    if (ring.length < 3) continue
    colorFor(b, color)
    const h = heightOf(b)

    wallHeight = h
    // Stable per-building seed so the same building lights the same windows on
    // every load — a city that reshuffles its lit windows each reload would be
    // both distracting and impossible to photograph consistently.
    seed = (Math.abs(Math.imul(b.i | 0, 0x9e3779b9)) % 10000) / 10000
    isRoof = 0

    for (let i = 0; i < ring.length; i++) {
      const [x1, z1] = ring[i]!
      const [x2, z2] = ring[(i + 1) % ring.length]!
      const width = Math.hypot(x2 - x1, z2 - z1)

      // Winding matters and is easy to get backwards. The converter normalises
      // every ring to a positive shoelace area, and in a +X-east / +Z-south
      // plane that makes the naive vertex order produce INWARD-facing walls —
      // backface culling then hides every facade and you see straight through a
      // building to its far inner walls. Reversed here so normals point out.
      push(x1, 0, z1, 0, 0)
      push(x2, h, z2, width, h)
      push(x2, 0, z2, width, 0)

      push(x1, 0, z1, 0, 0)
      push(x1, h, z1, 0, h)
      push(x2, h, z2, width, h)
    }

    // Roof, slightly lighter so rooflines read against the sky.
    color.multiplyScalar(1.12)
    isRoof = 1
    for (const [a, bIdx, c] of roofTriangles(ring)) {
      const pa = ring[a]!
      const pb = ring[bIdx]!
      const pc = ring[c]!
      // Same orientation problem: the fan order points roof normals downward.
      push(pa[0], h, pa[1], 0, 0)
      push(pc[0], h, pc[1], 0, 0)
      push(pb[0], h, pb[1], 0, 0)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.setAttribute('aFacade', new THREE.Float32BufferAttribute(facade, 2))
  geometry.setAttribute('aMeta', new THREE.Float32BufferAttribute(meta, 3))
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()

  return {
    geometry,
    buildingCount: buildings.length,
    triangleCount: positions.length / 9,
  }
}

/** Named buildings, for the minimap and for picking hero landmarks to replace. */
export function namedBuildings(): CityBuilding[] {
  return CITY.buildings.filter((b) => b.n)
}

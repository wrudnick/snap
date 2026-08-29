import { CITY, type CityBuilding } from './city'
import { carriagewayHalfWidth } from './streetWidths'

/**
 * Where the buildings are, indexed for point queries.
 *
 * Both the street builder and its tests need to ask "is there a building here",
 * a thousand footprints at a time against thousands of sample points. A flat
 * scan is a million polygon tests; a uniform grid makes it a handful.
 */

const CELL = 40

const grid = new Map<string, CityBuilding[]>()

for (const building of CITY.buildings) {
  const xs = building.r.map((p) => p[0])
  const zs = building.r.map((p) => p[1])
  const x0 = Math.floor(Math.min(...xs) / CELL)
  const x1 = Math.floor(Math.max(...xs) / CELL)
  const z0 = Math.floor(Math.min(...zs) / CELL)
  const z1 = Math.floor(Math.max(...zs) / CELL)
  for (let x = x0; x <= x1; x++) {
    for (let z = z0; z <= z1; z++) {
      const key = `${x},${z}`
      const list = grid.get(key)
      if (list) list.push(building)
      else grid.set(key, [building])
    }
  }
}

/** Ray-cast point-in-polygon on the XZ plane. */
export function contains(ring: Array<[number, number]>, x: number, z: number): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i]!
    const [xj, zj] = ring[j]!
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}

/** The building standing at this point, if any. */
export function buildingAt(x: number, z: number): CityBuilding | undefined {
  const cell = grid.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`)
  if (!cell) return undefined
  return cell.find((b) => contains(b.r, x, z))
}

/**
 * How far sideways from a point you can go before hitting a building.
 *
 * Used to decide how wide to pave a street. The alternative — a table of widths
 * per street name — is a guess, and a guess that runs wide grows a tower out of
 * the middle of the asphalt: Michigan Avenue at ten metres swallowed the Water
 * Tower, which really does stand on an island in the roadway, and the Drake.
 * The buildings already know how much room the street has.
 */
export function lateralClearance(
  x: number,
  z: number,
  rx: number,
  rz: number,
  max: number,
): number {
  for (let d = 1; d <= max; d += 1) {
    if (buildingAt(x + rx * d, z + rz * d) || buildingAt(x - rx * d, z - rz * d)) {
      return d - 1
    }
  }
  return max
}

/**
 * Street segments bucketed the same way, for "is this in a road" queries.
 *
 * Procedural props are placed at an offset from the rail, which knows nothing
 * about the streets around it. At the Triangle that put the alley's walls
 * standing in Bellevue Place and Rush Street, and the underpass's walls in Lake
 * Shore Drive — 24 of 34 procedural buildings were in a road.
 */
interface Segment {
  name: string
  ax: number
  az: number
  bx: number
  bz: number
  half: number
}

const ROAD_CELL = 60
const roads = new Map<string, Segment[]>()

for (const street of CITY.streets) {
  const half = carriagewayHalfWidth(street.n)
  for (let i = 1; i < street.p.length; i++) {
    const [ax, az] = street.p[i - 1]!
    const [bx, bz] = street.p[i]!
    const seg: Segment = { name: street.n, ax, az, bx, bz, half }
    const x0 = Math.floor(Math.min(ax, bx) / ROAD_CELL)
    const x1 = Math.floor(Math.max(ax, bx) / ROAD_CELL)
    const z0 = Math.floor(Math.min(az, bz) / ROAD_CELL)
    const z1 = Math.floor(Math.max(az, bz) / ROAD_CELL)
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        const key = `${x},${z}`
        const list = roads.get(key)
        if (list) list.push(seg)
        else roads.set(key, [seg])
      }
    }
  }
}

/** Is this point inside a street's carriageway? */
export function inCarriageway(x: number, z: number, margin = 0): boolean {
  const cx = Math.floor(x / ROAD_CELL)
  const cz = Math.floor(z / ROAD_CELL)
  for (let ox = -1; ox <= 1; ox++) {
    for (let oz = -1; oz <= 1; oz++) {
      for (const s of roads.get(`${cx + ox},${cz + oz}`) ?? []) {
        const vx = s.bx - s.ax
        const vz = s.bz - s.az
        const len2 = vx * vx + vz * vz || 1
        const t = Math.max(0, Math.min(1, ((x - s.ax) * vx + (z - s.az) * vz) / len2))
        if (Math.hypot(x - (s.ax + vx * t), z - (s.az + vz * t)) < s.half + margin) return true
      }
    }
  }
  return false
}

export interface NearestStreet {
  name: string
  /** Closest point on the centreline. */
  x: number
  z: number
  /** Unit vector right of the street's direction of travel. */
  rx: number
  rz: number
  half: number
  distance: number
}

/**
 * The street a world position belongs to.
 *
 * Street furniture used to be placed at an offset from the rail, which meant a
 * lamppost's position depended on where the *camera* went. It belongs to the
 * street instead — that is what makes the world independent of the route.
 */
export function nearestStreet(x: number, z: number, within = 40): NearestStreet | null {
  let best: NearestStreet | null = null
  const cx = Math.floor(x / ROAD_CELL)
  const cz = Math.floor(z / ROAD_CELL)
  for (let ox = -1; ox <= 1; ox++) {
    for (let oz = -1; oz <= 1; oz++) {
      for (const s of roads.get(`${cx + ox},${cz + oz}`) ?? []) {
        const vx = s.bx - s.ax
        const vz = s.bz - s.az
        const len = Math.hypot(vx, vz) || 1
        const t = Math.max(0, Math.min(1, ((x - s.ax) * vx + (z - s.az) * vz) / (len * len)))
        const px = s.ax + vx * t
        const pz = s.az + vz * t
        const distance = Math.hypot(x - px, z - pz)
        if (distance > within || (best && distance >= best.distance)) continue
        best = {
          name: s.name,
          x: px,
          z: pz,
          rx: -vz / len,
          rz: vx / len,
          half: s.half,
          distance,
        }
      }
    }
  }
  return best
}

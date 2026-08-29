import { CITY, type CityBuilding } from './city'

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

import { CITY, type CityBuilding } from './city'

/**
 * Where a hand-authored building stands, measured off its real footprint.
 *
 * The first landmark was sited by copying an OSM centroid into the route file
 * by hand and typing its footprint in beside it. That does not survive fifty
 * buildings: every one of those numbers is a chance to put the Palmolive in the
 * middle of Rush Street, and none of them updates when the map data is
 * re-extracted.
 *
 * So a landmark says only what it *looks like*. Where it is, which way it
 * faces, how big its plan is and how tall it stands all come from the same OSM
 * record the extruded city would have used — which also guarantees the model
 * and the hole it fills are in the same place.
 */

export interface LandmarkSite {
  /** OSM way id. Stable across re-extracts, unlike a name or an index. */
  id: number
  name: string
  /** Footprint centroid, world metres. */
  center: [number, number]
  /**
   * Heading of the footprint's long axis, radians about Y.
   *
   * Chicago's grid is not aligned to north, and a tower modelled square to the
   * world sits at a visible angle to the street it fronts. Taken from the
   * longest edge of the real outline, which on a rectangular plot is the
   * street frontage.
   */
  heading: number
  /** Plan size along and across that heading, metres. */
  size: [number, number]
  height: number
  /** Storeys, where OSM has them. */
  levels?: number
}

/** Longest edge of a ring, as a heading and a length. */
function longestEdge(ring: Array<[number, number]>): number {
  let best = -1
  let heading = 0
  for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i]!
    const [bx, bz] = ring[(i + 1) % ring.length]!
    const length = Math.hypot(bx - ax, bz - az)
    if (length > best) {
      best = length
      heading = Math.atan2(bx - ax, bz - az)
    }
  }
  return heading
}

/** Extent of a ring in a rotated frame. */
function extent(
  ring: Array<[number, number]>,
  center: [number, number],
  heading: number,
): [number, number] {
  const cos = Math.cos(heading)
  const sin = Math.sin(heading)
  let alongMin = Infinity
  let alongMax = -Infinity
  let acrossMin = Infinity
  let acrossMax = -Infinity

  for (const [x, z] of ring) {
    const dx = x - center[0]
    const dz = z - center[1]
    const along = dx * sin + dz * cos
    const across = dx * cos - dz * sin
    alongMin = Math.min(alongMin, along)
    alongMax = Math.max(alongMax, along)
    acrossMin = Math.min(acrossMin, across)
    acrossMax = Math.max(acrossMax, across)
  }

  return [alongMax - alongMin, acrossMax - acrossMin]
}

/**
 * Area-weighted centroid, not the average of the vertices.
 *
 * An L-shaped block has far more vertices around its notch than along its long
 * frontage, so averaging them pulls the centre into the notch — which on a
 * building the size of 900 North Michigan is most of a street's width.
 */
function centroid(ring: Array<[number, number]>): [number, number] {
  let area = 0
  let cx = 0
  let cz = 0
  for (let i = 0; i < ring.length; i++) {
    const [x1, z1] = ring[i]!
    const [x2, z2] = ring[(i + 1) % ring.length]!
    const cross = x1 * z2 - x2 * z1
    area += cross
    cx += (x1 + x2) * cross
    cz += (z1 + z2) * cross
  }
  area /= 2
  if (Math.abs(area) < 1e-6) {
    const n = ring.length
    return [
      ring.reduce((s, p) => s + p[0], 0) / n,
      ring.reduce((s, p) => s + p[1], 0) / n,
    ]
  }
  return [cx / (6 * area), cz / (6 * area)]
}

export function siteOf(building: CityBuilding): LandmarkSite {
  const center = centroid(building.r)
  const heading = longestEdge(building.r)
  return {
    id: building.i,
    name: building.n ?? `building ${building.i}`,
    center,
    heading,
    size: extent(building.r, center, heading),
    height: building.h,
    levels: building.l,
  }
}

/** Every building the map has, by OSM id. */
const BY_ID = new Map<number, CityBuilding>(CITY.buildings.map((b) => [b.i, b]))

export function siteById(id: number): LandmarkSite | null {
  const building = BY_ID.get(id)
  return building ? siteOf(building) : null
}

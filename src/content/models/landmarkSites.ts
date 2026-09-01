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
  /**
   * Plan size along and across that heading, metres.
   *
   * The largest rectangle of these proportions that fits *inside* the real
   * outline — see `inscribed`. Never the bounding box, which is what put six
   * buildings in the road.
   */
  size: [number, number]
  /** The real footprint, for anything that wants to follow it exactly. */
  ring: Array<[number, number]>
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

/** Is a point inside a ring? Even-odd crossing test. */
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
 * The largest rectangle of the footprint's proportions that fits inside it.
 *
 * A landmark is modelled out of boxes, and the box it was given was the
 * footprint's *bounding* box — which for anything that is not a rectangle is
 * bigger than the building. Measured across all fifty-two, the boxes lay
 * between 15% and 66% outside their own outlines, and six of them put a fifth
 * of their bulk in the carriageway. Buildings stood in the road.
 *
 * The bounding box is an upper bound on the building; this is a lower bound.
 * For a rectangular plot the two are the same and nothing changes. For an L or
 * a wedge the model comes out smaller than the real building rather than
 * larger — which on a street you walk down is unambiguously the better error,
 * because one of them is invisible and the other is a wall through the road.
 *
 * Found by shrinking the bounding box about the interior point furthest from
 * any edge, keeping the proportions, until every sample of its outline is
 * inside the footprint.
 */
function inscribed(
  ring: Array<[number, number]>,
  heading: number,
  bounds: [number, number],
): { center: [number, number]; size: [number, number] } {
  const cos = Math.cos(heading)
  const sin = Math.sin(heading)

  // Rotate into the building's own frame, where the rectangle is axis-aligned.
  const local = ring.map(([x, z]) => {
    return [x * cos - z * sin, x * sin + z * cos] as [number, number]
  })
  const xs = local.map((p) => p[0])
  const zs = local.map((p) => p[1])
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minZ = Math.min(...zs)
  const maxZ = Math.max(...zs)

  /**
   * Start from the interior point with the most room around it, not the
   * centroid — an L-shaped plot's centroid can sit in the notch, outside the
   * building entirely, and a rectangle grown from there fits nothing.
   */
  let best: [number, number] = [(minX + maxX) / 2, (minZ + maxZ) / 2]
  let bestClearance = -1
  const STEPS = 16
  for (let i = 0; i <= STEPS; i++) {
    for (let j = 0; j <= STEPS; j++) {
      const px = minX + ((maxX - minX) * i) / STEPS
      const pz = minZ + ((maxZ - minZ) * j) / STEPS
      if (!inRing(local, px, pz)) continue
      let clearance = Infinity
      for (let k = 0; k < local.length; k++) {
        const [ax, az] = local[k]!
        const [bx, bz] = local[(k + 1) % local.length]!
        const dx = bx - ax
        const dz = bz - az
        const len = dx * dx + dz * dz
        const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len))
        clearance = Math.min(clearance, Math.hypot(px - (ax + dx * t), pz - (az + dz * t)))
      }
      if (clearance > bestClearance) {
        bestClearance = clearance
        best = [px, pz]
      }
    }
  }

  const fits = (halfW: number, halfD: number): boolean => {
    for (let i = 0; i <= 8; i++) {
      for (const [sx, sz] of [
        [-1, -1 + (2 * i) / 8],
        [1, -1 + (2 * i) / 8],
        [-1 + (2 * i) / 8, -1],
        [-1 + (2 * i) / 8, 1],
      ] as const) {
        if (!inRing(local, best[0] + sx * halfW, best[1] + sz * halfD)) return false
      }
    }
    return true
  }

  /**
   * Search the proportions too, not only the scale.
   *
   * Shrinking the bounding box uniformly is the obvious thing and it is much
   * too pessimistic: a plot with any notch in it forces the whole rectangle
   * down to clear the notch, and the Palmolive came out 34 by 16 metres instead
   * of 70 by 32 — half the building. Letting the rectangle become longer and
   * thinner than the bounding box lets it run down the part of the plot that is
   * actually there, and the largest area wins.
   */
  let bestArea = 0
  let bestSize: [number, number] = [0, 0]

  for (let k = 0; k <= 10; k++) {
    // Aspect from much longer than the bounds to much wider.
    const aspect = 0.25 * Math.pow(4 / 0.25, k / 10)
    const unitAlong = bounds[0]
    const unitAcross = bounds[1] / aspect

    let low = 0
    let high = 1.4
    for (let i = 0; i < 16; i++) {
      const mid = (low + high) / 2
      if (fits((unitAcross * mid) / 2, (unitAlong * mid) / 2)) low = mid
      else high = mid
    }

    const along = unitAlong * low
    const across = unitAcross * low
    // Never wider than the building actually is.
    if (along > bounds[0] * 1.001 || across > bounds[1] * 1.001) continue
    const area = along * across
    if (area > bestArea) {
      bestArea = area
      bestSize = [along, across]
    }
  }

  return {
    // Back out of the building's frame into the world.
    center: [best[0] * cos + best[1] * sin, -best[0] * sin + best[1] * cos],
    size: bestSize,
  }
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
  const heading = longestEdge(building.r)
  const bounds = extent(building.r, centroid(building.r), heading)
  const fitted = inscribed(building.r, heading, bounds)
  return {
    id: building.i,
    name: building.n ?? `building ${building.i}`,
    center: fitted.center,
    heading,
    size: fitted.size,
    ring: building.r,
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

import { makeRng, pick, range, rangeInt } from '@/lib/rng'

import type { RouteDef } from '../routes/types'

/**
 * Procedural street blockout.
 *
 * Generated once from the route's seed so it's byte-identical on every load —
 * photo scores have to be comparable between runs, and E2E tests need a stable
 * world.
 *
 * Everything here is designed to be drawn with InstancedMesh. Buildings,
 * lampposts and bins are one draw call *per type* regardless of count, which is
 * what keeps an entire city street inside the draw-call budget.
 */

export interface Prop {
  position: [number, number, number]
  scale: [number, number, number]
  rotationY: number
  color: number
  /** Rail segment this prop belongs to, for content gating. */
  segment: number
}

export interface StreetData {
  buildings: Prop[]
  lamppostPoles: Prop[]
  lamppostHeads: Prop[]
  bins: Prop[]
  /** Road surface dimensions: [width, length] centred on the z midpoint. */
  road: { width: number; length: number; centerZ: number }
  sidewalk: { width: number; inner: number; height: number }
  zStart: number
  zEnd: number
}

const BUILDING_COLORS = [
  0x8b8378, 0x9c8f80, 0x6f6a63, 0xa89684, 0x7d7468, 0x93826f, 0x5f5a54,
]

const ROAD_HALF_WIDTH = 5
const SIDEWALK_INNER = 5
const SIDEWALK_WIDTH = 4.2
const SIDEWALK_HEIGHT = 0.15
const BUILDING_INNER = 9.6

export function generateStreet(route: RouteDef): StreetData {
  const rng = makeRng(route.seed)

  const zs = route.waypoints.map((w) => w[2])
  const zStart = Math.max(...zs) + 16
  const zEnd = Math.min(...zs) - 16
  const span = zStart - zEnd

  const segmentForZ = (z: number): number => {
    const f = (zStart - z) / span
    return Math.min(route.segmentCount - 1, Math.max(0, Math.floor(f * route.segmentCount)))
  }

  const buildings: Prop[] = []
  const lamppostPoles: Prop[] = []
  const lamppostHeads: Prop[] = []
  const bins: Prop[] = []

  // Buildings march down both sides with varied frontage widths and heights,
  // leaving occasional gaps that read as alleys.
  for (const side of [-1, 1] as const) {
    let z = zStart
    while (z > zEnd) {
      const depth = range(rng, 8, 18)
      const height = range(rng, 9, 30)
      const setback = range(rng, 0, 1.6)
      const width = range(rng, 10, 16)

      // An occasional gap becomes an alley — and a place to hide a rare subject.
      if (rng() < 0.12) {
        z -= range(rng, 5, 8)
        continue
      }

      const x = side * (BUILDING_INNER + setback + width / 2)
      buildings.push({
        position: [x, height / 2, z - depth / 2],
        scale: [width, height, depth],
        rotationY: 0,
        color: pick(rng, BUILDING_COLORS),
        segment: segmentForZ(z - depth / 2),
      })

      z -= depth + range(rng, 0.5, 2.5)
    }
  }

  // Lampposts at a regular cadence on both kerbs.
  for (const side of [-1, 1] as const) {
    for (let z = zStart - 6; z > zEnd; z -= 21) {
      const x = side * (SIDEWALK_INNER + 0.8)
      const segment = segmentForZ(z)
      lamppostPoles.push({
        position: [x, 2.4, z],
        scale: [0.16, 4.8, 0.16],
        rotationY: 0,
        color: 0x3f4046,
        segment,
      })
      lamppostHeads.push({
        position: [x + side * -0.5, 4.75, z],
        scale: [1.1, 0.22, 0.3],
        rotationY: 0,
        color: 0x2b2c30,
        segment,
      })
    }
  }

  // Bins scattered irregularly so the street doesn't read as a corridor of
  // repeats — and so subjects have something to hide behind, which is what makes
  // the occlusion term matter.
  const binCount = rangeInt(rng, 14, 20)
  for (let i = 0; i < binCount; i++) {
    const side = rng() < 0.5 ? -1 : 1
    const z = range(rng, zEnd + 6, zStart - 6)
    bins.push({
      position: [side * range(rng, SIDEWALK_INNER + 0.6, SIDEWALK_INNER + 3.2), 0.55, z],
      scale: [0.8, 1.1, 0.8],
      rotationY: range(rng, 0, Math.PI),
      color: pick(rng, [0x2f4f3a, 0x384b52, 0x4a3f38]),
      segment: segmentForZ(z),
    })
  }

  return {
    buildings,
    lamppostPoles,
    lamppostHeads,
    bins,
    road: { width: ROAD_HALF_WIDTH * 2, length: span, centerZ: (zStart + zEnd) / 2 },
    sidewalk: { width: SIDEWALK_WIDTH, inner: SIDEWALK_INNER, height: SIDEWALK_HEIGHT },
    zStart,
    zEnd,
  }
}

import { describe, expect, it } from 'vitest'
import { CITY } from '../src/content/models/city'
import { MIN_HALF, halfWidths } from '../src/content/models/cityGround'
import { generateEnvironment } from '../src/content/models/environment'
import { buildingAt, inCarriageway } from '../src/content/models/footprints'
import { ROUTES } from '../src/content/routes/goldcoast'
import { Rail } from '../src/game/rail'
import { resolveRoute } from '../src/game/sections'

/**
 * No building may stand in a road.
 *
 * The carriageway widths in cityGround are a judgement call — 24 street names
 * and no road classification in the export — so nothing stops one being set
 * wider than the gap the buildings actually leave. When that happens a tower
 * grows out of the middle of the asphalt, and it is only visible from the one
 * angle somebody happens to look from.
 *
 * Covers the whole network rather than the route, because the player can see
 * four intersections at a time and photograph down all of them.
 */

describe('roads', () => {
  it('has no building standing in any OSM street', () => {
    const offenders = new Set<string>()

    for (const street of CITY.streets) {
      // The widths the builder actually paints, not the configured upper bound.
      const halves = halfWidths(street, street.p)
      for (let i = 0; i < street.p.length; i++) {
        const half = halves[i]!
        // Too narrow to pave: the builder drops the street here rather than
        // painting through the inside of whatever is standing on it.
        if (half < MIN_HALF) continue
        const [x, z] = street.p[i]!
        if (buildingAt(x, z)) continue

        const next = street.p[i + 1] ?? street.p[i - 1] ?? [x, z]
        const dx = next[0] - x
        const dz = next[1] - z
        const length = Math.hypot(dx, dz) || 1
        const rx = -dz / length
        const rz = dx / length

        for (const lateral of [-half, -half / 2, half / 2, half]) {
          const hitBuilding = buildingAt(x + rx * lateral, z + rz * lateral)
          if (hitBuilding) {
            offenders.add(
              `${street.n} @ ${lateral.toFixed(1)}m — ${hitBuilding.n ?? `footprint ${hitBuilding.i}`}`,
            )
          }
        }
      }
    }

    expect([...offenders].sort()).toEqual([])
  })

  it('has no procedural building standing in a street', () => {
    // The OSM footprints were covered from the start; these were not, and they
    // are the ones placed blind — a fixed offset from a rail that knows nothing
    // about the streets around it. 24 of 34 were in a road: the alley's walls
    // in Bellevue Place and Rush Street, the underpass's in Lake Shore Drive.
    const route = ROUTES.goldcoast!
    const rail = new Rail(route)
    const { buildings } = generateEnvironment(route, rail, resolveRoute(route, rail).sections)

    const offenders = buildings.filter((p) => {
      // Anything entirely below grade is not standing in the street — it is
      // under it. The underpass's deck is exactly that: it sits in Lake Shore
      // Drive's carriageway because it is what carries Lake Shore Drive over
      // the tunnel.
      if (p.position[1] + p.scale[1] / 2 < 0.05) return false

      const [w, , d] = p.scale
      const cos = Math.cos(p.rotationY)
      const sin = Math.sin(p.rotationY)
      return ([[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]] as const).some(
        ([dx, dz]) =>
          inCarriageway(p.position[0] + dx * cos - dz * sin, p.position[2] + dx * sin + dz * cos),
      )
    })

    expect(offenders.map((p) => p.position.map(Math.round).join(','))).toEqual([])
  })

})

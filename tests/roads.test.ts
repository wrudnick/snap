import { describe, expect, it } from 'vitest'
import * as THREE from 'three'

import { CITY } from '../src/content/models/city'
import { MIN_HALF, halfWidths } from '../src/content/models/cityGround'
import { buildingAt } from '../src/content/models/footprints'
import { laneProfile } from '../src/content/models/environment'
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

  it('has no building standing in the route’s own carriageway', () => {
    // The route paints its own street, offset off the rail by ribbonShift, so
    // it can disagree with the network's idea of where the road is.
    const route = ROUTES.goldcoast!
    const rail = new Rail(route)
    const sections = resolveRoute(route, rail).sections

    const point = new THREE.Vector3()
    const right = new THREE.Vector3()
    const offenders = new Set<string>()

    const steps = Math.ceil(rail.length / 4)
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const section =
        sections.find((s) => t >= s.tStart && t < s.tEnd) ?? sections[sections.length - 1]!
      if (section.kind === 'interior' || section.kind === 'alley') continue

      const lanes = laneProfile(section.kind)
      // The carriageway is the pair of lanes either side of the centre.
      const road = lanes.filter((l) => l.height === 0)
      if (road.length < 2) continue
      const shift = section.ribbonShift ?? 0

      rail.positionAt(t, point)
      rail.rightAt(t, right)

      for (const lane of road) {
        const o = lane.offset + shift
        const hitBuilding = buildingAt(point.x + right.x * o, point.z + right.z * o)
        if (hitBuilding) {
          offenders.add(`${section.id} @ ${o.toFixed(1)}m — ${hitBuilding.n ?? `footprint ${hitBuilding.i}`}`)
        }
      }
    }

    expect([...offenders].sort()).toEqual([])
  })
})

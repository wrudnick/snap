import { describe, expect, it } from 'vitest'

import { buildingAt, inCarriageway } from '../src/content/models/footprints'
import { GOLD_COAST } from '../src/content/routes/goldcoast'
import { getSubject } from '../src/content/subjects'
import { resolvePlacements } from '../src/game/placement'
import { Rail } from '../src/game/rail'
import { resolveRoute } from '../src/game/sections'

/**
 * Where the street life ends up.
 *
 * Authored placements are metres left of the *route*, and the route is refitted
 * whenever the path moves, so every one of these offsets rots quietly. Measured
 * before any of this existed: forty pedestrians standing in four lanes of
 * traffic, twenty of the fifty-nine drivers not on a road at all, and
 * forty-two subjects of every kind — people, cars, a horse — standing inside
 * buildings. None of it was visible to any test; it showed up as "the people
 * are all in the street".
 */
const rail = new Rail(GOLD_COAST)
const sections = resolveRoute(GOLD_COAST, rail).sections
const placed = resolvePlacements(rail, sections, GOLD_COAST.subjects)

describe('street fit', () => {
  it('puts nobody inside a building', () => {
    const inside = placed
      .filter((p) => p.position && buildingAt(p.position[0], p.position[2]))
      .map((p) => `${p.id} (${p.species})`)
    expect(inside).toEqual([])
  })

  it('keeps vehicles on the road', () => {
    const off = placed
      .filter((p) => getSubject(p.species)?.habitat === 'road')
      .filter((p) => p.position && !inCarriageway(p.position[0], p.position[2]))
      .map((p) => `${p.id} (${p.species})`)
    expect(off).toEqual([])
  })

  /**
   * Pedestrians, with junctions allowed.
   *
   * Somebody standing at a corner is inside a carriageway by this test's
   * reckoning and is exactly where a person waiting to cross would be, so this
   * bounds the number rather than demanding zero. It was around forty.
   */
  it('keeps pedestrians off the road, junctions aside', () => {
    const onRoad = placed
      .filter((p) => getSubject(p.species)?.habitat === 'pavement')
      .filter((p) => p.position && inCarriageway(p.position[0], p.position[2]))
    expect(onRoad.length).toBeLessThanOrEqual(10)
  })

  /**
   * The lane a car drives down, for its whole length.
   *
   * Driving used to advance the car in a straight line along its own facing.
   * Michigan bends, Lake Shore Drive bends hard and the route turns two
   * corners, so within seconds the traffic was crossing the pavement and
   * driving through buildings. Every point of every lane has to be road.
   */
  it('gives every driver a lane that stays on the road', () => {
    const problems: string[] = []
    for (const p of placed) {
      if (!p.driveSpeed) continue
      if (!p.drivePath || p.drivePath.length < 2) {
        problems.push(`${p.id} has no lane to follow`)
        continue
      }
      for (const [x, z] of p.drivePath) {
        if (!inCarriageway(x, z)) problems.push(`${p.id} drives off the road at ${x.toFixed(0)},${z.toFixed(0)}`)
        if (buildingAt(x, z)) problems.push(`${p.id} drives through a building at ${x.toFixed(0)},${z.toFixed(0)}`)
      }
    }
    expect(problems.slice(0, 12)).toEqual([])
  })
})

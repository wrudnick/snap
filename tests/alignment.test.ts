import { describe, expect, it } from 'vitest'
import * as THREE from 'three'

import { CITY } from '../src/content/models/city'
import { ROUTES } from '../src/content/routes/goldcoast'
import { Rail } from '../src/game/rail'
import { resolveRoute } from '../src/game/sections'

/**
 * The painted street has to sit on the real one.
 *
 * The ground ribbon lays its cross-section out from the rail, which is only
 * right when the rail runs down the middle of the road — and it does not, on
 * purpose: the player walks the sidewalk. Before `ribbonShift` existed, the
 * carriageway on Michigan was painted twelve metres east of the actual
 * carriageway, which showed up as pedestrians standing on the asphalt.
 *
 * The sign of that shift is the whole risk. It is invisible in code review,
 * doubles the error when it is backwards, and only shows up in a screenshot
 * somebody happens to look closely at. So it is measured here instead.
 */

const route = ROUTES.goldcoast!
const rail = new Rail(route)
const sections = resolveRoute(route, rail).sections

/** Which OSM street each on-street section is supposed to be running along. */
const STREETS: Record<string, RegExp> = {
  lakeshore: /^East Lake Shore Drive$/,
  michigan: /^North Michigan Avenue$/,
  chestnut: /^East Chestnut Street$/,
  rush: /^North Rush Street$/,
}

/**
 * Lateral distance from the painted carriageway's centre to the real one.
 *
 * A street mapped as two parallel ways (Michigan is) has its centre midway
 * between them, so the spread's midpoint is the centreline. Points more than
 * 12 m ahead or behind belong to a cross street and are ignored.
 */
function centreErrors(sectionId: string): number[] {
  const section = sections.find((s) => s.id === sectionId)!
  const points = CITY.streets.filter((s) => STREETS[sectionId]!.test(s.n)).flatMap((s) => s.p)
  const shift = section.ribbonShift ?? 0

  const p = new THREE.Vector3()
  const r = new THREE.Vector3()
  const errors: number[] = []

  for (let k = 1; k < 10; k++) {
    const t = section.tStart + ((section.tEnd - section.tStart) * k) / 10
    rail.positionAt(t, p)
    rail.rightAt(t, r)

    const laterals: number[] = []
    for (const [x, z] of points) {
      const dx = x - p.x
      const dz = z - p.z
      // right = (-dz, dx), so the forward axis is (r.z, -r.x).
      if (Math.abs(dx * r.z + dz * -r.x) > 12) continue
      const lateral = dx * r.x + dz * r.z
      if (Math.abs(lateral) > 60) continue
      laterals.push(lateral)
    }
    if (!laterals.length) continue

    const centre = (Math.min(...laterals) + Math.max(...laterals)) / 2
    errors.push(Math.abs(centre - shift))
  }
  return errors
}

describe('street alignment', () => {
  for (const id of Object.keys(STREETS)) {
    it(`paints ${id}'s carriageway on the real one`, () => {
      const errors = centreErrors(id)
      expect(errors.length, 'samples found').toBeGreaterThan(3)

      errors.sort((a, b) => a - b)
      const median = errors[Math.floor(errors.length / 2)]!
      // Half a lane. Getting the sign backwards doubles the offset instead,
      // which is far outside this.
      expect(median, `median centreline error on ${id}`).toBeLessThan(3)
    })
  }
})

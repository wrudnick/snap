import { describe, expect, it } from 'vitest'

import { CITY } from '../src/content/models/city'
import { inCarriageway } from '../src/content/models/footprints'
import { LANDMARK_BUILDINGS, heightOf } from '../src/content/models/landmarkBuildings'
import { siteById } from '../src/content/models/landmarkSites'

/**
 * Hand-authored buildings stand where the real ones stand.
 *
 * They are modelled out of boxes sized from their OSM footprint, and the box
 * they were first given was the footprint's *bounding* box — which for anything
 * that is not a rectangle is larger than the building. Six of the fifty-two put
 * a fifth of their bulk in the carriageway and nothing caught it, because every
 * existing sweep tests props and the extruded city, and a landmark is neither.
 */

const byId = new Map(CITY.buildings.map((b) => [b.i, b]))

function inRing(ring: Array<[number, number]>, x: number, z: number): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i]!
    const [xj, zj] = ring[j]!
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}

/** Sample the plan a landmark's boxes occupy. */
function planSamples(id: number): Array<[number, number]> {
  const site = siteById(id)!
  const cos = Math.cos(site.heading)
  const sin = Math.sin(site.heading)
  const [along, across] = site.size
  const out: Array<[number, number]> = []
  for (let i = 0; i <= 16; i++) {
    for (let j = 0; j <= 16; j++) {
      const a = -along / 2 + (along * i) / 16
      const c = -across / 2 + (across * j) / 16
      out.push([
        site.center[0] + (-sin * a + cos * c),
        site.center[1] + (cos * a + sin * c),
      ])
    }
  }
  return out
}

describe('landmarks', () => {
  it('every one of them sites and builds', () => {
    const broken: string[] = []
    for (const [key, entry] of Object.entries(LANDMARK_BUILDINGS)) {
      const site = siteById(Number(key))
      if (!site) {
        broken.push(`${entry.name}: no footprint for OSM id ${key}`)
        continue
      }
      const height = heightOf(entry, site)
      if (!(height > 2)) broken.push(`${entry.name}: height ${height}`)
      if (!(site.size[0] > 1 && site.size[1] > 1)) {
        broken.push(`${entry.name}: degenerate plan ${site.size.join('x')}`)
      }
    }
    expect(broken).toEqual([])
  })

  it('none of them stands in the road', () => {
    const inRoad: string[] = []
    for (const [key, entry] of Object.entries(LANDMARK_BUILDINGS)) {
      if (!siteById(Number(key))) continue
      const samples = planSamples(Number(key))
      const hits = samples.filter(([x, z]) => inCarriageway(x, z)).length
      if (hits > 0) {
        inRoad.push(`${entry.name}: ${Math.round((100 * hits) / samples.length)}% of its plan`)
      }
    }
    expect(inRoad).toEqual([])
  })

  it('stays inside its own footprint', () => {
    /**
     * A few per cent is the sampling grid touching the outline, not the model
     * leaving it. Anything above that means the boxes are bigger than the
     * building again.
     */
    const spilling: string[] = []
    for (const [key, entry] of Object.entries(LANDMARK_BUILDINGS)) {
      const building = byId.get(Number(key))
      if (!building || !siteById(Number(key))) continue
      const samples = planSamples(Number(key))
      const outside = samples.filter(([x, z]) => !inRing(building.r, x, z)).length
      const percent = (100 * outside) / samples.length
      if (percent > 8) spilling.push(`${entry.name}: ${percent.toFixed(0)}% outside its outline`)
    }
    expect(spilling).toEqual([])
  })
})

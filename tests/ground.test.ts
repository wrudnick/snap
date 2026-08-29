import { describe, expect, it } from 'vitest'

import { laneProfile, type Lane } from '../src/content/models/environment'
import { SURFACE } from '../src/render/ground'
import type { SectionKind } from '../src/content/routes/types'

/**
 * The ground shader reads its material from a vertex attribute that interpolates
 * across each quad, which makes the *shape* of a lane profile load-bearing:
 *
 *   - two adjacent lanes sharing a kind are a solid band of that material
 *   - two adjacent lanes differing are a boundary, and the shader draws the
 *     kerb, shoreline or lawn edge there
 *
 * So a boundary has to be narrow. Mariano Park originally ran sidewalk straight
 * into lawn over eight metres, which as a colour gradient merely looked soft and
 * as a *material* gradient meant eight metres of half-paving-half-grass with a
 * kerb smeared through the middle of it. These tests are the reason that can't
 * come back.
 */

const KINDS: SectionKind[] = [
  'beach',
  'tunnel',
  'avenue',
  'boutique',
  'dining',
  'park',
  'alley',
  'interior',
]

/** Widest a material-to-material transition may be, in metres. */
const MAX_BOUNDARY_METRES = 1.5

const VALID = new Set<number>(Object.values(SURFACE))

describe('ground lane profiles', () => {
  it('gives every lane a known surface kind', () => {
    for (const kind of KINDS) {
      for (const lane of laneProfile(kind)) {
        expect(VALID.has(lane.kind), `${kind} lane at ${lane.offset}`).toBe(true)
      }
    }
  })

  it('orders lanes left to right', () => {
    for (const kind of KINDS) {
      const offsets = laneProfile(kind).map((l: Lane) => l.offset)
      expect([...offsets].sort((a, b) => a - b), kind).toEqual(offsets)
    }
  })

  it('keeps every material boundary narrow', () => {
    for (const kind of KINDS) {
      const lanes = laneProfile(kind)
      for (let i = 1; i < lanes.length; i++) {
        const a = lanes[i - 1]!
        const b = lanes[i]!
        if (a.kind === b.kind) continue
        const width = b.offset - a.offset
        expect(
          width,
          `${kind}: ${width}m of blend between surfaces ${a.kind} and ${b.kind}`,
        ).toBeLessThanOrEqual(MAX_BOUNDARY_METRES)
      }
    }
  })

  it('surrounds every road with pavement, not open blend', () => {
    for (const kind of ['avenue', 'boutique', 'dining'] as SectionKind[]) {
      const lanes = laneProfile(kind)
      const asphalt = lanes.filter((l) => l.kind === SURFACE.asphalt)
      // Two edges to a carriageway, and both need a kerb on the far side.
      expect(asphalt.length, kind).toBe(2)
      const first = lanes.indexOf(asphalt[0]!)
      const last = lanes.indexOf(asphalt[1]!)
      expect(lanes[first - 1]?.kind, `${kind} left kerb`).toBe(SURFACE.sidewalk)
      expect(lanes[last + 1]?.kind, `${kind} right kerb`).toBe(SURFACE.sidewalk)
    }
  })

  it('puts the waterline at the sand-to-water boundary', () => {
    const lanes = laneProfile('beach')
    const i = lanes.findIndex((l) => l.kind === SURFACE.water)
    expect(i).toBeGreaterThan(0)
    expect(lanes[i - 1]!.kind).toBe(SURFACE.sand)
    // Water has to keep going after the shore, or the ribbon ends at the foam.
    expect(lanes.filter((l) => l.kind === SURFACE.water).length).toBeGreaterThan(1)
  })
})

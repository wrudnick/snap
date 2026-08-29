import { describe, expect, it } from 'vitest'

import { CITY } from '../src/content/models/city'
import { buildCorridor, routeEnters } from '../src/content/models/corridor'
import { ROUTES } from '../src/content/routes/goldcoast'
import { Rail } from '../src/game/rail'
import { resolveRoute } from '../src/game/sections'

/**
 * The route is a hand-drawn spline over the real Chicago, so nothing makes the
 * two agree — and where they disagree, the camera rides straight through a
 * wall. Two blocks were doing exactly that: Walton Place ran nine metres south
 * of East Walton Street's centreline, inside the buildings on that side for the
 * length of the block, and the alley mouth clipped a corner.
 *
 * The fix is in the waypoints, which is the only place it *can* be — the
 * alternative, deleting whichever footprints the route hits, quietly removed
 * 900 North Michigan and the Drake. This is what stops it coming back.
 */

const route = ROUTES.goldcoast!
const rail = new Rail(route)
const resolved = resolveRoute(route, rail)
const corridor = buildCorridor(rail, resolved.sections)

describe('route corridor', () => {
  it('samples the whole route', () => {
    expect(corridor.length).toBeGreaterThan(100)
    for (const s of corridor) {
      // A unit right-vector, or every lateral projection means nothing.
      expect(Math.hypot(s.rx, s.rz)).toBeCloseTo(1, 3)
    }
  })

  it('never walks through a building', () => {
    const hit = CITY.buildings.filter((b) => routeEnters(b.r, corridor))
    expect(
      hit.map((b) => b.n ?? `unnamed footprint ${b.i}`),
      'the route passes through these footprints',
    ).toEqual([])
  })

  it('still goes indoors at the end, on purpose', () => {
    // The last section is inside a restaurant. If that were treated as a defect
    // the "never walks through a building" test above would be unsatisfiable
    // without deleting the building the route exists to end up in.
    expect(corridor[corridor.length - 1]!.indoors).toBe(true)
    expect(corridor.some((s) => !s.indoors)).toBe(true)
  })
})

/**
 * People need room; animals do not.
 *
 * A tourist is 1.8 m tall, so one standing two metres off the rail fills a
 * third of the frame as you walk past and clips the near plane — that is what
 * the figure looming in the corner of the Michigan Avenue shots was. A pigeon
 * or a cat at the same distance is a good photograph, which is why this is a
 * rule about people rather than about subjects.
 */
describe('subject placement', () => {
  const PEOPLE = new Set(['tourist-man', 'tourist-woman', 'old-man', 'escort', 'doorman'])
  const MIN_METRES = 2.8

  it('keeps people far enough off the rail to photograph', () => {
    const tooClose = route.subjects
      .filter((s) => PEOPLE.has(s.species) && s.at && Math.abs(s.at.offset) < MIN_METRES)
      .map((s) => `${s.id} at ${s.at!.offset}m`)

    expect(tooClose).toEqual([])
  })
})

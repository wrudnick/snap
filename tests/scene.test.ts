import { describe, expect, it } from 'vitest'

import { DEFAULT_SCORING_CONFIG as CFG } from '../src/game/scoring/config'
import { scorePhoto } from '../src/game/scoring/score'
import type {
  PhotoSnapshot,
  SpeciesDef,
  StructureObservation,
  SubjectObservation,
} from '../src/game/scoring/types'

const INDEX: Record<string, SpeciesDef> = {
  pigeon: {
    species: 'pigeon',
    displayName: 'Pigeon',
    rarity: 1,
    fallbackPose: 0.2,
    idealSize: 0.02,
    poses: { idle: { label: 'Loitering', value: 0.5 }, walk: { label: 'Walking', value: 0.5 } },
  },
  taxi: {
    species: 'taxi',
    displayName: 'Taxi',
    rarity: 2,
    fallbackPose: 0.3,
    idealSize: 0.1,
    poses: { cruise: { label: 'Cruising', value: 0.8 } },
  },
}

function actor(over: Partial<SubjectObservation> = {}): SubjectObservation {
  const size = over.bounds ? 0 : 0.14
  return {
    subjectId: 'a',
    species: 'pigeon',
    centroid: { x: 0, y: 0 },
    bounds: { minX: -size, minY: -size, maxX: size, maxY: size },
    facing: 1,
    clip: 'idle',
    clipTime: 0.5,
    visibility: 1,
    distance: 10,
    ...over,
  }
}

function building(over: Partial<StructureObservation> = {}): StructureObservation {
  return {
    structureId: 'b1',
    name: 'A Tower',
    rarity: 2,
    bounds: { minX: -0.5, minY: -0.7, maxX: 0.5, maxY: 0.7 },
    fill: 0.5,
    inFrame: 1,
    visibility: 1,
    pitch: 0,
    angularHeight: 0.4,
    faceAngle: 0.79,
    light: 0.9,
    distance: 120,
    ...over,
  }
}

const shot = (
  subjects: SubjectObservation[],
  structures: StructureObservation[] = [],
): PhotoSnapshot => ({
  photoId: 'p',
  routeId: 'goldcoast',
  t: 0.4,
  aspect: 1.5,
  subjects,
  structures,
})

describe('assembling a scene', () => {
  it('lets a building be what the photograph is of', () => {
    const r = scorePhoto(shot([actor()], [building()]), INDEX, CFG)
    expect(r.scene[0]!.kind).toBe('structure')
    expect(r.structures).toHaveLength(1)
  })

  /**
   * Supporting subjects decay by rank, so a long tail is worth almost nothing.
   *
   * A flat divisor pays by headcount, and headcount is not composition.
   */
  it('pays the second subject far more than the tenth', () => {
    // Spread wider than the cluster radius, or they collapse into one entry
    // and there is no supporting cast to measure.
    const many = Array.from({ length: 10 }, (_, i) =>
      actor({
        subjectId: `a${i}`,
        centroid: { x: -0.9 + (i % 5) * 0.45, y: i < 5 ? -0.4 : 0.4 },
      }),
    )
    const two = scorePhoto(shot(many.slice(0, 2)), INDEX, CFG)
    const ten = scorePhoto(shot(many), INDEX, CFG)

    const secondIsWorth = two.supporting
    const nextEightAreWorth = ten.supporting - two.supporting
    expect(secondIsWorth).toBeGreaterThan(0)
    /**
     * Per subject, not in total — that is what decay by rank means. Eight more
     * bodies each add a fraction of what the second one did, so filling the
     * frame with extras is never the play.
     */
    expect(nextEightAreWorth / 8).toBeLessThan(secondIsWorth / 2)
  })

  /**
   * The acceptance test for the whole scheme.
   *
   * A photograph composed of a few things doing something for each other has to
   * beat one of a crowd standing about. Decay alone cannot deliver that — it
   * only counts — which is why the value lives in the named bonuses.
   */
  it('a composed handful beats a crowd', () => {
    const composed = scorePhoto(
      shot(
        [
          // A taxi moving, small, at the base of the building: Scale and Life.
          actor({
            subjectId: 'taxi',
            species: 'taxi',
            clip: 'cruise',
            distance: 14,
            centroid: { x: -0.3, y: -0.55 },
            bounds: { minX: -0.34, minY: -0.6, maxX: -0.26, maxY: -0.5 },
          }),
          actor({ subjectId: 'p1', centroid: { x: 0.4, y: -0.5 }, distance: 9 }),
        ],
        // Two landmarks, one near and one far: Context and Depth.
        [building(), building({ structureId: 'b2', name: 'Another Tower', distance: 400 })],
      ),
      INDEX,
      CFG,
    )

    const crowd = scorePhoto(
      shot(
        Array.from({ length: 28 }, (_, i) =>
          actor({
            subjectId: `c${i}`,
            centroid: { x: -0.9 + (i % 7) * 0.3, y: -0.9 + Math.floor(i / 7) * 0.6 },
            distance: 12,
          }),
        ),
        [building()],
      ),
      INDEX,
      CFG,
    )

    expect(composed.composition.earned.length).toBeGreaterThanOrEqual(3)
    expect(composed.total).toBeGreaterThan(crowd.total)
  })

  describe('composition bonuses', () => {
    it('pays Context for two landmarks in one frame', () => {
      const one = scorePhoto(shot([], [building()]), INDEX, CFG)
      const two = scorePhoto(
        shot([], [building(), building({ structureId: 'b2', name: 'Another' })]),
        INDEX,
        CFG,
      )
      expect(one.composition.context).toBe(0)
      expect(two.composition.context).toBe(CFG.scene.bonuses.context)
    })

    it('pays Life only for something actually moving', () => {
      const still = scorePhoto(shot([actor({ clip: 'idle' })]), INDEX, CFG)
      const moving = scorePhoto(shot([actor({ clip: 'walk' })]), INDEX, CFG)
      expect(still.composition.life).toBe(0)
      expect(moving.composition.life).toBe(CFG.scene.bonuses.life)
    })

    /** Depth is a ratio, because two metres and six is as much as fifty and150. */
    it('pays Depth for separation, not for distance', () => {
      const flat = scorePhoto(
        shot([actor({ distance: 100 }), actor({ subjectId: 'b', distance: 120, centroid: { x: 0.6, y: 0 } })]),
        INDEX,
        CFG,
      )
      const deep = scorePhoto(
        shot([actor({ distance: 4 }), actor({ subjectId: 'b', distance: 40, centroid: { x: 0.6, y: 0 } })]),
        INDEX,
        CFG,
      )
      expect(flat.composition.depth).toBe(0)
      expect(deep.composition.depth).toBe(CFG.scene.bonuses.depth)
    })
  })

  /**
   * The grade is craft, the points are the scene.
   *
   * This is what makes composition safe to reward generously: money follows the
   * grade, so a scene can never be farmed for cash because cash does not
   * respond to it at all.
   */
  it('grades the primary alone while points carry the scene', () => {
    const alone = scorePhoto(shot([], [building()]), INDEX, CFG)
    const busy = scorePhoto(
      shot(
        [actor({ clip: 'walk', distance: 5 }), actor({ subjectId: 'b', centroid: { x: 0.5, y: 0 } })],
        [building(), building({ structureId: 'b2', name: 'Another', distance: 500 })],
      ),
      INDEX,
      CFG,
    )
    expect(busy.quality).toBeCloseTo(alone.quality, 6)
    expect(busy.grade).toBe(alone.grade)
    expect(busy.total).toBeGreaterThan(alone.total)
  })
})

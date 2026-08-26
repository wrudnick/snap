import { describe, expect, it } from 'vitest'

import { DEFAULT_SCORING_CONFIG as CFG } from '../src/game/scoring/config'
import {
  framedFraction,
  frameFraction,
  placementScore,
  sizeScore,
} from '../src/game/scoring/curves'
import {
  bestPerSpecies,
  directionScore,
  gradeFor,
  poseScore,
  scorePhoto,
  scoreSubject,
} from '../src/game/scoring/score'
import type {
  PhotoSnapshot,
  SpeciesDef,
  SubjectObservation,
} from '../src/game/scoring/types'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PIGEON: SpeciesDef = {
  species: 'pigeon',
  displayName: 'Pigeon',
  rarity: 1,
  poses: {
    idle: { label: 'Standing', value: 0.4 },
    peck: { label: 'Pecking', value: 0.7 },
    flap: {
      label: 'Taking off',
      value: 0.75,
      peak: [0.4, 0.6],
      peakBonus: 0.25,
    },
  },
  fallbackPose: 0.2,
}

const FOX: SpeciesDef = {
  ...PIGEON,
  species: 'fox',
  displayName: 'Fox',
  rarity: 3,
}

const INDEX: Record<string, SpeciesDef> = { pigeon: PIGEON, fox: FOX }

/**
 * A square AABB centred at (cx, cy) occupying `fraction` of the frame.
 * NDC spans 2 units per axis, so the full frame has area 4.
 */
function boundsFor(fraction: number, cx = 0, cy = 0) {
  const half = Math.sqrt(fraction * 4) / 2
  return { minX: cx - half, minY: cy - half, maxX: cx + half, maxY: cy + half }
}

/** A flawless shot: dead centre, ideal size, facing the lens, in its best pose. */
function perfectObservation(over: Partial<SubjectObservation> = {}): SubjectObservation {
  return {
    subjectId: 'p1',
    species: 'pigeon',
    centroid: { x: 0, y: 0 },
    bounds: boundsFor(CFG.size.ideal),
    facing: 1,
    clip: 'flap',
    clipTime: 0.5,
    visibility: 1,
    distance: 8,
    ...over,
  }
}

function snapshotOf(subjects: SubjectObservation[], aspect = 1): PhotoSnapshot {
  return { photoId: 'photo-1', routeId: 'downtown', t: 0.5, aspect, subjects }
}

const score = (over: Partial<SubjectObservation> = {}, aspect = 1) =>
  scoreSubject(perfectObservation(over), PIGEON, CFG, aspect)

// ---------------------------------------------------------------------------

describe('config integrity', () => {
  it('weights sum to exactly 1', () => {
    const w = CFG.weights
    expect(w.size + w.placement + w.direction + w.pose).toBeCloseTo(1, 10)
  })

  it('grades are ordered descending and reach down to zero', () => {
    const mins = CFG.grades.map((g) => g.min)
    expect([...mins].sort((a, b) => b - a)).toEqual(mins)
    expect(mins.at(-1)).toBe(0)
  })
})

describe('sizeScore', () => {
  it('peaks at the ideal fraction', () => {
    expect(sizeScore(CFG.size.ideal, CFG.size.ideal, CFG.size.sigma)).toBeCloseTo(1, 10)
  })

  it('punishes half-size and double-size equally', () => {
    const half = sizeScore(CFG.size.ideal / 2, CFG.size.ideal, CFG.size.sigma)
    const double = sizeScore(CFG.size.ideal * 2, CFG.size.ideal, CFG.size.sigma)
    expect(half).toBeCloseTo(double, 10)
    expect(half).toBeLessThan(1)
  })

  it('is zero for a subject with no area', () => {
    expect(sizeScore(0, CFG.size.ideal, CFG.size.sigma)).toBe(0)
  })

  it('falls off monotonically on both sides of the peak', () => {
    // Expressed as multiples of the ideal so retuning `ideal` can't silently
    // invalidate the test.
    const ideal = CFG.size.ideal
    const at = (multiple: number) => sizeScore(ideal * multiple, ideal, CFG.size.sigma)

    const rising = [0.1, 0.25, 0.5, 1].map(at)
    for (let i = 1; i < rising.length; i++) {
      expect(rising[i]!).toBeGreaterThan(rising[i - 1]!)
    }

    const falling = [1, 2, 4, 10].map(at)
    for (let i = 1; i < falling.length; i++) {
      expect(falling[i]!).toBeLessThan(falling[i - 1]!)
    }
  })
})

describe('placementScore', () => {
  it('is 1 at dead centre', () => {
    expect(placementScore(0, 0, CFG.placement.sigma, 1)).toBeCloseTo(1, 10)
  })

  it('decreases with distance from centre', () => {
    const centre = placementScore(0, 0, CFG.placement.sigma, 1)
    const mid = placementScore(0.4, 0, CFG.placement.sigma, 1)
    const edge = placementScore(0.9, 0, CFG.placement.sigma, 1)
    expect(mid).toBeLessThan(centre)
    expect(edge).toBeLessThan(mid)
  })

  it('is radially symmetric on a square frame', () => {
    const x = placementScore(0.5, 0, CFG.placement.sigma, 1)
    const y = placementScore(0, 0.5, CFG.placement.sigma, 1)
    expect(x).toBeCloseTo(y, 10)
  })

  it('costs more horizontally on a wide frame', () => {
    const wide = placementScore(0.5, 0, CFG.placement.sigma, 16 / 9)
    const square = placementScore(0.5, 0, CFG.placement.sigma, 1)
    expect(wide).toBeLessThan(square)
  })
})

describe('framing geometry', () => {
  it('counts a fully visible box as entirely framed', () => {
    expect(framedFraction(boundsFor(0.2))).toBeCloseTo(1, 10)
  })

  it('counts a box clipped in half as half framed', () => {
    // Spans x from 0 to 2; only 0..1 is inside the frame.
    expect(framedFraction({ minX: 0, minY: -0.5, maxX: 2, maxY: 0.5 })).toBeCloseTo(0.5, 10)
  })

  it('reports a fully off-frame box as unframed', () => {
    expect(framedFraction({ minX: 1.5, minY: -0.5, maxX: 2.5, maxY: 0.5 })).toBe(0)
  })

  it('measures frame occupancy against the full NDC area', () => {
    expect(frameFraction(boundsFor(0.25))).toBeCloseTo(0.25, 10)
    // A box covering all of NDC occupies the whole frame.
    expect(frameFraction({ minX: -1, minY: -1, maxX: 1, maxY: 1 })).toBeCloseTo(1, 10)
  })
})

describe('directionScore', () => {
  it('bands a subject facing the lens', () => {
    const r = directionScore(1, CFG.direction)
    expect(r.band).toBe('facing')
    expect(r.score).toBeCloseTo(1, 10)
  })

  it('bands a subject in profile', () => {
    expect(directionScore(0.1, CFG.direction).band).toBe('profile')
  })

  it('bands a subject facing away', () => {
    const r = directionScore(-1, CFG.direction)
    expect(r.band).toBe('away')
    expect(r.score).toBeCloseTo(0, 10)
  })

  it('increases monotonically as the subject turns toward the camera', () => {
    const samples = [-1, -0.5, -0.15, 0.2, 0.55, 0.8, 1].map(
      (f) => directionScore(f, CFG.direction).score,
    )
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]!).toBeGreaterThanOrEqual(samples[i - 1]!)
    }
  })
})

describe('poseScore', () => {
  it('uses the authored value for a known clip', () => {
    const r = poseScore(perfectObservation({ clip: 'peck', clipTime: 0 }), PIGEON)
    expect(r.score).toBeCloseTo(0.7, 10)
    expect(r.label).toBe('Pecking')
    expect(r.hitPeak).toBe(false)
  })

  it('awards the peak bonus inside the peak window', () => {
    const r = poseScore(perfectObservation({ clip: 'flap', clipTime: 0.5 }), PIGEON)
    expect(r.hitPeak).toBe(true)
    expect(r.score).toBeCloseTo(1, 10)
  })

  it('withholds the peak bonus outside the window', () => {
    const r = poseScore(perfectObservation({ clip: 'flap', clipTime: 0.9 }), PIGEON)
    expect(r.hitPeak).toBe(false)
    expect(r.score).toBeCloseTo(0.75, 10)
  })

  it('falls back for an unknown clip', () => {
    const r = poseScore(perfectObservation({ clip: 'mystery' }), PIGEON)
    expect(r.score).toBeCloseTo(PIGEON.fallbackPose, 10)
    expect(r.label).toBe('mystery')
  })
})

describe('scoreSubject — the perfect shot', () => {
  it('reaches full quality and the base score', () => {
    const s = score()
    expect(s).not.toBeNull()
    expect(s!.quality).toBeCloseTo(1, 6)
    expect(s!.points).toBeCloseTo(CFG.base, 6)
  })

  it('grades a perfect shot of a common subject as S', () => {
    const result = scorePhoto(snapshotOf([perfectObservation()]), INDEX, CFG)
    expect(result.grade).toBe('S')
  })

  it('scores each component at full marks', () => {
    const s = score()!
    expect(s.size).toBeCloseTo(1, 6)
    expect(s.placement).toBeCloseTo(1, 6)
    expect(s.direction).toBeCloseTo(1, 6)
    expect(s.pose).toBeCloseTo(1, 6)
  })
})

describe('scoreSubject — degrading one variable at a time', () => {
  const perfect = score()!

  it('loses points when off-centre, and nothing else changes', () => {
    // Kept at x=0.4 so the box stays fully inside the frame; any further and it
    // clips the edge, which would legitimately drag `size` down too and stop
    // this being a single-variable test.
    const s = score({ bounds: boundsFor(CFG.size.ideal, 0.4, 0), centroid: { x: 0.4, y: 0 } })!
    expect(s.placement).toBeLessThan(perfect.placement)
    expect(s.size).toBeCloseTo(perfect.size, 6)
    expect(s.direction).toBeCloseTo(perfect.direction, 6)
    expect(s.pose).toBeCloseTo(perfect.pose, 6)
    expect(s.points).toBeLessThan(perfect.points)
  })

  it('loses points when too far away', () => {
    const s = score({ bounds: boundsFor(0.01) })!
    expect(s.size).toBeLessThan(perfect.size)
    expect(s.points).toBeLessThan(perfect.points)
  })

  it('loses points when too close', () => {
    const s = score({ bounds: boundsFor(0.9) })!
    expect(s.size).toBeLessThan(perfect.size)
    expect(s.points).toBeLessThan(perfect.points)
  })

  it('loses points when facing away', () => {
    const s = score({ facing: -1 })!
    expect(s.direction).toBeCloseTo(0, 6)
    expect(s.directionBand).toBe('away')
    expect(s.points).toBeLessThan(perfect.points)
  })

  it('loses points in a duller pose', () => {
    const s = score({ clip: 'idle', clipTime: 0 })!
    expect(s.pose).toBeLessThan(perfect.pose)
    expect(s.points).toBeLessThan(perfect.points)
  })

  it('loses points when partly occluded', () => {
    const s = score({ visibility: 0.5 })!
    expect(s.points).toBeCloseTo(perfect.points * 0.5, 6)
  })

  it('loses points when cropped by the frame edge', () => {
    // Centroid still in frame, but the box hangs off the right edge.
    const s = score({
      centroid: { x: 0.9, y: 0 },
      bounds: { minX: 0.4, minY: -0.25, maxX: 1.4, maxY: 0.25 },
    })!
    expect(s.placement).toBeLessThan(perfect.placement)
  })
})

describe('per-species idealSize', () => {
  // A pigeon and a taxi cannot share a size target: at 5 metres a taxi fills a
  // large slice of frame and a pigeon is a speck. This is the mechanism that
  // lets both be photographed well.
  const SMALL: SpeciesDef = { ...PIGEON, species: 'small', idealSize: 0.02 }
  const LARGE: SpeciesDef = { ...PIGEON, species: 'large', idealSize: 0.2 }

  const sizeOf = (def: SpeciesDef, fraction: number) =>
    scoreSubject(
      perfectObservation({ species: def.species, bounds: boundsFor(fraction) }),
      def,
      CFG,
      1,
    )!.size

  it('rewards a small species for filling a small share of frame', () => {
    expect(sizeOf(SMALL, 0.02)).toBeCloseTo(1, 6)
    expect(sizeOf(LARGE, 0.02)).toBeLessThan(0.3)
  })

  it('rewards a large species for filling a large share of frame', () => {
    expect(sizeOf(LARGE, 0.2)).toBeCloseTo(1, 6)
    expect(sizeOf(SMALL, 0.2)).toBeLessThan(0.3)
  })

  it('falls back to the global ideal when a species omits one', () => {
    const noOverride: SpeciesDef = { ...PIGEON, idealSize: undefined }
    expect(sizeOf(noOverride, CFG.size.ideal)).toBeCloseTo(1, 6)
  })
})

describe('scoreSubject — disqualification', () => {
  it('rejects a subject below the visibility floor', () => {
    expect(score({ visibility: CFG.minVisibility - 0.01 })).toBeNull()
  })

  it('rejects a subject whose centroid is outside the frame', () => {
    expect(score({ centroid: { x: 1.2, y: 0 } })).toBeNull()
  })

  it('rejects a subject entirely off-frame', () => {
    expect(
      score({
        centroid: { x: 0.99, y: 0 },
        bounds: { minX: 1.2, minY: -0.2, maxX: 1.6, maxY: 0.2 },
      }),
    ).toBeNull()
  })
})

describe('scorePhoto', () => {
  it('scores an empty photo as zero', () => {
    const r = scorePhoto(snapshotOf([]), INDEX, CFG)
    expect(r.primary).toBeNull()
    expect(r.total).toBe(0)
    expect(r.grade).toBe('D')
  })

  it('ignores subjects with no species definition', () => {
    const r = scorePhoto(
      snapshotOf([perfectObservation({ species: 'unregistered' })]),
      INDEX,
      CFG,
    )
    expect(r.subjects).toHaveLength(0)
    expect(r.primary).toBeNull()
  })

  it('picks the best subject as primary', () => {
    const good = perfectObservation({ subjectId: 'good' })
    const bad = perfectObservation({
      subjectId: 'bad',
      centroid: { x: 0.85, y: 0.85 },
      bounds: boundsFor(0.01, 0.85, 0.85),
      facing: -1,
      clip: 'idle',
    })
    const r = scorePhoto(snapshotOf([bad, good]), INDEX, CFG)
    expect(r.primary!.subjectId).toBe('good')
    expect(r.subjects.map((s) => s.subjectId)).toEqual(['good', 'bad'])
  })

  it('awards a same-species bonus per extra bird, not a full second score', () => {
    const solo = scorePhoto(snapshotOf([perfectObservation()]), INDEX, CFG)
    const pair = scorePhoto(
      snapshotOf([
        perfectObservation({ subjectId: 'a' }),
        perfectObservation({ subjectId: 'b', centroid: { x: 0.2, y: 0 } }),
      ]),
      INDEX,
      CFG,
    )
    expect(pair.sameSpeciesBonus).toBe(CFG.bonuses.sameSpecies)
    expect(pair.total).toBe(solo.total + CFG.bonuses.sameSpecies)
    // Crucially, far less than two full subject scores.
    expect(pair.total).toBeLessThan(solo.total * 2)
  })

  it('awards a distinct-species bonus for a mixed photo', () => {
    const r = scorePhoto(
      snapshotOf([
        perfectObservation({ subjectId: 'a' }),
        perfectObservation({ subjectId: 'b', species: 'fox', centroid: { x: 0.2, y: 0 } }),
      ]),
      INDEX,
      CFG,
    )
    expect(r.distinctSpeciesBonus).toBe(CFG.bonuses.distinctSpecies)
    expect(r.sameSpeciesBonus).toBe(0)
    // The fox is rarer, so it should be the subject of the photo.
    expect(r.primary!.species).toBe('fox')
  })

  it('pays more for a rarer subject shot identically', () => {
    const common = scorePhoto(snapshotOf([perfectObservation()]), INDEX, CFG)
    const rare = scorePhoto(
      snapshotOf([perfectObservation({ species: 'fox' })]),
      INDEX,
      CFG,
    )
    expect(rare.total).toBeGreaterThan(common.total)
    expect(rare.total).toBeCloseTo(common.total * CFG.rarityMultiplier[3], 0)
  })

  it('returns an integer total', () => {
    const r = scorePhoto(snapshotOf([perfectObservation({ visibility: 0.777 })]), INDEX, CFG)
    expect(Number.isInteger(r.total)).toBe(true)
  })
})

describe('gradeFor', () => {
  it('maps quality to the expected bands', () => {
    expect(gradeFor(1, CFG).label).toBe('S')
    expect(gradeFor(0.9, CFG).label).toBe('S')
    expect(gradeFor(0.89, CFG).label).toBe('A')
    expect(gradeFor(0, CFG).label).toBe('D')
  })

  it('never returns a worse grade for higher quality', () => {
    let last = 0
    for (let q = 0; q <= 1; q += 0.02) {
      const stars = gradeFor(q, CFG).stars
      expect(stars).toBeGreaterThanOrEqual(last)
      last = stars
    }
  })
})

describe('grade is independent of rarity', () => {
  // The whole point of grading on quality rather than points: a mediocre shot of
  // a rare subject must not outrank an excellent shot of a common one.
  it('gives identical shots of common and rare subjects the same grade', () => {
    const common = scorePhoto(snapshotOf([perfectObservation()]), INDEX, CFG)
    const rare = scorePhoto(
      snapshotOf([perfectObservation({ species: 'fox' })]),
      INDEX,
      CFG,
    )
    expect(common.grade).toBe(rare.grade)
    expect(rare.total).toBeGreaterThan(common.total)
  })

  it('ranks an excellent common shot above a poor rare one', () => {
    const greatPigeon = scorePhoto(snapshotOf([perfectObservation()]), INDEX, CFG)
    const poorFox = scorePhoto(
      snapshotOf([
        perfectObservation({ species: 'fox', clip: 'idle', facing: -0.8, visibility: 0.4 }),
      ]),
      INDEX,
      CFG,
    )
    expect(greatPigeon.stars).toBeGreaterThan(poorFox.stars)
  })

  it('drops the grade when the subject is mostly hidden', () => {
    const clear = scorePhoto(snapshotOf([perfectObservation()]), INDEX, CFG)
    const hidden = scorePhoto(
      snapshotOf([perfectObservation({ visibility: 0.35 })]),
      INDEX,
      CFG,
    )
    expect(hidden.quality).toBeLessThan(clear.quality)
    expect(hidden.stars).toBeLessThan(clear.stars)
  })
})

describe('bestPerSpecies', () => {
  it('keeps only the highest-scoring photo of each species', () => {
    const great = scorePhoto(
      { ...snapshotOf([perfectObservation()]), photoId: 'great' },
      INDEX,
      CFG,
    )
    const poor = scorePhoto(
      {
        ...snapshotOf([perfectObservation({ clip: 'idle', facing: -0.5 })]),
        photoId: 'poor',
      },
      INDEX,
      CFG,
    )
    const fox = scorePhoto(
      { ...snapshotOf([perfectObservation({ species: 'fox' })]), photoId: 'fox' },
      INDEX,
      CFG,
    )

    const best = bestPerSpecies([poor, great, fox])
    expect(best.size).toBe(2)
    expect(best.get('pigeon')!.photoId).toBe('great')
    expect(best.get('fox')!.photoId).toBe('fox')
  })

  it('ignores photos with no primary subject', () => {
    const empty = scorePhoto(snapshotOf([]), INDEX, CFG)
    expect(bestPerSpecies([empty]).size).toBe(0)
  })
})

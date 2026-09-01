import { describe, expect, it } from 'vitest'

import { DEFAULT_SCORING_CONFIG as CFG } from '../src/game/scoring/config'
import { faceScore, fitScore, levelScore, scoreStructure } from '../src/game/scoring/structure'
import type { StructureObservation } from '../src/game/scoring/types'

/** A well-taken photograph of a building, which each test then degrades. */
const GOOD: StructureObservation = {
  structureId: '875',
  name: '875 N Michigan',
  rarity: 3,
  bounds: { minX: -0.45, minY: -0.6, maxX: 0.45, maxY: 0.6 },
  fill: 0.5,
  inFrame: 1,
  visibility: 1,
  pitch: 0,
  angularHeight: 0.5,
  faceAngle: 0.79,
  light: 1,
  distance: 120,
}

const q = (over: Partial<StructureObservation>) =>
  scoreStructure({ ...GOOD, ...over }, CFG).quality

describe('scoring a building', () => {
  it('weights sum to one', () => {
    // Fit is not among them — it gates the rest rather than averaging with them.
    const w = CFG.structure.weights
    expect(w.fill + w.clear + w.level + w.face).toBeCloseTo(1, 10)
  })

  it('a whole building, level, unobstructed, scores near the top', () => {
    expect(q({})).toBeGreaterThan(0.95)
  })

  /**
   * Clipping is a cliff, not a ramp.
   *
   * The single virtue a postcard of a building has is that the building is all
   * there. Losing a corner has to cost more than it intuitively feels like it
   * should, or the rule teaches nothing.
   */
  it('punishes a clipped corner steeply', () => {
    expect(fitScore(1, 3)).toBe(1)
    expect(fitScore(0.9, 3)).toBeCloseTo(0.729, 3)
    expect(fitScore(0.8, 3)).toBeCloseTo(0.512, 3)
    // Losing a tenth of the building costs more than a tenth of the score, and
    // caps what the photograph can be worth however good the rest of it is.
    expect(q({ inFrame: 0.9 })).toBeLessThan(0.74)
    expect(q({ inFrame: 0.9, light: 1, visibility: 1 })).toBeLessThan(0.74)
  })

  /**
   * The keystone rule, which is the reason the equipment tree has anything to
   * fix. Convergence is tilt times how much building you tilted at, so the same
   * tilt must be free on a shopfront and ruinous on a tower.
   */
  describe('level', () => {
    const RUIN = CFG.structure.level.ruinous

    it('is free when you are not tilting', () => {
      expect(levelScore(0, 0.5, RUIN)).toBe(1)
    })

    it('costs nothing to tilt at something small', () => {
      // Thirty degrees up at a two-storey shop.
      expect(levelScore(0.52, 0.1, RUIN)).toBeGreaterThan(0.84)
    })

    it('ruins the same tilt at a tower', () => {
      // Thirty degrees up at something filling thirty-eight degrees of frame:
      // the Hancock from the pavement, which is the shot you cannot yet take.
      expect(levelScore(0.52, 0.66, RUIN)).toBeLessThan(0.05)
    })

    it('is symmetric — looking down keystones as much as looking up', () => {
      expect(levelScore(-0.4, 0.5, RUIN)).toBeCloseTo(levelScore(0.4, 0.5, RUIN), 10)
    })
  })

  /**
   * Two right answers, and a trough between them.
   *
   * Both square-on and three-quarter are proper architectural photographs. The
   * point of naming both is that the player gets to choose; the point of the
   * trough is that the angle you land on by accident is not one of them.
   */
  describe('face', () => {
    const f = (a: number) => faceScore(a, CFG.structure.face)

    it('rewards square-on', () => {
      expect(f(0).score).toBeGreaterThan(0.95)
      expect(f(0).band).toBe('square-on')
    })

    it('rewards three-quarter', () => {
      expect(f(0.79).score).toBeGreaterThan(0.95)
      expect(f(0.79).band).toBe('three-quarter')
    })

    it('scores the mush between them lowest, but not at zero', () => {
      const trough = f(0.38)
      expect(trough.score).toBeLessThan(f(0).score - 0.3)
      expect(trough.score).toBeLessThan(f(0.79).score - 0.3)
      expect(trough.score).toBeGreaterThan(0.25)
      expect(trough.band).toBe('oblique')
    })
  })

  /** Light modifies how well you did; it cannot rescue a bad photograph. */
  it('light multiplies rather than adds', () => {
    const golden = scoreStructure({ ...GOOD, light: 1 }, CFG)
    const flat = scoreStructure({ ...GOOD, light: 0 }, CFG)
    expect(golden.quality).toBe(flat.quality)
    expect(golden.total).toBeGreaterThan(flat.total)

    // A clipped building at golden hour still loses to a whole one at midday.
    const clippedGolden = scoreStructure({ ...GOOD, inFrame: 0.75, light: 1 }, CFG)
    expect(clippedGolden.total).toBeLessThan(flat.total)
  })

  it('rarity changes what it is worth, never how well it was taken', () => {
    const common = scoreStructure({ ...GOOD, rarity: 1 }, CFG)
    const rare = scoreStructure({ ...GOOD, rarity: 3 }, CFG)
    expect(rare.quality).toBe(common.quality)
    expect(rare.total).toBeGreaterThan(common.total)
  })
})

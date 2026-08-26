import type { ScoringConfig } from './types'

/**
 * Default scoring tuning.
 *
 * Every number here is meant to be moved. During development these are bound to
 * leva sliders (see `src/ui/DevPanel.tsx`) so the curves can be felt rather than
 * reasoned about. Nothing in `score.ts` hardcodes any of it.
 */
export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  // Must sum to 1 — asserted in tests/scoring.test.ts.
  weights: {
    size: 0.3,
    placement: 0.25,
    direction: 0.2,
    pose: 0.25,
  },

  size: {
    // Fallback only — every species overrides this with its own `idealSize`,
    // because what counts as "well framed" depends entirely on how big the thing
    // actually is. Applies to species that forget to set one.
    ideal: 0.05,
    // Wide enough that "roughly the right size" still scores well. In log space,
    // sigma 1.0 keeps a subject at 1/e to e times the ideal above ~0.6.
    sigma: 1.0,
  },

  placement: {
    // At sigma 0.45, a subject halfway to the frame edge keeps ~60% of placement.
    sigma: 0.45,
  },

  direction: {
    facingThreshold: 0.55,
    profileThreshold: -0.15,
    awayFloor: 0.0,
    profileFloor: 0.35,
    facingFloor: 0.8,
  },

  // Below a quarter visible, it isn't a photo of that subject.
  minVisibility: 0.25,
  requireCentroidInFrame: true,

  base: 1000,

  rarityMultiplier: {
    1: 1.0,
    2: 1.25,
    3: 1.6,
  },

  bonuses: {
    sameSpecies: 60,
    distinctSpecies: 90,
  },

  // Thresholds on photo quality (0..1), NOT on points — see ScoringConfig.grades.
  // A perfect shot of a pigeon earns the same S as a perfect shot of a cat; the
  // cat is simply worth more points.
  grades: [
    { min: 0.9, label: 'S', stars: 5 },
    { min: 0.78, label: 'A', stars: 4 },
    { min: 0.62, label: 'B', stars: 3 },
    { min: 0.42, label: 'C', stars: 2 },
    { min: 0, label: 'D', stars: 1 },
  ],
}

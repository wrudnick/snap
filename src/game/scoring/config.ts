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

  /**
   * Buildings.
   *
   * Fit gates everything else, because "did you get the whole thing" is not one
   * question among five — it is the question a postcard asks, and the others are
   * only worth asking once it is answered.
   */
  structure: {
    // Fit is absent deliberately — it gates these rather than averaging with
    // them. Face counts least, because both of its right answers are right and
    // choosing between them is taste.
    weights: { fill: 0.3, clear: 0.3, level: 0.3, face: 0.1 },
    // Half the frame, and forgiving: a building can be a third of the picture
    // or two-thirds of it and still be a postcard.
    fill: { ideal: 0.5, sigma: 0.75 },
    // Cubed, so ninety percent in frame keeps 0.73 and eighty keeps 0.51.
    // Clipping a corner has to hurt.
    fit: { exponent: 3 },
    /**
     * 0.35 rad² is about a thirty-degree tilt at a building thirty-eight
     * degrees tall — which is roughly the Hancock from the pavement, and is
     * exactly the shot the player should be told they cannot take yet.
     */
    level: { ruinous: 0.35 },
    face: {
      squareOnSigma: 0.13,
      threeQuarter: 0.79,
      threeQuarterSigma: 0.26,
      floor: 0.3,
    },
    light: { min: 0.85, max: 1.15 },
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

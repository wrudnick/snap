/**
 * Pure data types for photo scoring.
 *
 * Nothing in `src/game/scoring/` may import three.js. The renderer's job is to
 * produce a PhotoSnapshot; everything downstream of that is arithmetic on plain
 * objects, which is what makes the whole system unit-testable.
 */

export type Rarity = 1 | 2 | 3

/** A subject as it appeared in one photo, reduced to plain numbers. */
export interface SubjectObservation {
  subjectId: string
  species: string
  /** Centroid in normalized device coords: (0,0) is frame center, ±1 the edges. */
  centroid: { x: number; y: number }
  /** Projected AABB in NDC. May exceed ±1 when the subject is clipped by the frame. */
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
  /** dot(subjectForward, towardCamera): 1 = facing the lens, -1 = facing away. */
  facing: number
  /** Animation clip playing when the shutter fired. */
  clip: string
  /** Normalized time within that clip, 0..1. */
  clipTime: number
  /** Fraction of sampled points not occluded, 0..1. */
  visibility: number
  /** Metres from camera. Tie-breaks and telemetry only. */
  distance: number
}

/** Everything the scorer needs to know about one press of the shutter. */
export interface PhotoSnapshot {
  photoId: string
  routeId: string
  /** Route progress, 0..1, when the shutter fired. */
  t: number
  /** Viewport aspect ratio, used to correct centroid distance for wide frames. */
  aspect: number
  subjects: SubjectObservation[]
}

/** One named pose of a species, and what it's worth. */
export interface PoseDef {
  label: string
  /** Base worth of catching the subject in this clip at all, 0..1. */
  value: number
  /** Normalized clip-time window [start, end] representing the peak moment. */
  peak?: [number, number]
  /** Added to `value` when the shutter lands inside `peak`. Result is clamped to 1. */
  peakBonus?: number
}

/** Per-species scoring data. Authored in `src/content/subjects/`. */
export interface SpeciesDef {
  species: string
  displayName: string
  rarity: Rarity
  poses: Record<string, PoseDef>
  /** Pose score used when the playing clip has no entry in `poses`. */
  fallbackPose: number
  /**
   * Fraction of the frame this species should fill in a well-composed shot.
   *
   * Must be per-species: a taxi filling 10% of frame is a good photograph, while
   * a pigeon filling 10% would have to be about a metre from the lens. A single
   * global target makes small subjects unscoreable. Falls back to
   * `ScoringConfig.size.ideal` when omitted.
   */
  idealSize?: number
}

export interface ScoringConfig {
  /** Must sum to 1. Enforced by a unit test. */
  weights: {
    size: number
    placement: number
    direction: number
    pose: number
  }
  size: {
    /** Fraction of frame area that scores full marks. */
    ideal: number
    /** Width of the log-gaussian falloff. Larger = more forgiving. */
    sigma: number
  }
  placement: {
    /** Width of the centering falloff, in NDC units. */
    sigma: number
  }
  direction: {
    /** facing >= this reads as "facing the camera". */
    facingThreshold: number
    /** facing >= this reads as "in profile". */
    profileThreshold: number
    /** Score at the bottom/top of each band, used to interpolate within it. */
    awayFloor: number
    profileFloor: number
    facingFloor: number
  }
  /** Subjects below this visibility are treated as not in the photo at all. */
  minVisibility: number
  /** Subjects whose centroid falls outside the frame don't count. */
  requireCentroidInFrame: boolean
  /** Maximum points a single subject can earn before bonuses and rarity. */
  base: number
  /** Multiplier applied per rarity tier, indexed 1..3. */
  rarityMultiplier: Record<Rarity, number>
  bonuses: {
    /** Points per additional subject of the primary's species. */
    sameSpecies: number
    /** Points per additional distinct species in frame. */
    distinctSpecies: number
  }
  /**
   * Grade thresholds on photo *quality*, 0..1 — not on points.
   *
   * Grade answers "how good is this photograph", which must be independent of
   * how rare the subject is. Otherwise a mediocre shot of a rare animal outranks
   * an excellent shot of a common one, and the letter stops meaning anything.
   * Rarity and bonuses inflate `total` instead, where that inflation is the
   * intended reward.
   *
   * Descending by `min`. First match wins.
   */
  grades: Array<{ min: number; label: string; stars: number }>
}

export type DirectionBand = 'facing' | 'profile' | 'away'

/** Per-subject breakdown, kept so the results screen can explain the number. */
export interface SubjectScore {
  subjectId: string
  species: string
  displayName: string
  rarity: Rarity
  size: number
  placement: number
  direction: number
  directionBand: DirectionBand
  pose: number
  poseLabel: string
  hitPeak: boolean
  visibility: number
  /** Weighted sum of the four components, 0..1, before base/rarity/visibility. */
  quality: number
  /** Final points contributed by this subject. */
  points: number
  /** Fraction of the frame this subject occupies. Surfaced for the UI. */
  frameFraction: number
}

export interface PhotoScore {
  photoId: string
  /** Highest-scoring subject: the one the photo is "of". Null if nothing qualified. */
  primary: SubjectScore | null
  /** Every qualifying subject, descending by points. */
  subjects: SubjectScore[]
  sameSpeciesBonus: number
  distinctSpeciesBonus: number
  total: number
  /** Quality of the photograph itself, 0..1. What `grade` is derived from. */
  quality: number
  grade: string
  stars: number
}

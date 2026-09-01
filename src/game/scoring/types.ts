import type { Composition, SceneEntry } from './scene'
import type { StructureBreakdown } from './structure'

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
  /**
   * Where the camera was looking, so a shot can be reproduced exactly.
   *
   * Scoring ignores this — everything it needs is already projected into the
   * observations. It is here because it travels with the photograph, and a
   * screenshot sent back as feedback is only useful if the frame it shows can
   * be stood up again after the fix.
   *
   * Optional so the hand-built snapshot literals the scoring tests are written
   * against stay valid; they are about framing, not about where the camera was.
   */
  view?: { yaw: number; pitch: number; fov: number; focalLength: number; build: string }
  subjects: SubjectObservation[]
  /**
   * Named buildings in frame.
   *
   * Optional so the hand-built snapshot literals in the scoring tests stay
   * valid — those are about how a subject was framed, and predate buildings
   * being worth anything at all.
   */
  structures?: StructureObservation[]
}

/**
 * A building as it appeared in one photograph.
 *
 * A separate shape from `SubjectObservation` because a pigeon and a cathedral
 * are not judged the same way: a building has no pose, and "facing the lens" is
 * meaningless for something with four faces. What it has instead is whether you
 * got all of it, whether anything was in the way, and whether you kept the
 * verticals upright.
 *
 * Everything here is derived from the footprint and the camera rather than from
 * scene objects. The landmarks are merged into a handful of meshes by material,
 * so there is no per-building object to interrogate — but there is a ring and a
 * height, which is all a silhouette needs.
 */
export interface StructureObservation {
  structureId: string
  name: string
  rarity: Rarity
  /** Projected silhouette bounds in NDC. May exceed ±1 when clipped. */
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
  /** Share of the frame the silhouette covers, 0..1. */
  fill: number
  /** Share of the silhouette that is inside the frame, 0..1. */
  inFrame: number
  /** Share of sampled points with a clear line of sight, 0..1. */
  visibility: number
  /** Camera pitch when the shutter fired, radians. Negative is looking down. */
  pitch: number
  /**
   * How much of the view the building stands through, radians.
   *
   * Paired with pitch to decide keystoning: tilting up at a two-storey shop
   * costs nothing and the same tilt at a tower ruins it, because convergence is
   * a product of how far you tilted and how tall the thing is in frame.
   */
  angularHeight: number
  /**
   * Angle between the view direction and the nearest facade's normal, 0..π/2.
   *
   * Zero is square-on to a wall. Around 45° is the three-quarter view that shows
   * two faces and gives a building its mass.
   */
  faceAngle: number
  /** Quality of the light where it stands, 0..1, from the section's profile. */
  light: number
  distance: number
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
  /**
   * How a building is judged. Five terms, weights summing to 1.
   *
   * Separate from the four above because they are answering a different
   * question. See `docs/SCORING.md`.
   */
  structure: {
    /**
     * Weights over the four terms Fit gates. Must sum to 1.
     *
     * Fit is not among them: it multiplies the rest rather than being averaged
     * with them. See `scoreStructure`.
     */
    weights: {
      /** Is it big in frame, with room to breathe? */
      fill: number
      /** Was anything in the way? */
      clear: number
      /** Did the verticals stay upright? */
      level: number
      /** Square-on or three-quarter, rather than the mush between. */
      face: number
    }
    fill: {
      /** Share of the frame that scores full marks. */
      ideal: number
      /** Width of the log-gaussian falloff. */
      sigma: number
    }
    fit: {
      /**
       * How steeply clipping is punished.
       *
       * A cliff rather than a ramp: a postcard with a corner of the building
       * sliced off is not a slightly worse postcard, it is a mistake. Raising
       * `inFrame` to this power is what makes the last few percent expensive.
       */
      exponent: number
    }
    level: {
      /**
       * Convergence, in radian-squared, at which Level reaches zero.
       *
       * Convergence is `|pitch| × angularHeight`, so this is one number for
       * both halves of the trade: how far you tilted and how much building you
       * tilted at.
       */
      ruinous: number
    }
    face: {
      /** Width of the square-on peak, radians. Tight — square-on is exacting. */
      squareOnSigma: number
      /** Centre and width of the three-quarter peak, radians. */
      threeQuarter: number
      threeQuarterSigma: number
      /** Score in the trough between the two, so the mush is not worthless. */
      floor: number
    }
    /** Multiplier range from the light where it stands. */
    light: { min: number; max: number }
  }
  /**
   * Can you see it at all, as distinct from how well it is framed.
   *
   * Two different questions that were being answered by one curve. `size` is a
   * judgement about framing and peaks at a species' ideal; presence is whether
   * there is anything there to judge. Measured before this existed: a person
   * sixty metres away, facing away, at the edge of the frame scored 179 points
   * with `size` at literally 0.000, earning almost all of it from `pose 0.45` —
   * twenty-five percent of the weight for happening to be mid-stride at four
   * pixels tall.
   *
   * Both are fractions of frame area.
   */
  presence: {
    /** Below this a subject is scenery and is not in the photograph at all. */
    floor: number
    /** At or above this, craft counts for full. Ramps between the two. */
    full: number
  }
  /** Subjects below this visibility are treated as not in the photo at all. */
  minVisibility: number
  /** Subjects whose centroid falls outside the frame don't count. */
  requireCentroidInFrame: boolean
  /** Maximum points a single subject can earn before bonuses and rarity. */
  base: number
  /** Multiplier applied per rarity tier, indexed 1..3. */
  rarityMultiplier: Record<Rarity, number>
  /**
   * How a photograph is assembled from everything in it.
   *
   * One subject leads and the rest contribute, decaying by rank. The decay is
   * deliberately weak, because decay can only ever reward *headcount* — the
   * real value of a scene lives in the named bonuses below, which key off
   * relationships instead.
   */
  scene: {
    /**
     * Supporting subject at rank n contributes `points / (divisor × n)`.
     *
     * A property of the lens in the end — a fisheye is an instrument for scenes
     * and a telephoto is one for subjects — with this as the standard default.
     *
     * Rank decay rather than a flat divisor because a flat one pays by
     * headcount: on Michigan Avenue, 28 supporting subjects averaging 150 points
     * would add 420 to a 900-point primary, a 47% bonus for pointing the camera
     * at the busiest thing in view. The harmonic series grows logarithmically,
     * so this turns the same crowd into about 13%.
     */
    divisor: number
    /** NDC radius within which subjects of one species count as a single group. */
    clusterRadius: number
    /**
     * A group of `n` scores `1 + growth × ln(n)` times its best member.
     *
     * Twelve pigeons is about 1.9×, not 12×. A flock in the air is one strong
     * thing that happens to be made of birds, and it must not decompose into
     * twelve weak entries that decay to nothing — which is also what makes the
     * thrown hot dog pay off.
     */
    clusterGrowth: number
    /** Flat awards for relationships rather than counts. */
    bonuses: {
      /** A small figure at the base of a large building. */
      scale: number
      /** Two or more named landmarks in one frame. */
      context: number
      /** Something in motion. */
      life: number
      /** Subjects at clearly separated distances. */
      depth: number
    }
    /** Clips that read as movement, for the Life bonus. */
    motionClips: string[]
  }
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
  /** Every named building in frame, descending by points. */
  structures: StructureBreakdown[]
  /**
   * Everything in the photograph, ranked, with flocks collapsed to one entry.
   *
   * The first is what the photograph is *of*; the rest are supporting cast.
   */
  scene: SceneEntry[]
  /** What the supporting cast contributed after rank decay. */
  supporting: number
  /** Named relationship bonuses. This is where the value of a scene lives. */
  composition: Composition
  sameSpeciesBonus: number
  distinctSpeciesBonus: number
  total: number
  /** Quality of the photograph itself, 0..1. What `grade` is derived from. */
  quality: number
  grade: string
  stars: number
}

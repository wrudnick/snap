import { clamp01, sizeScore } from './curves'
import type { ScoringConfig, StructureObservation } from './types'

/**
 * Scoring a building.
 *
 * Five terms, and each one has to be nameable on a card — a rule the player
 * cannot learn is indistinguishable from an arbitrary one. Pure arithmetic on a
 * plain object, like everything else in this directory.
 */

export interface StructureBreakdown {
  structureId: string
  name: string
  fit: number
  fill: number
  clear: number
  level: number
  face: number
  /** Named for the breakdown UI: which of the two good angles this was. */
  faceBand: 'square-on' | 'three-quarter' | 'oblique'
  light: number
  quality: number
  total: number
}

/**
 * How much of it you got.
 *
 * Raised to a power so the last few percent are expensive. A postcard with the
 * corner of a building sliced off is not a slightly worse postcard; it is the
 * one mistake this whole rubric exists to punish.
 */
export function fitScore(inFrame: number, exponent: number): number {
  return clamp01(inFrame) ** exponent
}

/**
 * Whether the verticals stayed upright.
 *
 * Convergence is the product of how far you tilted and how much building you
 * tilted at, which is why one number covers both: thirty degrees at a shopfront
 * is nothing and thirty degrees at a tower is ruinous. This is the rule the
 * equipment tree exists to answer — portrait, wide glass and eventually a shift
 * lens all buy back height without tilt.
 */
export function levelScore(
  pitch: number,
  angularHeight: number,
  ruinous: number,
): number {
  return clamp01(1 - (Math.abs(pitch) * angularHeight) / ruinous)
}

/**
 * Which of the two right answers you found.
 *
 * Square-on to a facade is the formal postcard elevation. A three-quarter view
 * shows two faces and gives a building its mass. Between them is the amateur
 * angle — not worthless, because it is still a photograph, but the trough is
 * what makes the two peaks mean something.
 */
export function faceScore(
  angle: number,
  cfg: ScoringConfig['structure']['face'],
): { score: number; band: StructureBreakdown['faceBand'] } {
  const gauss = (d: number, sigma: number) => Math.exp(-(d * d) / (2 * sigma * sigma))
  const square = gauss(angle, cfg.squareOnSigma)
  const quarter = gauss(angle - cfg.threeQuarter, cfg.threeQuarterSigma)
  const best = Math.max(square, quarter)
  /**
   * Only claim a named angle when you are actually near one.
   *
   * The threshold was 0.25, which labelled the bottom of the trough
   * "three-quarter" — twenty-two degrees off, scoring 0.50, and being told it
   * was the shot you were going for. A band that names the angle you missed is
   * worse than no band, because the player corrects away from it.
   */
  const NAMED = 0.45
  return {
    score: clamp01(cfg.floor + (1 - cfg.floor) * best),
    band: best < NAMED ? 'oblique' : square >= quarter ? 'square-on' : 'three-quarter',
  }
}

export function scoreStructure(
  obs: StructureObservation,
  config: ScoringConfig,
): StructureBreakdown {
  const cfg = config.structure
  const w = cfg.weights

  const fit = fitScore(obs.inFrame, cfg.fit.exponent)
  const fill = sizeScore(obs.fill, cfg.fill.ideal, cfg.fill.sigma)
  const clear = clamp01(obs.visibility)
  const level = levelScore(obs.pitch, obs.angularHeight, cfg.level.ruinous)
  const face = faceScore(obs.faceAngle, cfg.face)

  /**
   * Fit gates the rest; it is not averaged with them.
   *
   * Additively it was worth thirty percent, which meant a building with a
   * quarter of it cut off lost only seventeen percent of its quality — little
   * enough that golden hour paid for the mistake, and a clipped tower at dawn
   * outscored a whole one at midday. That is exactly backwards.
   *
   * It is the same rule actors already follow, where presence gates craft: you
   * cannot have caught something mid-stride if it is four pixels tall, and you
   * have not photographed a building if a quarter of it is outside the frame.
   * Everything below is a judgement about a photograph of the whole thing.
   */
  const craft = clamp01(
    w.fill * fill + w.clear * clear + w.level * level + w.face * face.score,
  )
  const quality = clamp01(fit * craft)

  /**
   * Light multiplies rather than adds.
   *
   * Golden hour cannot rescue a photograph of half a building, and flat midday
   * should not ruin a good one — it is a modifier on how well you did, not one
   * of the things you did.
   */
  const light = cfg.light.min + (cfg.light.max - cfg.light.min) * clamp01(obs.light)

  return {
    structureId: obs.structureId,
    name: obs.name,
    fit,
    fill,
    clear,
    level,
    face: face.score,
    faceBand: face.band,
    light,
    quality,
    total: Math.round(
      config.base * quality * light * clamp01(obs.visibility) * config.rarityMultiplier[obs.rarity],
    ),
  }
}

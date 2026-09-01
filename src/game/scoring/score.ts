import {
  clusterActors,
  composition,
  structureEntry,
  supportingPoints,
  type SceneEntry,
} from './scene'
import { scoreStructure } from './structure'
import {
  clamp01,
  framedFraction,
  frameFraction,
  inverseLerp,
  lerp,
  placementScore,
  sizeScore,
} from './curves'
import type {
  DirectionBand,
  PhotoScore,
  PhotoSnapshot,
  ScoringConfig,
  SpeciesDef,
  SubjectObservation,
  SubjectScore,
} from './types'

/**
 * Which way the subject is looking, as a score and a human-readable band.
 *
 * The bands exist so the results screen can say "facing the camera" rather than
 * "direction 0.83" — legibility is what stops the score feeling arbitrary. The
 * score interpolates *within* each band so there's still a smooth gradient to
 * play against.
 */
export function directionScore(
  facing: number,
  cfg: ScoringConfig['direction'],
): { score: number; band: DirectionBand } {
  const { facingThreshold, profileThreshold, awayFloor, profileFloor, facingFloor } = cfg

  if (facing >= facingThreshold) {
    return {
      score: lerp(facingFloor, 1, inverseLerp(facingThreshold, 1, facing)),
      band: 'facing',
    }
  }
  if (facing >= profileThreshold) {
    return {
      score: lerp(
        profileFloor,
        facingFloor,
        inverseLerp(profileThreshold, facingThreshold, facing),
      ),
      band: 'profile',
    }
  }
  return {
    score: lerp(awayFloor, profileFloor, inverseLerp(-1, profileThreshold, facing)),
    band: 'away',
  }
}

/** Pose value for the clip that was playing, plus whether it caught the peak moment. */
export function poseScore(
  obs: SubjectObservation,
  species: SpeciesDef,
): { score: number; label: string; hitPeak: boolean } {
  const def = species.poses[obs.clip]
  if (!def) {
    return { score: species.fallbackPose, label: obs.clip, hitPeak: false }
  }

  const hitPeak =
    def.peak !== undefined && obs.clipTime >= def.peak[0] && obs.clipTime <= def.peak[1]

  const score = clamp01(def.value + (hitPeak ? (def.peakBonus ?? 0) : 0))
  return { score, label: def.label, hitPeak }
}

/**
 * Score one subject, or return null if it doesn't count as being in the photo.
 *
 * Disqualification is deliberately strict: a subject mostly behind a bus, or one
 * whose centroid is off-frame, shouldn't quietly contribute points.
 */
export function scoreSubject(
  obs: SubjectObservation,
  species: SpeciesDef,
  config: ScoringConfig,
  aspect: number,
): SubjectScore | null {
  if (obs.visibility < config.minVisibility) return null

  if (config.requireCentroidInFrame) {
    const { x, y } = obs.centroid
    if (x < -1 || x > 1 || y < -1 || y > 1) return null
  }

  const visible = frameFraction(obs.bounds)
  if (visible <= 0) return null
  // Too small to be in the photograph at all, rather than badly framed.
  if (visible < config.presence.floor) return null

  const size = sizeScore(visible, species.idealSize ?? config.size.ideal, config.size.sigma)

  // Centering, scaled down by however much of the subject got cropped away.
  const centering = placementScore(
    obs.centroid.x,
    obs.centroid.y,
    config.placement.sigma,
    aspect,
  )
  const placement = centering * framedFraction(obs.bounds)

  const dir = directionScore(obs.facing, config.direction)
  const pose = poseScore(obs, species)

  /**
   * Presence gates craft.
   *
   * Direction and pose ask how well you caught it, and neither of them checks
   * whether you can see it — so a weighted sum let a subject fail every visual
   * criterion and still bank a quarter of the score for happening to be
   * mid-stride. You cannot have caught something mid-stride if it is four
   * pixels tall.
   *
   * Placement is gated too, and for the same reason: a speck dead centre is
   * still a speck, and centring was carrying a crowd of invisible people to
   * five hundred points on its own once pose had been dealt with. `size` is the
   * only ungated term, because size *is* the judgement about presence.
   *
   * Gated on projected area rather than on `size`, because `size` is a
   * judgement about framing that peaks at a species' ideal — a perfectly good
   * street portrait at eight metres scores 0.17 there, and multiplying craft by
   * that would gut the ordinary shot this is meant to protect.
   */
  const { floor, full } = config.presence
  const presence = clamp01((visible - floor) / Math.max(1e-9, full - floor))

  const w = config.weights
  const quality = clamp01(
    w.size * size +
      presence * (w.placement * placement + w.direction * dir.score + w.pose * pose.score),
  )

  const points =
    config.base * quality * obs.visibility * config.rarityMultiplier[species.rarity]

  return {
    subjectId: obs.subjectId,
    species: obs.species,
    displayName: species.displayName,
    rarity: species.rarity,
    size,
    placement,
    direction: dir.score,
    directionBand: dir.band,
    pose: pose.score,
    poseLabel: pose.label,
    hitPeak: pose.hitPeak,
    visibility: obs.visibility,
    quality,
    points,
    frameFraction: visible,
  }
}

/**
 * Score a whole photo.
 *
 * Following Snap: a photo is *of* one subject — the best-scoring one — and other
 * subjects contribute bonuses rather than stacking their full scores. Without
 * that rule, spraying the shutter at a flock would beat any composed shot.
 */
export function scorePhoto(
  snapshot: PhotoSnapshot,
  speciesIndex: Record<string, SpeciesDef>,
  config: ScoringConfig,
): PhotoScore {
  const scored: SubjectScore[] = []

  for (const obs of snapshot.subjects) {
    const species = speciesIndex[obs.species]
    if (!species) continue
    const s = scoreSubject(obs, species, config, snapshot.aspect)
    if (s) scored.push(s)
  }

  scored.sort((a, b) => b.points - a.points)

  /**
   * Buildings, judged by their own rubric.
   *
   * A pigeon and a cathedral are not the same question: a building has no pose,
   * and "facing the lens" is meaningless for something with four faces.
   */
  const structures = (snapshot.structures ?? [])
    .map((obs) => ({ obs, score: scoreStructure(obs, config) }))
    .sort((a, b) => b.score.total - a.score.total)

  /**
   * The scene: everything in frame, ranked, with flocks collapsed to one entry.
   *
   * Actors and buildings compete for the same first place, which is the point —
   * a superb pigeon can be the subject of a photograph that happens to contain
   * a skyline, and usually is not.
   */
  const scene: SceneEntry[] = [
    ...clusterActors(scored, snapshot.subjects, config),
    ...structures.map((x) => structureEntry(x.score, x.obs)),
  ].sort((a, b) => b.points - a.points)

  const lead = scene[0] ?? null
  const supporting = supportingPoints(scene, config.scene.divisor)
  const composed = composition(scene, config)

  // Kept for the album's per-species bests, which are about actors.
  const primary = scored[0] ?? null
  let sameSpeciesBonus = 0
  let distinctSpeciesBonus = 0
  if (primary) {
    const sameSpecies = scored.filter((s) => s.species === primary.species).length - 1
    sameSpeciesBonus = sameSpecies * config.bonuses.sameSpecies
    const distinct = new Set(scored.map((s) => s.species)).size - 1
    distinctSpeciesBonus = distinct * config.bonuses.distinctSpecies
  }

  const total = Math.round((lead?.points ?? 0) + supporting + composed.total)

  /**
   * The grade is the *primary's* craft, and nothing else.
   *
   * Points carry the scene; the letter carries how well you took the thing you
   * took. Otherwise a careless snap of a busy street earns an S and the grade
   * stops being feedback. It is also what makes composition safe to reward
   * generously — money follows the grade, so a scene can never be farmed for
   * cash because cash does not respond to it.
   */
  const quality = lead ? lead.quality * lead.visibility : 0
  const grade = gradeFor(quality, config)

  return {
    photoId: snapshot.photoId,
    primary,
    subjects: scored,
    structures: structures.map((x) => x.score),
    scene,
    supporting: Math.round(supporting),
    composition: composed,
    sameSpeciesBonus: Math.round(sameSpeciesBonus),
    distinctSpeciesBonus: Math.round(distinctSpeciesBonus),
    total,
    quality,
    grade: grade.label,
    stars: grade.stars,
  }
}

/** First grade whose threshold the quality clears. Config is ordered descending. */
export function gradeFor(
  quality: number,
  config: ScoringConfig,
): { label: string; stars: number } {
  for (const g of config.grades) {
    if (quality >= g.min) return { label: g.label, stars: g.stars }
  }
  // Config always ends with a min-0 entry, but be defensive rather than throw
  // mid-results-screen.
  return { label: '—', stars: 0 }
}

/**
 * Best photo per species across a set of scored photos — what the album keeps.
 * A photo only ever counts toward the species of its primary subject.
 */
export function bestPerSpecies(photos: PhotoScore[]): Map<string, PhotoScore> {
  const best = new Map<string, PhotoScore>()
  for (const p of photos) {
    if (!p.primary) continue
    const current = best.get(p.primary.species)
    if (!current || p.total > current.total) best.set(p.primary.species, p)
  }
  return best
}

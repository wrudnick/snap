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

  const w = config.weights
  const quality = clamp01(
    w.size * size + w.placement * placement + w.direction * dir.score + w.pose * pose.score,
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
  const primary = scored[0] ?? null

  let sameSpeciesBonus = 0
  let distinctSpeciesBonus = 0

  if (primary) {
    const sameSpecies = scored.filter((s) => s.species === primary.species).length - 1
    sameSpeciesBonus = sameSpecies * config.bonuses.sameSpecies

    const distinct = new Set(scored.map((s) => s.species)).size - 1
    distinctSpeciesBonus = distinct * config.bonuses.distinctSpecies
  }

  const total = Math.round(
    (primary?.points ?? 0) + sameSpeciesBonus + distinctSpeciesBonus,
  )

  // Grade on the photograph, not the points: composition scaled by how much of
  // the subject was actually visible. A half-occluded subject isn't a good shot
  // however well it was framed.
  const quality = primary ? primary.quality * primary.visibility : 0
  const grade = gradeFor(quality, config)

  return {
    photoId: snapshot.photoId,
    primary,
    subjects: scored,
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

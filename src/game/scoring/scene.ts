import type { StructureBreakdown } from './structure'
import type { Rarity, ScoringConfig, StructureObservation, SubjectObservation } from './types'
import type { SubjectScore } from './types'

/**
 * Assembling a photograph out of everything in it.
 *
 * One subject leads, the rest contribute by rank, and relationships between
 * them are paid for separately. Pure arithmetic on plain objects, like the rest
 * of this directory.
 */

/** Anything that can be the subject of a photograph. */
export interface SceneEntry {
  kind: 'actor' | 'structure'
  /** Species for an actor, OSM id for a building. */
  id: string
  label: string
  /** What it was doing, or which face you shot: the rest of its identity. */
  sublabel: string
  /**
   * Which postcard slot this photograph would fill.
   *
   * The rack holds one card per slot, so this is what decides whether a shot is
   * a new postcard or a better version of one you already sell. Species and
   * pose for an actor — "taxi driver, yelling" and "taxi driver, parked" are
   * different cards — and building and face for a structure, because the same
   * tower square-on and three-quarter are genuinely two postcards.
   *
   * Light is deliberately not in it. It is a multiplier inside the rubric
   * instead, so dawn is how you turn a B into an A in a slot you already own,
   * rather than the game minting three times as many slots.
   */
  slot: string
  rarity: Rarity
  points: number
  quality: number
  visibility: number
  centroid: { x: number; y: number }
  /** Share of the frame it covers. */
  size: number
  distance: number
  /** How many were collapsed into this one entry. */
  count: number
  moving: boolean
}

export interface Composition {
  scale: number
  context: number
  life: number
  depth: number
  total: number
  /** Which ones fired, for the breakdown UI. */
  earned: string[]
}

/**
 * Collapse a flock into one thing.
 *
 * Twelve pigeons in the air is one strong subject that happens to be made of
 * birds. Left as twelve entries they rank against each other and decay to
 * nothing, which would mean the most photogenic event in the game — a flock
 * going up, which the player can *cause* — scored worse than a single pigeon
 * standing still.
 */
export function clusterActors(
  scored: SubjectScore[],
  observations: SubjectObservation[],
  config: ScoringConfig,
): SceneEntry[] {
  const byId = new Map(observations.map((o) => [o.subjectId, o]))
  const { clusterRadius, clusterGrowth, motionClips } = config.scene

  const groups: Array<{ best: SubjectScore; members: SubjectScore[] }> = []

  // Highest first, so each group forms around its strongest member.
  for (const s of [...scored].sort((a, b) => b.points - a.points)) {
    const obs = byId.get(s.subjectId)
    if (!obs) continue
    const near = groups.find((g) => {
      if (g.best.species !== s.species) return false
      const o = byId.get(g.best.subjectId)
      if (!o) return false
      return Math.hypot(o.centroid.x - obs.centroid.x, o.centroid.y - obs.centroid.y) <= clusterRadius
    })
    if (near) near.members.push(s)
    else groups.push({ best: s, members: [s] })
  }

  return groups.map((g) => {
    const obs = byId.get(g.best.subjectId)!
    const n = g.members.length
    const area = (obs.bounds.maxX - obs.bounds.minX) * (obs.bounds.maxY - obs.bounds.minY)
    return {
      kind: 'actor' as const,
      id: g.best.species,
      label: g.best.displayName,
      sublabel: g.best.poseLabel,
      slot: `actor:${g.best.species}:${g.best.poseLabel}`,
      rarity: g.best.rarity,
      points: g.best.points * (1 + clusterGrowth * Math.log(n)),
      quality: g.best.quality,
      visibility: g.best.visibility,
      centroid: obs.centroid,
      size: Math.max(0, area) / 4,
      distance: obs.distance,
      count: n,
      moving: motionClips.includes(obs.clip),
    }
  })
}

/** A scored building, as a scene entry. */
export function structureEntry(
  scored: StructureBreakdown,
  obs: StructureObservation,
): SceneEntry {
  return {
    kind: 'structure',
    id: scored.structureId,
    label: scored.name,
    sublabel: scored.faceBand,
    slot: `structure:${scored.structureId}:${scored.faceBand}`,
    rarity: obs.rarity,
    points: scored.total,
    quality: scored.quality,
    visibility: obs.visibility,
    centroid: {
      x: (obs.bounds.minX + obs.bounds.maxX) / 2,
      y: (obs.bounds.minY + obs.bounds.maxY) / 2,
    },
    size: obs.fill,
    distance: obs.distance,
    count: 1,
    moving: false,
  }
}

/**
 * What the supporting cast is worth.
 *
 * Rank decay: the entry at rank n contributes `points / (divisor × n)`. Weak on
 * purpose — decay responds to headcount and nothing else, so leaning on it to
 * make scenes matter would make *crowds* matter instead.
 */
export function supportingPoints(entries: SceneEntry[], divisor: number): number {
  let total = 0
  for (let i = 1; i < entries.length; i++) {
    total += entries[i]!.points / (divisor * i)
  }
  return total
}

/**
 * Relationships, paid for by name.
 *
 * This is where the value of a scene actually lives. Decay can only reward
 * counting; these ask whether the things in frame are doing something *for each
 * other*, which is what separates a photograph of a street from a photograph of
 * a crowd.
 */
export function composition(
  entries: SceneEntry[],
  config: ScoringConfig,
): Composition {
  const b = config.scene.bonuses
  const structures = entries.filter((e) => e.kind === 'structure')
  const actors = entries.filter((e) => e.kind === 'actor')
  const earned: string[] = []

  /** A person or vehicle small in frame against a building that fills it. */
  const big = structures.find((s) => s.size > 0.15)
  const scale =
    big && actors.some((a) => a.size < 0.012 && a.centroid.y < big.centroid.y) ? b.scale : 0
  if (scale) earned.push('Scale')

  // Two landmarks in one frame is a photograph *of somewhere*.
  const context = structures.length >= 2 ? b.context : 0
  if (context) earned.push('Context')

  const life = actors.some((a) => a.moving) ? b.life : 0
  if (life) earned.push('Life')

  /**
   * Foreground against background.
   *
   * A factor of three rather than a fixed gap, because depth is a ratio: two
   * metres and six is as much separation as fifty and a hundred and fifty.
   */
  const near = Math.min(...entries.map((e) => e.distance))
  const far = Math.max(...entries.map((e) => e.distance))
  const depth = entries.length >= 2 && far / Math.max(near, 0.5) >= 3 ? b.depth : 0
  if (depth) earned.push('Depth')

  return { scale, context, life, depth, total: scale + context + life + depth, earned }
}

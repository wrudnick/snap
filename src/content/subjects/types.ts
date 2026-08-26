import type { SpeciesDef } from '@/game/scoring/types'

/** Which procedural placeholder builder to use, until real .glb models land. */
export type ModelKind = 'bird' | 'quadruped' | 'vehicle'

/**
 * One entry in a subject's behaviour loop.
 *
 * The behaviour system is a weighted random walk: pick a clip, hold it for a
 * random duration in range, pick again. That's enough to make poses something
 * the player has to wait for and time, which is the whole game.
 *
 * `trigger` is unused in v1 (aim-and-shoot only) but the field exists so a call
 * button or a thrown item can promote a clip later without reshaping the data.
 */
export interface BehaviorDef {
  clip: string
  minSeconds: number
  maxSeconds: number
  /** Relative likelihood of being chosen. */
  weight: number
  /** Reserved: only reachable when externally triggered. */
  trigger?: string
}

export interface SubjectDef extends SpeciesDef {
  model: ModelKind
  palette: { body: number; accent: number }
  /** Uniform scale applied to the placeholder model. */
  scale: number
  behaviors: BehaviorDef[]
}

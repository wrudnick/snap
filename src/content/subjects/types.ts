import type { SpeciesDef } from '@/game/scoring/types'

/** Which procedural placeholder builder to use, until real .glb models land. */
export type ModelKind = 'bird' | 'quadruped' | 'vehicle' | 'humanoid'

/**
 * Appearance ranges for a class of person.
 *
 * Every field is a palette rather than a value: a class describes a *kind* of
 * person, and each individual draws from it deterministically using their own
 * placement seed. Two tourists should never be the same tourist.
 */
export interface HumanSpec {
  /** Metres, before per-person jitter. */
  height: number
  /** Torso and limb thickness multiplier. 0.85 slim, 1.2 heavy. */
  build: number
  skin: number[]
  hair: number[]
  top: number[]
  bottom: number[]
  /** Accessories this class may carry; each is rolled independently. */
  accessories?: Array<'cap' | 'sunhat' | 'coat' | 'bag' | 'tote' | 'heels' | 'bald'>
  /** How stooped, in radians of forward torso lean. */
  stoop?: number
}

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
  /** Required when `model` is 'humanoid'. */
  human?: HumanSpec
  /** Uniform scale applied to the placeholder model. */
  scale: number
  behaviors: BehaviorDef[]
}

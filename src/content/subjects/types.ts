import type { SpeciesDef } from '@/game/scoring/types'

/** Which procedural placeholder builder to use, until real .glb models land. */
export type ModelKind =
  | 'bird'
  | 'quadruped'
  | 'vehicle'
  | 'humanoid'
  | 'bicycle'
  | 'horse'
  | 'bus'

/**
 * What kind of vehicle, within the one builder.
 *
 * A police cruiser, an Uber and a plain sedan are the same shape with different
 * things on the roof and in the windscreen, so they share a builder and differ
 * by this rather than by three near-identical copies of the geometry.
 */
export interface VehicleSpec {
  body?: 'sedan' | 'suv'
  /** Roof light bar, in the two colours it alternates between. */
  lightBar?: boolean
  /** What is stuck to the car to say what it is doing. */
  sign?: 'taxi' | 'rideshare' | 'delivery' | 'none'
  /** Livery stripe down the side, for a cruiser. */
  stripe?: number
  /**
   * Body colours to draw from, per instance.
   *
   * Traffic is the one place where sameness reads worst: eight identical grey
   * sedans on a street is obviously eight copies of one object, where eight
   * differently-coloured ones is traffic. Picked from the placement seed like
   * a person's outfit, so the same car is the same car on every load.
   */
  bodyPalette?: number[]
}

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
  accessories?: Array<
    | 'cap'
    | 'sunhat'
    | 'coat'
    | 'bag'
    | 'tote'
    | 'heels'
    | 'bald'
    | 'helmet'
    | 'hivis'
    | 'bedroll'
    | 'badge'
  >
  /**
   * Hair silhouettes this class may roll, as indexes into the style table in
   * `buildHumanoid`: 0 cropped, 1 bob, 2 spikes, 3 volume.
   *
   * Unconstrained, a businesswoman rolls liberty spikes one time in four. The
   * point of the styles is variety within what the class would plausibly wear,
   * so classes that would not wear all four say so.
   */
  hairStyles?: number[]
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
  /** Required when `model` is 'vehicle'; also styles a bicycle's rider. */
  vehicle?: VehicleSpec
  /** The person on the bike or the horse. */
  rider?: HumanSpec
  /** Uniform scale applied to the placeholder model. */
  scale: number
  behaviors: BehaviorDef[]
}

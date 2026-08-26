import type { SpeciesDef } from '@/game/scoring/types'

import type { SubjectDef } from './types'

/**
 * The subject registry.
 *
 * Pose `value`s are the tuning surface for "what makes a good photo of this
 * thing". A pigeon standing there is worth little; catching one mid-take-off at
 * the top of the wingbeat is worth everything. `peak` windows are what turn a
 * pose from something you find into something you time.
 */

const PIGEON: SubjectDef = {
  species: 'pigeon',
  displayName: 'Pigeon',
  rarity: 1,
  model: 'bird',
  palette: { body: 0x6b7280, accent: 0x9ca3af },
  scale: 1,
  fallbackPose: 0.2,
  // A pigeon photographed well sits around 1-4% of frame; zooming is what
  // brings it into range. See SpeciesDef.idealSize.
  idealSize: 0.02,
  poses: {
    idle: { label: 'Loitering', value: 0.3 },
    peck: { label: 'Pecking', value: 0.55, peak: [0.35, 0.6], peakBonus: 0.15 },
    strut: { label: 'Strutting', value: 0.6 },
    flap: { label: 'Taking off', value: 0.8, peak: [0.3, 0.55], peakBonus: 0.2 },
  },
  behaviors: [
    { clip: 'idle', minSeconds: 1.5, maxSeconds: 3.5, weight: 4 },
    { clip: 'peck', minSeconds: 1.2, maxSeconds: 2.4, weight: 3 },
    { clip: 'strut', minSeconds: 2.0, maxSeconds: 3.5, weight: 2 },
    { clip: 'flap', minSeconds: 1.0, maxSeconds: 1.6, weight: 1 },
  ],
}

const DOG: SubjectDef = {
  species: 'dog',
  displayName: 'Dog',
  rarity: 2,
  model: 'quadruped',
  palette: { body: 0xb45309, accent: 0x78350f },
  scale: 1.15,
  fallbackPose: 0.25,
  idealSize: 0.05,
  poses: {
    sit: { label: 'Sitting', value: 0.4 },
    sniff: { label: 'Sniffing', value: 0.55 },
    trot: { label: 'Trotting', value: 0.7 },
    bark: { label: 'Barking', value: 0.9, peak: [0.2, 0.45], peakBonus: 0.1 },
  },
  behaviors: [
    { clip: 'sit', minSeconds: 2.0, maxSeconds: 4.0, weight: 3 },
    { clip: 'sniff', minSeconds: 1.5, maxSeconds: 3.0, weight: 3 },
    { clip: 'trot', minSeconds: 2.0, maxSeconds: 3.5, weight: 2 },
    { clip: 'bark', minSeconds: 1.0, maxSeconds: 1.8, weight: 1 },
  ],
}

const CAT: SubjectDef = {
  species: 'cat',
  displayName: 'Cat',
  rarity: 3,
  model: 'quadruped',
  palette: { body: 0x1f2937, accent: 0xf9fafb },
  scale: 0.8,
  fallbackPose: 0.3,
  idealSize: 0.03,
  poses: {
    loaf: { label: 'Loafing', value: 0.45 },
    prowl: { label: 'Prowling', value: 0.7 },
    stretch: { label: 'Stretching', value: 0.95, peak: [0.4, 0.65], peakBonus: 0.05 },
  },
  behaviors: [
    { clip: 'loaf', minSeconds: 2.5, maxSeconds: 5.0, weight: 4 },
    { clip: 'prowl', minSeconds: 2.0, maxSeconds: 4.0, weight: 3 },
    { clip: 'stretch', minSeconds: 1.6, maxSeconds: 2.4, weight: 1 },
  ],
}

const TAXI: SubjectDef = {
  species: 'taxi',
  displayName: 'Taxi',
  rarity: 1,
  model: 'vehicle',
  palette: { body: 0xfacc15, accent: 0x111827 },
  scale: 1,
  fallbackPose: 0.3,
  idealSize: 0.10,
  poses: {
    parked: { label: 'Parked', value: 0.3 },
    cruise: { label: 'Cruising', value: 0.6 },
    // A taxi has no interesting poses, so its ceiling is deliberately lower than
    // a living subject's. Composition has to carry the shot.
    turn: { label: 'Pulling away', value: 0.75, peak: [0.3, 0.6], peakBonus: 0.1 },
  },
  behaviors: [
    { clip: 'parked', minSeconds: 3.0, maxSeconds: 6.0, weight: 3 },
    { clip: 'cruise', minSeconds: 3.0, maxSeconds: 5.0, weight: 3 },
    { clip: 'turn', minSeconds: 1.5, maxSeconds: 2.5, weight: 1 },
  ],
}

export const SUBJECTS: Record<string, SubjectDef> = {
  pigeon: PIGEON,
  dog: DOG,
  cat: CAT,
  taxi: TAXI,
}

/** The scoring core only needs the SpeciesDef half of each entry. */
export const SPECIES_INDEX: Record<string, SpeciesDef> = SUBJECTS

export const getSubject = (species: string): SubjectDef | undefined => SUBJECTS[species]

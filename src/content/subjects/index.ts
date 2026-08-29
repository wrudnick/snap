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


// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

/**
 * Shared human palettes.
 *
 * Kept as module constants so classes can compose them: a tourist and an old man
 * draw skin from the same range but nothing else. Colour lists rather than free
 * generation keeps the shared toon material cache small and the street looking
 * art-directed instead of randomised.
 */
const SKIN = [0xf0c9a4, 0xe0ab7f, 0xc98a5e, 0xa0673f, 0x77482a, 0x5a3620, 0xf7dcc0]
const HAIR = [0x2b2118, 0x120e0a, 0x6b4a2c, 0x9a7443, 0xc9b18a, 0x8e8e8e, 0xd6d2cb]
// Baggy-trouser colours from the reference: washed denim, olive, and the
// slate-navy that most of that crowd wears.
const DENIM = [0x3f5470, 0x2f4258, 0x55637a, 0x1f2a38, 0x4a5240, 0x6b6f52]

const TOURIST_MAN: SubjectDef = {
  species: 'tourist-man',
  displayName: 'Tourist',
  rarity: 1,
  model: 'humanoid',
  palette: { body: 0xcc5544, accent: 0x334455 },
  scale: 1,
  fallbackPose: 0.25,
  // A person 6 m away fills a few percent of frame; zoom brings them into range.
  idealSize: 0.04,
  human: {
    height: 1.78,
    build: 1.02,
    skin: SKIN,
    hair: HAIR,
    // Saturated but slightly muted — the reference sits between cartoon and
    // grubby, and fully clean primaries read as toy-like next to it.
    top: [0xd94f3d, 0x2f9c86, 0xe8b23a, 0x3d6fa8, 0xe4e0d6, 0xc9552f, 0x7fae4a],
    bottom: [...DENIM, 0x8a7f6a, 0x4a4a4a],
    accessories: ['cap', 'bag', 'stripes'],
  },
  poses: {
    idle: { label: 'Standing', value: 0.3 },
    walk: { label: 'Walking', value: 0.45 },
    talk: { label: 'Talking', value: 0.6 },
    // The whole reason to put tourists on the Magnificent Mile.
    gawk: { label: 'Gawking upward', value: 0.9, peak: [0.3, 0.7], peakBonus: 0.1 },
  },
  behaviors: [
    { clip: 'idle', minSeconds: 2.0, maxSeconds: 4.0, weight: 3 },
    { clip: 'walk', minSeconds: 2.5, maxSeconds: 5.0, weight: 3 },
    { clip: 'talk', minSeconds: 2.0, maxSeconds: 3.5, weight: 2 },
    { clip: 'gawk', minSeconds: 2.0, maxSeconds: 3.2, weight: 2 },
  ],
}

const TOURIST_WOMAN: SubjectDef = {
  ...TOURIST_MAN,
  species: 'tourist-woman',
  displayName: 'Tourist',
  palette: { body: 0xe08a5a, accent: 0x445566 },
  human: {
    height: 1.66,
    build: 0.94,
    skin: SKIN,
    hair: HAIR,
    top: [0xe86a8a, 0xf0c04a, 0x3fa89c, 0xe8e2d4, 0xa45f9c, 0xdc6f4a, 0x2f6f7a],
    bottom: [...DENIM, 0xe8e2d4, 0x6a5f52],
    accessories: ['sunhat', 'tote', 'stripes'],
  },
}

const OLD_MAN: SubjectDef = {
  species: 'old-man',
  displayName: 'Old Man',
  rarity: 2,
  model: 'humanoid',
  palette: { body: 0x6a6258, accent: 0x3a3630 },
  scale: 1,
  fallbackPose: 0.3,
  idealSize: 0.045,
  human: {
    height: 1.7,
    build: 1.06,
    skin: [0xe8c6a8, 0xd4a882, 0xb98d68, 0x8d6544, 0xf2d9c0],
    // Grey and white weighted heavily.
    hair: [0xb8b4ad, 0xd6d2cb, 0x8e8e8e, 0xe8e6e0, 0x6b6660],
    top: [0x5f6b78, 0x7a6a55, 0x4a5560, 0x8a7f6a],
    bottom: [0x4a4a4a, 0x3a3630, 0x5a5348],
    accessories: ['coat', 'cap', 'bald'],
    // A slight forward lean does more for reading as elderly than any palette.
    stoop: 0.1,
  },
  poses: {
    idle: { label: 'Standing', value: 0.35 },
    walk: { label: 'Shuffling', value: 0.5 },
    talk: { label: 'Holding forth', value: 0.75 },
    rest: { label: 'Leaning', value: 0.85, peak: [0.3, 0.7], peakBonus: 0.1 },
  },
  behaviors: [
    { clip: 'idle', minSeconds: 2.5, maxSeconds: 5.0, weight: 3 },
    { clip: 'walk', minSeconds: 3.0, maxSeconds: 5.5, weight: 2 },
    { clip: 'talk', minSeconds: 2.5, maxSeconds: 4.0, weight: 2 },
    { clip: 'rest', minSeconds: 3.0, maxSeconds: 6.0, weight: 3 },
  ],
}

const ESCORT: SubjectDef = {
  species: 'escort',
  displayName: 'Companion',
  rarity: 3,
  model: 'humanoid',
  palette: { body: 0x2a2430, accent: 0xc9a45f },
  scale: 1,
  fallbackPose: 0.35,
  idealSize: 0.045,
  human: {
    height: 1.72,
    build: 0.9,
    skin: SKIN,
    hair: [0x1a1410, 0x4a2f1c, 0x8e6a3a, 0xc9a45f, 0xd6c9a8],
    top: [0x1c1a22, 0x8a1f3a, 0xc9a45f, 0x2a2430, 0xe8e2d4],
    bottom: [0x1c1a22, 0x2a2430, 0x8a1f3a],
    accessories: ['heels', 'tote', 'coat'],
  },
  poses: {
    idle: { label: 'Waiting', value: 0.45 },
    walk: { label: 'Walking', value: 0.6 },
    talk: { label: 'In conversation', value: 0.8 },
    rest: { label: 'Leaning on the rail', value: 0.95, peak: [0.35, 0.7], peakBonus: 0.05 },
  },
  behaviors: [
    { clip: 'idle', minSeconds: 2.5, maxSeconds: 5.0, weight: 4 },
    { clip: 'walk', minSeconds: 2.0, maxSeconds: 4.0, weight: 2 },
    { clip: 'talk', minSeconds: 2.5, maxSeconds: 4.5, weight: 3 },
    { clip: 'rest', minSeconds: 3.0, maxSeconds: 5.0, weight: 2 },
  ],
}

const DOORMAN: SubjectDef = {
  species: 'doorman',
  displayName: 'Doorman',
  rarity: 2,
  model: 'humanoid',
  palette: { body: 0x2f3a4a, accent: 0xc9a45f },
  scale: 1,
  fallbackPose: 0.35,
  idealSize: 0.045,
  human: {
    height: 1.8,
    build: 1.05,
    skin: SKIN,
    hair: HAIR,
    // A uniform, so the palette is deliberately narrow — that uniformity is the
    // point, and it contrasts with the tourists around him.
    top: [0x2f3a4a, 0x3a2f2a],
    bottom: [0x22262e, 0x2b2420],
    accessories: ['cap', 'coat'],
  },
  poses: {
    idle: { label: 'At the door', value: 0.4 },
    walk: { label: 'Walking', value: 0.4 },
    talk: { label: 'Greeting', value: 0.75 },
    gawk: { label: 'Hailing a cab', value: 0.95, peak: [0.3, 0.7], peakBonus: 0.05 },
  },
  behaviors: [
    { clip: 'idle', minSeconds: 3.0, maxSeconds: 6.0, weight: 4 },
    { clip: 'talk', minSeconds: 2.0, maxSeconds: 3.5, weight: 2 },
    { clip: 'gawk', minSeconds: 2.0, maxSeconds: 3.0, weight: 1 },
  ],
}

export const SUBJECTS: Record<string, SubjectDef> = {
  pigeon: PIGEON,
  dog: DOG,
  cat: CAT,
  taxi: TAXI,
  'tourist-man': TOURIST_MAN,
  'tourist-woman': TOURIST_WOMAN,
  'old-man': OLD_MAN,
  escort: ESCORT,
  doorman: DOORMAN,
}

/** The scoring core only needs the SpeciesDef half of each entry. */
export const SPECIES_INDEX: Record<string, SpeciesDef> = SUBJECTS

export const getSubject = (species: string): SubjectDef | undefined => SUBJECTS[species]

import type { SpeciesDef } from '@/game/scoring/types'

import type { BehaviorDef, SubjectDef } from './types'

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
  habitat: 'any',
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
    /**
     * The peak is the top of the wingbeat, which is a quarter of the way in.
     *
     * It was 30–55%, and on an eight-tenths-of-a-second clip that is 0.24s to
     * 0.44s — the downstroke passing through horizontal, with the wings at
     * seven degrees. The bonus was being paid for the least photogenic instant
     * of the beat, and the comment on the clip itself claimed the peak was the
     * top of it. The extremes are at 25% and 75%; this brackets the first,
     * where the wings are at full spread and the body is still rising.
     */
    flap: { label: 'Taking off', value: 0.8, peak: [0.19, 0.33], peakBonus: 0.2 },
  },
  behaviors: [
    { clip: 'idle', minSeconds: 1.5, maxSeconds: 3.5, weight: 4 },
    { clip: 'peck', minSeconds: 1.2, maxSeconds: 2.4, weight: 3 },
    { clip: 'strut', minSeconds: 2.0, maxSeconds: 3.5, weight: 2 },
    { clip: 'flap', minSeconds: 1.0, maxSeconds: 1.6, weight: 1 },
    /**
     * The two reactions, and the reason throwing is worth having.
     *
     * `flap` is the most valuable pose a pigeon has and the peak window is
     * narrow, so catching a take-off was previously a matter of standing in the
     * right place until the behaviour rotation happened to pick it. Now it is
     * something you can cause — and the weights are irrelevant here, because a
     * triggered behaviour is never chosen at random.
     */
    { clip: 'peck', minSeconds: 2.5, maxSeconds: 4.0, weight: 0, trigger: 'food' },
    { clip: 'flap', minSeconds: 1.4, maxSeconds: 2.2, weight: 0, trigger: 'startle' },
  ],
  reactions: [
    /**
     * Pecking at food announces a flock, which is what brings the cat.
     *
     * The bird does not know a cat is listening — it broadcasts what it *is*,
     * not who should care, and every species decides for itself whether birds
     * on a pavement are interesting. Nothing else in the game currently
     * answers to `birds`, and that is fine: it costs a walk over a list.
     */
    {
      trigger: 'food',
      senses: 11,
      steps: [{ clip: 'peck', hold: 3.2, broadcast: 'birds' }],
    },
  ],
}

const DOG: SubjectDef = {
  species: 'dog',
  habitat: 'pavement',
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
  reactions: [
    /**
     * The dog is the reason the reaction system stopped being a clip swap.
     *
     * Four beats, in the order a dog actually does them: catches the scent and
     * casts about for it, comes over at a trot, noses at it and takes it, and
     * is pleased about it afterwards.
     *
     * The payoff is deliberately at the end. `bark` is the most valuable pose a
     * dog has and it has a peak window, so the best photograph on offer here is
     * one the player set up and then waited for — which is a better thing to
     * ask of them than reacting fast, and it is the shape Snap's own best
     * moments have.
     *
     * Thirty-four metres is a long way to notice something from, and it is the
     * point: a dog's nose reaches much further than a pigeon's eye, so a hot
     * dog thrown down the block pulls one in from off-screen. Throw a second
     * and you are gathering a pack.
     */
    {
      trigger: 'food',
      senses: 34,
      steps: [
        { clip: 'sniff', hold: 0.8 },
        { clip: 'trot', hold: 'arrive', speed: 3.4 },
        { clip: 'sniff', hold: 1.2, consume: true },
        { clip: 'bark', hold: 2.4 },
      ],
    },
    /**
     * Landing one on a dog does not make it flee — it makes it excited, which
     * is both what a dog does and the more useful photograph.
     */
    {
      trigger: 'startle',
      senses: 6,
      steps: [
        { clip: 'bark', hold: 1.4 },
        { clip: 'sniff', hold: 1.0, consume: true },
        { clip: 'bark', hold: 1.8 },
      ],
    },
  ],
}

const CAT: SubjectDef = {
  species: 'cat',
  habitat: 'any',
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
  reactions: [
    /**
     * The chain: your hot dog gathers pigeons, and the pigeons bring the cat.
     *
     * Nothing was thrown at the cat. It is the rarest thing on the street and
     * the only reliable way to make one do anything is two steps removed from
     * the player's hand, which is the best kind of thing a photography game can
     * ask for.
     *
     * Slow on purpose. A cat crosses twenty metres at 1.5 m/s in a crouch, and
     * the stalk is most of the photograph — `prowl` is worth 0.7 on its own,
     * so the approach is a shot in its own right rather than dead time before
     * one.
     *
     * The pounce broadcasts `startle`, so the flock goes up because of the cat
     * rather than because of anything the player did. Birds already mid-peck
     * ignore it, which is what keeps the scattered flock from calling the cat
     * straight back.
     */
    {
      trigger: 'birds',
      senses: 26,
      steps: [
        { clip: 'prowl', hold: 'arrive', speed: 1.5 },
        { clip: 'stretch', hold: 1.6, broadcast: 'startle' },
        { clip: 'prowl', hold: 2.2 },
      ],
    },
  ],
}

const TAXI: SubjectDef = {
  species: 'taxi',
  habitat: 'road',
  displayName: 'Taxi',
  rarity: 1,
  model: 'vehicle',
  palette: { body: 0xfacc15, accent: 0x111827 },
  // Without this the vehicle builder saw an empty spec and gave a Chicago cab
  // no roof sign and no chequers — it was simply a yellow car.
  vehicle: { sign: 'taxi', bodyPalette: [0xfacc15, 0xf5c518, 0xefb810] },
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
  habitat: 'pavement',
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
    accessories: ['cap', 'bag'],
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
    /**
     * People look at what lands near them.
     *
     * `gawk` is a tourist stopping to stare, which is exactly the posture, and
     * it is worth more than idle — so a thrown hot dog turns a row of people
     * who were facing away into a row of faces.
     */
    { clip: 'gawk', minSeconds: 1.6, maxSeconds: 2.8, weight: 0, trigger: 'food' },
    { clip: 'gawk', minSeconds: 1.2, maxSeconds: 2.0, weight: 0, trigger: 'startle' },
  ],
}

const TOURIST_WOMAN: SubjectDef = {
  ...TOURIST_MAN,
  species: 'tourist-woman',
  habitat: 'pavement',
  displayName: 'Tourist',
  palette: { body: 0xe08a5a, accent: 0x445566 },
  human: {
    height: 1.66,
    build: 0.94,
    skin: SKIN,
    hair: HAIR,
    top: [0xe86a8a, 0xf0c04a, 0x3fa89c, 0xe8e2d4, 0xa45f9c, 0xdc6f4a, 0x2f6f7a],
    bottom: [...DENIM, 0xe8e2d4, 0x6a5f52],
    accessories: ['sunhat', 'tote'],
  },
}

const OLD_MAN: SubjectDef = {
  species: 'old-man',
  habitat: 'pavement',
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
  habitat: 'pavement',
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
  habitat: 'pavement',
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
    /**
     * People look at what lands near them.
     *
     * `gawk` is a tourist stopping to stare, which is exactly the posture, and
     * it is worth more than idle — so a thrown hot dog turns a row of people
     * who were facing away into a row of faces.
     */
    { clip: 'gawk', minSeconds: 1.6, maxSeconds: 2.8, weight: 0, trigger: 'food' },
    { clip: 'gawk', minSeconds: 1.2, maxSeconds: 2.0, weight: 0, trigger: 'startle' },
  ],
}


// ---------------------------------------------------------------------------
// Traffic
// ---------------------------------------------------------------------------

/**
 * Shared vehicle behaviour.
 *
 * A car has no interesting poses of its own — it is parked, moving, or turning
 * — so every one of them scores the same way and the shot has to be carried by
 * composition. Which is correct: the reason to photograph a car is what it is
 * and where it is, not what it is doing.
 */
const DRIVING: BehaviorDef[] = [
  { clip: 'parked', minSeconds: 3.0, maxSeconds: 6.0, weight: 3 },
  { clip: 'cruise', minSeconds: 3.0, maxSeconds: 5.0, weight: 3 },
  { clip: 'turn', minSeconds: 1.5, maxSeconds: 2.5, weight: 1 },
]

const DRIVING_POSES = {
  parked: { label: 'Parked', value: 0.3 },
  cruise: { label: 'Cruising', value: 0.6 },
  turn: { label: 'Pulling away', value: 0.75, peak: [0.3, 0.6] as [number, number], peakBonus: 0.1 },
}

/**
 * What cars in a city are actually painted.
 *
 * Mostly greys, white and black — that is genuinely what a street looks like —
 * with enough red, blue and green in the mix that a row of parked cars is a row
 * of different cars rather than one car repeated.
 */
const CAR_COLOURS = [
  0xd8dade, 0xb4b8bd, 0x8e9299, 0x5f646b, 0x33363b, 0x1b1d22,
  0x8c3a35, 0xa8443c, 0x2f4a6b, 0x3d5f7a, 0x35543f, 0x6b5a34,
  0xc9b48a, 0x7a3f52,
]

const SEDAN: SubjectDef = {
  species: 'sedan',
  habitat: 'road',
  displayName: 'Car',
  rarity: 1,
  model: 'vehicle',
  palette: { body: 0x8e9299, accent: 0x1b1d22 },
  vehicle: { body: 'sedan', sign: 'none', bodyPalette: CAR_COLOURS },
  scale: 1,
  fallbackPose: 0.3,
  idealSize: 0.1,
  poses: DRIVING_POSES,
  behaviors: DRIVING,
}

const SUV: SubjectDef = {
  species: 'suv',
  habitat: 'road',
  displayName: 'Black SUV',
  rarity: 1,
  model: 'vehicle',
  // The blacked-out Suburban idling outside a Rush Street restaurant is as much
  // a fixture of this street as the restaurants are.
  palette: { body: 0x14161a, accent: 0x0d0f12 },
  vehicle: {
    body: 'suv',
    sign: 'none',
    // Black, mostly. A few dark greys so the row outside the restaurants is not
    // literally identical.
    bodyPalette: [0x14161a, 0x14161a, 0x1c1f24, 0x2a2d33, 0x3a3e45],
  },
  scale: 1,
  fallbackPose: 0.3,
  idealSize: 0.115,
  poses: DRIVING_POSES,
  behaviors: DRIVING,
}

const RIDESHARE: SubjectDef = {
  species: 'rideshare',
  habitat: 'road',
  displayName: 'Rideshare',
  rarity: 2,
  model: 'vehicle',
  palette: { body: 0x3c4a63, accent: 0x1b1d22 },
  vehicle: {
    body: 'sedan',
    sign: 'rideshare',
    bodyPalette: [0x3c4a63, 0x2f3540, 0x5f646b, 0xb4b8bd, 0x33363b],
  },
  scale: 1,
  fallbackPose: 0.3,
  idealSize: 0.1,
  poses: DRIVING_POSES,
  behaviors: DRIVING,
}

const DELIVERY_CAR: SubjectDef = {
  species: 'delivery-car',
  habitat: 'road',
  displayName: 'Delivery Driver',
  rarity: 2,
  model: 'vehicle',
  palette: { body: 0xb8352f, accent: 0x1b1d22 },
  vehicle: { body: 'sedan', sign: 'delivery' },
  scale: 1,
  fallbackPose: 0.3,
  idealSize: 0.1,
  poses: DRIVING_POSES,
  behaviors: DRIVING,
}

const POLICE_CAR: SubjectDef = {
  species: 'police-car',
  habitat: 'road',
  displayName: 'Squad Car',
  rarity: 2,
  model: 'vehicle',
  palette: { body: 0xe8eaec, accent: 0x1b1d22 },
  vehicle: { body: 'sedan', sign: 'none', lightBar: true, stripe: 0x1b3a6b },
  scale: 1,
  fallbackPose: 0.35,
  idealSize: 0.105,
  poses: {
    ...DRIVING_POSES,
    // The one thing a squad car does that nothing else does.
    lights: { label: 'Lights on', value: 0.95, peak: [0.1, 0.4], peakBonus: 0.05 },
  },
  behaviors: [
    { clip: 'parked', minSeconds: 3.0, maxSeconds: 5.0, weight: 3 },
    { clip: 'cruise', minSeconds: 2.5, maxSeconds: 4.0, weight: 2 },
    { clip: 'lights', minSeconds: 2.5, maxSeconds: 4.5, weight: 2 },
  ],
}

const BUS: SubjectDef = {
  species: 'bus',
  habitat: 'road',
  displayName: 'CTA Bus',
  rarity: 2,
  model: 'bus',
  palette: { body: 0xd9dde2, accent: 0x243044 },
  scale: 1,
  fallbackPose: 0.35,
  // Enormous, so it fills a frame from much further away than a car does.
  idealSize: 0.2,
  poses: {
    parked: { label: 'Standing', value: 0.35 },
    cruise: { label: 'In service', value: 0.7 },
    stop: { label: 'Kneeling at a stop', value: 0.9, peak: [0.25, 0.7], peakBonus: 0.05 },
  },
  behaviors: [
    { clip: 'cruise', minSeconds: 3.0, maxSeconds: 5.0, weight: 3 },
    { clip: 'stop', minSeconds: 3.0, maxSeconds: 4.0, weight: 2 },
    { clip: 'parked', minSeconds: 2.0, maxSeconds: 4.0, weight: 1 },
  ],
}

// ---------------------------------------------------------------------------
// Riders
// ---------------------------------------------------------------------------

const CYCLIST: SubjectDef = {
  species: 'cyclist',
  habitat: 'road',
  displayName: 'Cyclist',
  rarity: 2,
  model: 'bicycle',
  palette: { body: 0x2f3a45, accent: 0x2f7d74 },
  rider: {
    height: 1.75,
    build: 1,
    skin: SKIN,
    hair: HAIR,
    top: [0x2f7d74, 0xd8a53f, 0xc4553f, 0x3f5470],
    bottom: [0x1f2430, 0x2a2f38],
    accessories: ['helmet'],
  },
  scale: 1,
  fallbackPose: 0.4,
  idealSize: 0.075,
  poses: {
    idle: { label: 'Waiting at the lights', value: 0.4 },
    ride: { label: 'Riding', value: 0.7 },
    sprint: { label: 'Out of the saddle', value: 0.95, peak: [0.2, 0.6], peakBonus: 0.05 },
  },
  behaviors: [
    { clip: 'ride', minSeconds: 3.0, maxSeconds: 6.0, weight: 4 },
    { clip: 'idle', minSeconds: 2.0, maxSeconds: 4.0, weight: 2 },
    { clip: 'sprint', minSeconds: 1.5, maxSeconds: 3.0, weight: 1 },
  ],
}

const DELIVERY_RIDER: SubjectDef = {
  species: 'delivery-rider',
  habitat: 'road',
  displayName: 'Delivery Rider',
  rarity: 2,
  model: 'bicycle',
  palette: { body: 0x25282e, accent: 0xd8453f },
  rider: {
    height: 1.75,
    build: 1,
    skin: SKIN,
    hair: HAIR,
    top: [0x2b2f38, 0x1f2933, 0x3a3f4a],
    bottom: [0x1f2430, 0x2a2f38],
    accessories: ['helmet', 'bag'],
  },
  scale: 1,
  fallbackPose: 0.4,
  idealSize: 0.078,
  poses: {
    idle: { label: 'Checking the order', value: 0.5 },
    ride: { label: 'On a delivery', value: 0.75 },
    sprint: { label: 'Late', value: 0.95, peak: [0.2, 0.6], peakBonus: 0.05 },
  },
  behaviors: [
    { clip: 'ride', minSeconds: 3.0, maxSeconds: 5.0, weight: 4 },
    { clip: 'sprint', minSeconds: 1.5, maxSeconds: 3.0, weight: 2 },
    { clip: 'idle', minSeconds: 2.0, maxSeconds: 3.5, weight: 1 },
  ],
}

const MOUNTED_POLICE: SubjectDef = {
  species: 'mounted-police',
  habitat: 'pavement',
  displayName: 'Mounted Police',
  rarity: 3,
  model: 'horse',
  palette: { body: 0x4a3728, accent: 0x241a12 },
  rider: {
    height: 1.8,
    build: 1.05,
    skin: SKIN,
    hair: HAIR,
    top: [0x22304a, 0x1c2942],
    bottom: [0x1a1f2b],
    accessories: ['cap', 'badge'],
  },
  scale: 1,
  fallbackPose: 0.5,
  idealSize: 0.13,
  poses: {
    stand: { label: 'Standing', value: 0.5 },
    walk: { label: 'On patrol', value: 0.75 },
    alert: { label: 'Head up', value: 1.0, peak: [0.25, 0.7], peakBonus: 0.08 },
  },
  behaviors: [
    { clip: 'stand', minSeconds: 3.0, maxSeconds: 5.0, weight: 3 },
    { clip: 'walk', minSeconds: 3.0, maxSeconds: 6.0, weight: 3 },
    { clip: 'alert', minSeconds: 2.5, maxSeconds: 4.0, weight: 2 },
  ],
}

// ---------------------------------------------------------------------------
// More people
// ---------------------------------------------------------------------------

const POLICE: SubjectDef = {
  species: 'police',
  habitat: 'pavement',
  displayName: 'Police Officer',
  rarity: 2,
  model: 'humanoid',
  palette: { body: 0x22304a, accent: 0xf2e14a },
  scale: 1,
  fallbackPose: 0.45,
  idealSize: 0.05,
  human: {
    height: 1.82,
    build: 1.12,
    skin: SKIN,
    hair: HAIR,
    // A uniform is a uniform: the narrow palette is the point, the way the
    // doorman's is.
    top: [0x22304a, 0x1c2942],
    bottom: [0x1a1f2b, 0x232838],
    accessories: ['cap', 'badge'],
    hairStyles: [0, 0, 0, 1],
  },
  poses: {
    idle: { label: 'On the corner', value: 0.45 },
    walk: { label: 'Walking the beat', value: 0.6 },
    talk: { label: 'Talking to someone', value: 0.8 },
    gawk: { label: 'Directing traffic', value: 0.95, peak: [0.3, 0.7], peakBonus: 0.05 },
  },
  behaviors: [
    { clip: 'idle', minSeconds: 3.0, maxSeconds: 6.0, weight: 4 },
    { clip: 'talk', minSeconds: 2.0, maxSeconds: 3.5, weight: 2 },
    { clip: 'gawk', minSeconds: 2.0, maxSeconds: 3.5, weight: 2 },
    /**
     * People look at what lands near them.
     *
     * `gawk` is a tourist stopping to stare, which is exactly the posture, and
     * it is worth more than idle — so a thrown hot dog turns a row of people
     * who were facing away into a row of faces.
     */
    { clip: 'gawk', minSeconds: 1.6, maxSeconds: 2.8, weight: 0, trigger: 'food' },
    { clip: 'gawk', minSeconds: 1.2, maxSeconds: 2.0, weight: 0, trigger: 'startle' },
  ],
}

const HOMELESS: SubjectDef = {
  species: 'homeless',
  habitat: 'pavement',
  displayName: 'Rough Sleeper',
  rarity: 2,
  model: 'humanoid',
  palette: { body: 0x6b5f4a, accent: 0x4a4235 },
  scale: 1,
  fallbackPose: 0.5,
  idealSize: 0.052,
  human: {
    height: 1.74,
    build: 1.15,
    skin: SKIN,
    hair: HAIR,
    // Layers, and all of them weathered. Nothing bright, because everything has
    // been outside for a long time.
    top: [0x6b5f4a, 0x4a4235, 0x54503f, 0x3f4a4a, 0x5a4a3a],
    bottom: [0x3a3730, 0x2f3330, 0x453e33],
    accessories: ['coat', 'bag', 'bedroll'],
    stoop: 0.18,
  },
  poses: {
    idle: { label: 'Sitting', value: 0.55 },
    walk: { label: 'Moving on', value: 0.6 },
    talk: { label: 'Asking', value: 0.8 },
    gawk: { label: 'Looking up', value: 0.9, peak: [0.3, 0.7], peakBonus: 0.05 },
  },
  behaviors: [
    { clip: 'idle', minSeconds: 4.0, maxSeconds: 8.0, weight: 5 },
    { clip: 'talk', minSeconds: 2.0, maxSeconds: 3.5, weight: 2 },
    { clip: 'gawk', minSeconds: 2.0, maxSeconds: 3.0, weight: 1 },
    /**
     * People look at what lands near them.
     *
     * `gawk` is a tourist stopping to stare, which is exactly the posture, and
     * it is worth more than idle — so a thrown hot dog turns a row of people
     * who were facing away into a row of faces.
     */
    { clip: 'gawk', minSeconds: 1.6, maxSeconds: 2.8, weight: 0, trigger: 'food' },
    { clip: 'gawk', minSeconds: 1.2, maxSeconds: 2.0, weight: 0, trigger: 'startle' },
  ],
}

/**
 * Someone on the beach.
 *
 * Rarer than a pedestrian and worth more, because a sunbather is a genuinely
 * harder photograph than a person standing up: they are low, they are small in
 * frame, and the good poses are the ones that only come round every few
 * seconds. `lounge` and `sunbathe` are their own clips — see buildHumanoid.
 */
const BEACHGOER: SubjectDef = {
  species: 'beachgoer',
  habitat: 'any',
  displayName: 'Beachgoer',
  rarity: 1,
  model: 'humanoid',
  palette: { body: 0xe0a13c, accent: 0x3f8fa8 },
  scale: 1,
  fallbackPose: 0.45,
  idealSize: 0.05,
  human: {
    height: 1.74,
    build: 1.0,
    skin: SKIN,
    hair: HAIR,
    top: [0xe86a4a, 0x3f8fa8, 0xe8b23a, 0xd8556a, 0x4a9c7a],
    bottom: [0x2f6f8f, 0xd8556a, 0xe0a13c, 0x3f5470],
    accessories: ['sunhat', 'cap', 'tote'],
  },
  poses: {
    lounge: { label: 'Sitting on the sand', value: 0.6 },
    sunbathe: { label: 'Sunbathing', value: 0.7 },
    idle: { label: 'Standing about', value: 0.4 },
    walk: { label: 'Walking the shore', value: 0.55 },
    gawk: { label: 'Watching the lake', value: 0.9, peak: [0.3, 0.7], peakBonus: 0.05 },
  },
  behaviors: [
    { clip: 'lounge', minSeconds: 5.0, maxSeconds: 9.0, weight: 4 },
    { clip: 'sunbathe', minSeconds: 6.0, maxSeconds: 11.0, weight: 3 },
    { clip: 'idle', minSeconds: 2.5, maxSeconds: 4.5, weight: 1 },
    { clip: 'gawk', minSeconds: 2.0, maxSeconds: 3.5, weight: 1 },
  ],
}

/** The crowd at the beach club, drink in hand. */
const PARTYGOER: SubjectDef = {
  species: 'partygoer',
  habitat: 'any',
  displayName: 'Beach Club',
  rarity: 2,
  model: 'humanoid',
  palette: { body: 0xd8556a, accent: 0xe8d45a },
  scale: 1,
  fallbackPose: 0.5,
  idealSize: 0.05,
  human: {
    height: 1.76,
    build: 1.0,
    skin: SKIN,
    hair: HAIR,
    top: [0xd8556a, 0xe8d45a, 0x4a9c7a, 0xe8e4da, 0x6b4f9c],
    bottom: [0x2f3540, 0xe8e4da, 0x3f5470, 0x6b5a44],
    accessories: ['sunhat', 'cap', 'tote'],
  },
  poses: {
    /**
     * The peak is the top of the beat, where the raised arm is fully up.
     *
     * The clip is a two-beat loop with the arms at their extremes at 0 and half
     * way, so the window straddles the second of those. It was 35–65% of a
     * three-and-a-half second sway that had no extreme to catch.
     */
    party: { label: 'Dancing', value: 0.75, peak: [0.42, 0.58], peakBonus: 0.1 },
    talk: { label: 'Shouting over the music', value: 0.85 },
    idle: { label: 'At the rail', value: 0.45 },
    gawk: { label: 'Cheering', value: 0.95, peak: [0.3, 0.7], peakBonus: 0.08 },
  },
  behaviors: [
    { clip: 'party', minSeconds: 3.0, maxSeconds: 6.0, weight: 4 },
    { clip: 'talk', minSeconds: 2.5, maxSeconds: 4.5, weight: 3 },
    { clip: 'gawk', minSeconds: 1.8, maxSeconds: 3.0, weight: 2 },
    { clip: 'idle', minSeconds: 2.0, maxSeconds: 3.5, weight: 1 },
  ],
}

const BUSINESS_MAN: SubjectDef = {
  species: 'business-man',
  habitat: 'pavement',
  displayName: 'Businessman',
  rarity: 1,
  model: 'humanoid',
  palette: { body: 0x2b3040, accent: 0x8a939f },
  scale: 1,
  fallbackPose: 0.4,
  idealSize: 0.048,
  human: {
    height: 1.81,
    build: 1.06,
    skin: SKIN,
    hair: HAIR,
    // Charcoal, navy, and the two greys everyone owns.
    top: [0x2b3040, 0x353a45, 0x1f2530, 0x474d58],
    bottom: [0x23272f, 0x2f333c, 0x1a1d24],
    accessories: ['bag', 'coat'],
    hairStyles: [0, 0, 1, 3],
  },
  poses: {
    idle: { label: 'Waiting', value: 0.4 },
    walk: { label: 'Walking', value: 0.55 },
    talk: { label: 'On the phone', value: 0.8 },
    gawk: { label: 'Hailing a cab', value: 0.95, peak: [0.3, 0.7], peakBonus: 0.05 },
  },
  behaviors: [
    { clip: 'walk', minSeconds: 3.0, maxSeconds: 6.0, weight: 4 },
    { clip: 'talk', minSeconds: 2.5, maxSeconds: 4.5, weight: 3 },
    { clip: 'idle', minSeconds: 2.0, maxSeconds: 4.0, weight: 2 },
    { clip: 'gawk', minSeconds: 1.8, maxSeconds: 3.0, weight: 1 },
    /**
     * People look at what lands near them.
     *
     * `gawk` is a tourist stopping to stare, which is exactly the posture, and
     * it is worth more than idle — so a thrown hot dog turns a row of people
     * who were facing away into a row of faces.
     */
    { clip: 'gawk', minSeconds: 1.6, maxSeconds: 2.8, weight: 0, trigger: 'food' },
    { clip: 'gawk', minSeconds: 1.2, maxSeconds: 2.0, weight: 0, trigger: 'startle' },
  ],
}

const BUSINESS_WOMAN: SubjectDef = {
  species: 'business-woman',
  habitat: 'pavement',
  displayName: 'Businesswoman',
  rarity: 1,
  model: 'humanoid',
  palette: { body: 0x33384a, accent: 0x9aa3af },
  scale: 1,
  fallbackPose: 0.4,
  idealSize: 0.046,
  human: {
    height: 1.7,
    build: 0.95,
    skin: SKIN,
    hair: HAIR,
    top: [0x33384a, 0x2b3040, 0x4a4550, 0x3d4250, 0x5a4a52],
    bottom: [0x23272f, 0x2f333c, 0x3a3038],
    accessories: ['tote', 'heels', 'coat'],
    hairStyles: [0, 1, 1, 3],
  },
  poses: {
    idle: { label: 'Waiting', value: 0.4 },
    walk: { label: 'Walking', value: 0.55 },
    talk: { label: 'On the phone', value: 0.8 },
    gawk: { label: 'Hailing a cab', value: 0.95, peak: [0.3, 0.7], peakBonus: 0.05 },
  },
  behaviors: [
    { clip: 'walk', minSeconds: 3.0, maxSeconds: 6.0, weight: 4 },
    { clip: 'talk', minSeconds: 2.5, maxSeconds: 4.5, weight: 3 },
    { clip: 'idle', minSeconds: 2.0, maxSeconds: 4.0, weight: 2 },
    { clip: 'gawk', minSeconds: 1.8, maxSeconds: 3.0, weight: 1 },
    /**
     * People look at what lands near them.
     *
     * `gawk` is a tourist stopping to stare, which is exactly the posture, and
     * it is worth more than idle — so a thrown hot dog turns a row of people
     * who were facing away into a row of faces.
     */
    { clip: 'gawk', minSeconds: 1.6, maxSeconds: 2.8, weight: 0, trigger: 'food' },
    { clip: 'gawk', minSeconds: 1.2, maxSeconds: 2.0, weight: 0, trigger: 'startle' },
  ],
}

/**
 * Rats.
 *
 * The one subject that is genuinely hard to photograph, and deliberately so.
 * Everything else on this route stands still long enough to be framed; a rat is
 * out for a second and a half and gone, so it is the only thing here where the
 * shot depends on being ready rather than on being patient.
 *
 * That is expressed entirely in the behaviour timings — `hidden` is a real clip
 * holding the animal flat and still under the kerb, so the model is always
 * there and the scoring never has to know about visibility. It just scores a
 * very small, very low subject when it is tucked away.
 */
const RAT: SubjectDef = {
  species: 'rat',
  habitat: 'any',
  displayName: 'Rat',
  rarity: 3,
  model: 'rat',
  palette: { body: 0x4a4038, accent: 0x2b2520 },
  // Built at life size, so this is 1 rather than a fraction of a dog.
  scale: 1,
  fallbackPose: 0.2,
  // Tiny, so filling a useful part of the frame means being very close or
  // zoomed all the way in.
  idealSize: 0.012,
  poses: {
    hidden: { label: 'Gone', value: 0.05 },
    scurry: { label: 'Scurrying', value: 0.95, peak: [0.2, 0.8], peakBonus: 0.05 },
    sniff: { label: 'Out in the open', value: 1.0, peak: [0.25, 0.75], peakBonus: 0.05 },
  },
  behaviors: [
    // Out of sight most of the time, and never for long when it isn't.
    { clip: 'hidden', minSeconds: 5.0, maxSeconds: 11.0, weight: 7 },
    { clip: 'scurry', minSeconds: 1.1, maxSeconds: 1.8, weight: 3 },
    { clip: 'sniff', minSeconds: 0.9, maxSeconds: 1.6, weight: 2 },
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
  police: POLICE,
  homeless: HOMELESS,
  sedan: SEDAN,
  suv: SUV,
  rideshare: RIDESHARE,
  'delivery-car': DELIVERY_CAR,
  'police-car': POLICE_CAR,
  bus: BUS,
  cyclist: CYCLIST,
  'delivery-rider': DELIVERY_RIDER,
  'mounted-police': MOUNTED_POLICE,
  rat: RAT,
  'business-man': BUSINESS_MAN,
  'business-woman': BUSINESS_WOMAN,
  beachgoer: BEACHGOER,
  partygoer: PARTYGOER,
}

/** The scoring core only needs the SpeciesDef half of each entry. */
export const SPECIES_INDEX: Record<string, SpeciesDef> = SUBJECTS

export const getSubject = (species: string): SubjectDef | undefined => SUBJECTS[species]

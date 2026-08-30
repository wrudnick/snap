/**
 * Outfits — whole designed looks, not colour swaps.
 *
 * Varying only the palette produces one outfit in twelve colours, which reads
 * as a uniform. An outfit here owns its graphic, its trouser cut, its
 * silhouette modifiers and its own colour ranges, so two people in the same
 * class can be wearing genuinely different clothes.
 *
 * Silhouette is doing at least as much work as texture: a cropped top with bare
 * midriff, a long coat, or shorts change the outline, and outline is what reads
 * at the distance people get photographed from.
 */

/** Indexes into the atlas rows. */
export interface OutfitDef {
  id: string
  /** Torso design cell, 0-7. See drawTorsoFront. */
  top: number
  /** Trouser design cell, 0-7. See drawLeg. */
  legs: number
  /** Sleeve design cell, 0-3. */
  sleeve: number

  /** Arms rendered in skin rather than cloth. */
  bareArms?: boolean
  /** Torso stops above the waist, leaving a midriff band. */
  cropped?: boolean
  /** Trousers end above the knee; shins are skin. */
  shorts?: boolean
  /** A skirt block replaces separate trouser tops. */
  skirt?: boolean
  /** Coat panel falling to mid-thigh. */
  longCoat?: boolean
  /** Hood mass behind the neck. */
  hood?: boolean

  /** Which palettes this look draws from. */
  palette: 'street' | 'formal' | 'sport' | 'muted' | 'bright' | 'uniform'
  /** Headwear this outfit permits; one may be rolled. */
  headwear?: Array<'cap' | 'beanie' | 'sunhat' | 'bandana'>
  bag?: Array<'sling' | 'tote' | 'backpack'>
}

export const OUTFITS: OutfitDef[] = [
  {
    id: 'graphic-tee',
    top: 0, legs: 0, sleeve: 3,
    palette: 'street',
    headwear: ['cap', 'beanie'],
    bag: ['sling'],
  },
  {
    id: 'zip-hoodie',
    top: 1, legs: 2, sleeve: 0,
    hood: true,
    palette: 'street',
    headwear: ['beanie'],
    bag: ['backpack'],
  },
  {
    id: 'tank-and-shorts',
    top: 2, legs: 5, sleeve: 0,
    bareArms: true, shorts: true,
    palette: 'bright',
    headwear: ['cap', 'bandana'],
  },
  {
    id: 'crop-and-wide-leg',
    top: 2, legs: 5, sleeve: 0,
    bareArms: true, cropped: true,
    palette: 'bright',
    headwear: ['bandana'],
    bag: ['sling'],
  },
  {
    id: 'jersey',
    top: 3, legs: 1, sleeve: 1,
    palette: 'sport',
    headwear: ['cap'],
  },
  {
    id: 'windbreaker',
    top: 4, legs: 1, sleeve: 0,
    palette: 'sport',
    headwear: ['cap', 'beanie'],
    bag: ['sling'],
  },
  {
    id: 'suit',
    top: 5, legs: 4, sleeve: 2,
    palette: 'formal',
  },
  {
    id: 'overcoat',
    top: 5, legs: 4, sleeve: 2,
    longCoat: true,
    palette: 'formal',
    headwear: ['cap'],
  },
  {
    id: 'police-uniform',
    top: 5, legs: 4, sleeve: 2,
    palette: 'uniform',
    headwear: ['cap'],
  },
  {
    id: 'skirt-suit',
    top: 5, legs: 7, sleeve: 2,
    skirt: true,
    palette: 'formal',
    bag: ['tote'],
  },
  {
    id: 'blouse-and-slacks',
    top: 4, legs: 4, sleeve: 1,
    palette: 'formal',
    bag: ['tote'],
  },
  {
    id: 'overalls',
    top: 6, legs: 3, sleeve: 3,
    palette: 'muted',
    headwear: ['cap'],
  },
  {
    id: 'puffer',
    top: 7, legs: 3, sleeve: 0,
    palette: 'muted',
    headwear: ['beanie'],
    bag: ['backpack'],
  },
  {
    id: 'summer-dress',
    top: 0, legs: 7, sleeve: 0,
    bareArms: true, skirt: true,
    palette: 'bright',
    headwear: ['sunhat'],
    bag: ['tote'],
  },
  {
    id: 'patchwork',
    top: 0, legs: 6, sleeve: 1,
    palette: 'street',
    headwear: ['bandana', 'beanie'],
    bag: ['sling'],
  },
]

/**
 * Colour ranges per palette family.
 *
 * Pulled toward the reference: saturated but slightly dirty. Clean primaries
 * read as toy-like beside that art, and pure greys read as untextured.
 */
export const OUTFIT_PALETTES: Record<
  OutfitDef['palette'],
  {
    top: number[]
    bottom: number[]
    /**
     * Ties, scarves, hood linings — the one saturated thing on an outfit.
     */
    trim: number[]
    /**
     * Collars and cuffs.
     *
     * Separate from `trim` because they are not the same job: a deep red is a
     * fine tie and a terrible cuff, and reusing trim for both put maroon bands
     * round the wrists of every suit.
     */
    shirt: number[]
  }
> = {
  street: {
    top: [0x2f9c86, 0xd94f3d, 0x3d6fa8, 0xe8b23a, 0x6b4f9c, 0xe4e0d6],
    bottom: [0x3f5470, 0x4a5240, 0x2f4258, 0x6b6f52, 0x55637a],
    trim: [0xf0e6cf, 0x1f2a38, 0xe8b23a],
    shirt: [0xe8e4da, 0xd6d2c6, 0xc4cbd2],
  },
  formal: {
    top: [0x2b3038, 0x3a3f4a, 0x4a4038, 0x23262c],
    bottom: [0x22262e, 0x2b2420, 0x35393f],
    trim: [0xc9a45f, 0xe8e2d4, 0x8a1f3a],
    shirt: [0xeceae2, 0xdfe3e8, 0xd8d2c4, 0xc9d2dc],
  },
  /**
   * Service navy.
   *
   * Police were drawing from `formal`, so a Chicago officer came out in a brown
   * suit — the class's own navy in its `human.top` is never consulted, because
   * colours follow the outfit's palette family, not the class.
   */
  uniform: {
    top: [0x232f4a, 0x1e2942, 0x28334f],
    bottom: [0x171c28, 0x1c2130, 0x202634],
    trim: [0xd8b24a, 0x2e4a86],
    shirt: [0xa8bcd4, 0x9db2cc, 0xc4d2e0],
  },
  sport: {
    top: [0xe4453a, 0x2f7fc4, 0xf0c04a, 0x3fa85f, 0xe8e2d4],
    bottom: [0x1f2a38, 0x2b3038, 0x3f5470],
    trim: [0xffffff, 0xe8b23a, 0x1a1a1a],
    shirt: [0xe4e0d6, 0xd2cec4, 0xc6ccd2],
  },
  muted: {
    top: [0x8a7f6a, 0x6b7a6a, 0x9c8f80, 0x7a6a55, 0x5f6b78],
    bottom: [0x4a4a4a, 0x3a3630, 0x5a5348, 0x4a5240],
    trim: [0xd6cdbe, 0x2b2420],
    shirt: [0xe4e0d6, 0xd2cec4, 0xc6ccd2],
  },
  bright: {
    top: [0xe86a8a, 0x3fa89c, 0xf0c04a, 0xdc6f4a, 0xa45f9c, 0x7fae4a],
    bottom: [0xe8e2d4, 0x3f5470, 0x2f6f7a, 0x6b6f52],
    trim: [0xffffff, 0x1c1a22, 0xf0c04a],
    shirt: [0xe4e0d6, 0xd2cec4, 0xc6ccd2],
  },
}

/** Outfits each class of person is willing to be seen in. */
export const CLASS_OUTFITS: Record<string, string[]> = {
  'tourist-man': ['graphic-tee', 'zip-hoodie', 'tank-and-shorts', 'jersey', 'windbreaker', 'puffer', 'patchwork'],
  'tourist-woman': ['graphic-tee', 'crop-and-wide-leg', 'summer-dress', 'zip-hoodie', 'windbreaker', 'patchwork'],
  'old-man': ['overcoat', 'suit', 'overalls', 'puffer'],
  escort: ['suit', 'summer-dress', 'crop-and-wide-leg', 'overcoat'],
  doorman: ['suit', 'overcoat'],
  // Office wear is narrow by definition, which is the point of it: the Loop at
  // half past five is a crowd of the same four outfits.
  'business-man': ['suit', 'overcoat', 'shirt-sleeves', 'blouse-and-slacks'],
  'business-woman': ['skirt-suit', 'blouse-and-slacks', 'suit', 'overcoat'],
  police: ['police-uniform'],
  homeless: ['overcoat', 'puffer', 'patchwork'],
}

/** Shirt and trousers, jacket left at the desk. */
const SHIRT_SLEEVES: OutfitDef = {
  id: 'shirt-sleeves',
  top: 4,
  legs: 4,
  sleeve: 1,
  palette: 'formal',
}

export function outfitFor(species: string, roll: number): OutfitDef {
  const allowed = CLASS_OUTFITS[species] ?? OUTFITS.map((o) => o.id)
  const id = allowed[Math.floor(roll * allowed.length) % allowed.length]!
  if (id === SHIRT_SLEEVES.id) return SHIRT_SLEEVES
  return OUTFITS.find((o) => o.id === id) ?? OUTFITS[0]!
}

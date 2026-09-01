/**
 * Things the player can throw.
 *
 * The point of a throwable in a photography game is not the throw — it is that
 * the street stops being a recording and starts answering back. Every subject
 * here already has poses worth far more than its idle one, and until now the
 * only way to catch a pigeon taking off was to wait for the behaviour rotation
 * to pick `flap` on its own while you happened to be pointed at it. Now you can
 * cause it.
 *
 * Two reactions from one object, by distance. Food that lands *near* a bird
 * gathers it; food that lands *on* one puts the flock up. That is the whole
 * mechanic, and it is a table rather than code so the second item is a row.
 */
export interface ItemDef {
  id: string
  displayName: string
  /** Metres per second it leaves the hand at. */
  throwSpeed: number
  /** Upward component added to the throw, so it arcs rather than fires flat. */
  loft: number
  /** Metres per second squared. Earth, slightly softened so the arc reads. */
  gravity: number
  /** Radius in metres, and the trigger fired inside it. */
  startle: { radius: number; trigger: string }
  attract: { radius: number; trigger: string }
  /** How many subjects may react to one landing, nearest first. */
  maxReactions: number
  palette: { body: number; accent: number }
}

export const HOT_DOG: ItemDef = {
  id: 'hot-dog',
  displayName: 'Hot dog',
  throwSpeed: 15,
  loft: 3.4,
  gravity: 16,
  /**
   * Startle is tight and attract is wide, which is what makes aiming matter.
   *
   * Land it across the pavement and the birds walk over to it; land it in the
   * middle of them and they go up. Both are photographs, and they are different
   * photographs, so the throw has to be able to choose.
   */
  startle: { radius: 2.6, trigger: 'startle' },
  attract: { radius: 9, trigger: 'food' },
  maxReactions: 14,
  palette: { body: 0xd6a25a, accent: 0xb4442f },
}

export const ITEMS: Record<string, ItemDef> = { [HOT_DOG.id]: HOT_DOG }

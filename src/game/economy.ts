import type { Rarity } from '@/game/scoring/types'

/**
 * Selling postcards.
 *
 * You do not sell photographs, you sell *postcards*, and the rack holds exactly
 * one card per subject. A better one replaces the card and pays only the
 * difference — so every slot pays out the same total whatever route you took to
 * it, and the money in the game is a sum that can be written down.
 *
 * That last property is why this shape was chosen. The whole economy is about
 * eleven thousand across ninety pose slots and a hundred and four building
 * faces, split near evenly between street life and architecture, which is a
 * number the shop and the map have to be priced against.
 */

/** What a card is worth at each grade, before rarity. */
export const LADDER: Record<string, number> = {
  D: 1,
  C: 5,
  B: 12,
  A: 25,
  S: 50,
}

/**
 * Rarer subjects pay more for the same grade.
 *
 * An S-grade rat is harder won than an S-grade pigeon and should pay like it.
 */
export const RARITY_PAY: Record<Rarity, number> = { 1: 1, 2: 1.25, 3: 2 }

/** What a slot is worth once it holds a card of this grade. */
export function cardValue(grade: string, rarity: Rarity): number {
  return Math.round((LADDER[grade] ?? 0) * RARITY_PAY[rarity])
}

/**
 * What selling this photograph earns, given what the slot has already paid.
 *
 * The difference, and never less than nothing: selling a worse one than you
 * already have is free rather than a refund. Selling the same grade twice earns
 * zero, which is the whole anti-grind mechanism — the only way to earn is to
 * bring back something better than what is on the rack, or something that is
 * not on it at all.
 */
export function saleValue(grade: string, rarity: Rarity, alreadyPaid: number): number {
  return Math.max(0, cardValue(grade, rarity) - alreadyPaid)
}

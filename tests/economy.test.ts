import { describe, expect, it } from 'vitest'

import { cardValue, LADDER, saleValue } from '../src/game/economy'

describe('selling postcards', () => {
  /**
   * The property the whole economy rests on.
   *
   * However you climb to an S — straight there, or D then C then A — the slot
   * has paid out exactly its S value and no more. That is what makes the total
   * money in the game a sum that can be written down and priced against.
   */
  it('pays out the same total whatever route you take to it', () => {
    const direct = saleValue('S', 1, 0)

    let paid = 0
    let earned = 0
    for (const grade of ['D', 'C', 'A', 'S']) {
      const sale = saleValue(grade, 1, paid)
      earned += sale
      paid += sale
    }

    expect(direct).toBe(LADDER.S)
    expect(earned).toBe(direct)
  })

  it('pays nothing for selling the same grade twice', () => {
    const first = saleValue('B', 1, 0)
    expect(first).toBe(LADDER.B)
    expect(saleValue('B', 1, first)).toBe(0)
  })

  it('pays nothing for selling a worse one, and never refunds', () => {
    const paid = cardValue('A', 1)
    expect(saleValue('C', 1, paid)).toBe(0)
  })

  it('pays the difference when you improve', () => {
    const paid = cardValue('C', 1)
    expect(saleValue('A', 1, paid)).toBe(LADDER.A! - LADDER.C!)
  })

  it('pays more for a rarer subject at the same grade', () => {
    expect(cardValue('S', 3)).toBeGreaterThan(cardValue('S', 1))
    expect(cardValue('S', 3)).toBe(100)
  })
})

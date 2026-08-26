/**
 * Small deterministic PRNG (mulberry32).
 *
 * The street blockout is generated procedurally, and it must look identical on
 * every load — otherwise photo scores wouldn't be comparable between runs and
 * E2E tests would be non-deterministic. Never use Math.random for world content.
 */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Uniform float in [min, max). */
export const range = (rng: () => number, min: number, max: number): number =>
  min + rng() * (max - min)

/** Uniform integer in [min, max]. */
export const rangeInt = (rng: () => number, min: number, max: number): number =>
  Math.floor(range(rng, min, max + 1))

/** Pick one element. Assumes a non-empty array. */
export const pick = <T,>(rng: () => number, items: readonly T[]): T =>
  items[Math.floor(rng() * items.length)]!

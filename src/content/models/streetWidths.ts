/**
 * How wide each street's carriageway is, by name.
 *
 * Its own module because both the ground builder and the footprint index need
 * it, and having them import it from each other made a cycle: `footprints`
 * loaded `cityGround`, whose module-level constants were still in the temporal
 * dead zone, and the whole file threw at import time. Vitest reported it as
 * "no tests" rather than as a failure, which is the kind of quiet that hides a
 * broken build.
 *
 * The export carries no road classification, but 24 street names in a district
 * this size is few enough to say what each one is. Michigan and Lake Shore are
 * genuinely twice the width of a Gold Coast side street, and flattening that to
 * one number loses what makes the Magnificent Mile read as a boulevard.
 *
 * These are an UPPER bound: the buildings set the real width, because a guess
 * that runs wide grows a tower out of the middle of the asphalt. See
 * `halfWidths` in cityGround.
 */

const HALF_WIDTHS: Array<{ match: RegExp; half: number }> = [
  { match: /Lake Shore Drive/, half: 11 },
  { match: /Michigan Avenue/, half: 10 },
  { match: /State Street|State Parkway|Wabash Avenue|Rush Street/, half: 7.5 },
  { match: /Grand Avenue|Ohio Street|Ontario Street|Illinois Street|Chicago Avenue/, half: 8 },
]

const DEFAULT_HALF = 6

/** Carriageway half-width for a street, in metres. */
export function carriagewayHalfWidth(name: string): number {
  return HALF_WIDTHS.find((w) => w.match.test(name))?.half ?? DEFAULT_HALF
}

/**
 * How a street ranks against the ones it crosses.
 *
 * Every junction is two ribbons paved at the same height, which z-fights across
 * the whole crossing — 698 samples of it on Michigan Avenue alone. Real
 * junctions are not built that way: the more important road's surface runs
 * through and the lesser one stops at its kerb line. Ranking says which is
 * which, by width first and then by name so that two side streets of the same
 * width still resolve the same way every load.
 */
export function streetRank(name: string): number {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return carriagewayHalfWidth(name) * 1000 + (hash % 997)
}

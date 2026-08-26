/**
 * Scoring curves. Pure functions of numbers — no imports, no state.
 *
 * Each returns 0..1. Kept separate from `score.ts` so the shape of each curve
 * can be unit-tested in isolation from how the components are combined.
 */

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)

/** Linear interpolation of `t` from [a, b] into [0, 1], clamped. */
export const inverseLerp = (a: number, b: number, t: number): number =>
  a === b ? 0 : clamp01((t - a) / (b - a))

/** Linear interpolation from `a` to `b` by `t`. */
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

/**
 * Size score: a log-gaussian peaking at `ideal`.
 *
 * Log-space is what makes this feel right — a subject at half the ideal size and
 * one at double it are equally wrong, which a plain gaussian wouldn't capture.
 * Both a distant speck and a subject overflowing the frame lose points.
 */
export function sizeScore(frameFraction: number, ideal: number, sigma: number): number {
  if (frameFraction <= 0) return 0
  const d = Math.log(frameFraction / ideal)
  return clamp01(Math.exp(-(d * d) / (2 * sigma * sigma)))
}

/**
 * Placement score: gaussian falloff on distance from frame center.
 *
 * `aspect` corrects the horizontal axis so that on a wide frame, being off-center
 * horizontally costs the same as the equivalent offset vertically.
 */
export function placementScore(
  x: number,
  y: number,
  sigma: number,
  aspect: number,
): number {
  const ax = aspect > 1 ? x * aspect : x
  const ay = aspect < 1 ? y / aspect : y
  const d2 = ax * ax + ay * ay
  return clamp01(Math.exp(-d2 / (2 * sigma * sigma)))
}

/**
 * Fraction of a projected AABB that lies inside the frame, 0..1.
 *
 * Used to penalise subjects cropped by the frame edge in proportion to how much
 * of them got cut off — clipping a whisker shouldn't cost what clipping half a
 * body does.
 */
export function framedFraction(bounds: {
  minX: number
  minY: number
  maxX: number
  maxY: number
}): number {
  const w = bounds.maxX - bounds.minX
  const h = bounds.maxY - bounds.minY
  if (w <= 0 || h <= 0) return 0

  const vx = Math.min(bounds.maxX, 1) - Math.max(bounds.minX, -1)
  const vy = Math.min(bounds.maxY, 1) - Math.max(bounds.minY, -1)
  if (vx <= 0 || vy <= 0) return 0

  return clamp01((vx * vy) / (w * h))
}

/** Fraction of the frame occupied by the visible part of a projected AABB. */
export function frameFraction(bounds: {
  minX: number
  minY: number
  maxX: number
  maxY: number
}): number {
  const vx = Math.min(bounds.maxX, 1) - Math.max(bounds.minX, -1)
  const vy = Math.min(bounds.maxY, 1) - Math.max(bounds.minY, -1)
  if (vx <= 0 || vy <= 0) return 0
  // NDC spans 2 units per axis, so total frame area is 4.
  return clamp01((vx * vy) / 4)
}

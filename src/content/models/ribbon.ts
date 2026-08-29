/**
 * Keeping a ribbon from folding over itself at a corner.
 *
 * A ribbon laid along a path by offsetting sideways works everywhere the path
 * is straighter than the ribbon is wide, and fails silently everywhere else.
 * On the inside of a turn the outer lanes stop advancing and start running
 * backwards, and the surface doubles back into a flap lying on top of the road.
 *
 * Every corner on the route was doing this. The wedges of pavement lying across
 * each junction were not a texture problem or a z-fighting problem — the ground
 * was folded in half.
 *
 * WHERE THE LIMIT COMES FROM
 * For rows at centres P0, P1 with right-vectors r0, r1, a lane at offset `o`
 * moves by
 *
 *     d = (P1 + o·r1) − (P0 + o·r0) = f + o·(r1 − r0)      where f = P1 − P0
 *
 * and it has folded exactly when that runs against the path, d·f < 0:
 *
 *     |f|² + o·k < 0        where k = (r1 − r0)·f
 *
 * So k < 0 bounds positive offsets at |f|²/|k|, and k > 0 bounds negative ones.
 * Which side is the inside of the turn falls out of the sign of k rather than
 * having to be inferred, and there is no radius to approximate: this is the
 * condition itself, not a proxy for it.
 */

/** Fraction of the exact limit a lane may use. */
const SAFETY = 0.85

/**
 * How fast a limit may change between rows, as a fraction of the step.
 *
 * Needed because the derivation above assumes both rows use the same offset. A
 * limit that drops from unbounded on the straight to five metres at the corner
 * moves the edge sideways faster than the ribbon advances forwards, so the edge
 * folds anyway — the clamp reintroducing the defect it exists to remove. Two
 * sweeps propagate each corner's limit into the straight either side of it,
 * which is what turns the pinch into a taper.
 */
const TAPER = 0.3

export interface CurveLimits {
  /** Largest permitted positive (right-hand) offset, per row. */
  right: number[]
  /** Largest permitted magnitude of a negative (left-hand) offset, per row. */
  left: number[]
}

export interface Frame {
  x: number
  z: number
  rx: number
  rz: number
}

export function curveLimits(frames: Frame[]): CurveLimits {
  const n = frames.length
  const right = new Array<number>(n).fill(Infinity)
  const left = new Array<number>(n).fill(Infinity)
  const steps = new Array<number>(Math.max(0, n - 1)).fill(0)

  for (let i = 0; i < n - 1; i++) {
    const a = frames[i]!
    const b = frames[i + 1]!
    const fx = b.x - a.x
    const fz = b.z - a.z
    const f2 = fx * fx + fz * fz
    steps[i] = Math.sqrt(f2)
    if (f2 < 1e-12) continue

    const k = (b.rx - a.rx) * fx + (b.rz - a.rz) * fz
    // The pair's limit binds both of its rows, so both use the same offset and
    // the derivation above holds.
    if (k < -1e-9) {
      const limit = (SAFETY * f2) / -k
      right[i] = Math.min(right[i]!, limit)
      right[i + 1] = Math.min(right[i + 1]!, limit)
    } else if (k > 1e-9) {
      const limit = (SAFETY * f2) / k
      left[i] = Math.min(left[i]!, limit)
      left[i + 1] = Math.min(left[i + 1]!, limit)
    }
  }

  for (const limit of [right, left]) {
    for (let i = 1; i < n; i++) {
      limit[i] = Math.min(limit[i]!, limit[i - 1]! + (steps[i - 1] ?? 0) * TAPER)
    }
    for (let i = n - 2; i >= 0; i--) {
      limit[i] = Math.min(limit[i]!, limit[i + 1]! + (steps[i] ?? 0) * TAPER)
    }
  }

  return { right, left }
}

/** Apply a row's limits to one lane offset. */
export function applyLimits(offset: number, limits: CurveLimits, row: number): number {
  if (offset > 0) return Math.min(offset, limits.right[row] ?? Infinity)
  if (offset < 0) return Math.max(offset, -(limits.left[row] ?? Infinity))
  return offset
}

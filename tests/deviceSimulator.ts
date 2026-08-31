/**
 * A phone, simulated.
 *
 * The gyro has now been debugged twice by reasoning about it and shipped
 * broken twice, which is the signature of a missing instrument rather than a
 * hard problem. This is the instrument: it turns a *physical* orientation —
 * where the camera points, and how the phone is rolled — into exactly what a
 * `deviceorientation` event would carry, so the real input path can be driven
 * through motions that are continuous by construction.
 *
 * Anything discontinuous coming out the far end is then a bug in our code, not
 * a question about the sensor, and it can be found without holding a phone.
 */

const DEG = Math.PI / 180

export interface Pose {
  /** Compass bearing the back camera points along, degrees clockwise from north. */
  bearing: number
  /** Degrees above the horizon. */
  elevation: number
  /** Rotation about the camera axis. 0 is portrait, ±90 is landscape. */
  roll: number
}

export interface DeviceReport {
  alpha: number
  beta: number
  gamma: number
  absolute?: boolean
  webkitCompassHeading?: number
}

/**
 * The device's rotation matrix for a pose, as columns in world east/north/up.
 *
 * Built from the camera direction outward rather than by composing Euler
 * angles, so the pose is unambiguous and the angles are derived from it — which
 * is the direction the real device works in too.
 */
function matrixFor(pose: Pose): number[][] {
  const b = pose.bearing * DEG
  const e = pose.elevation * DEG
  const r = pose.roll * DEG

  const f = [Math.sin(b) * Math.cos(e), Math.cos(b) * Math.cos(e), Math.sin(e)]
  // Screen-up before roll: world up with the component along f removed.
  const dot = f[2]!
  let up = [-f[0]! * dot, -f[1]! * dot, 1 - f[2]! * dot]
  const un = Math.hypot(up[0]!, up[1]!, up[2]!)
  // Straight up or straight down: any roll is as good as any other.
  up = un < 1e-9 ? [0, 1, 0] : up.map((v) => v / un)

  const nf = f.map((v) => -v)
  const right = [
    up[1]! * nf[2]! - up[2]! * nf[1]!,
    up[2]! * nf[0]! - up[0]! * nf[2]!,
    up[0]! * nf[1]! - up[1]! * nf[0]!,
  ]

  const cr = Math.cos(r)
  const sr = Math.sin(r)
  const X = right.map((v, i) => v * cr + up[i]! * sr)
  const Y = up.map((v, i) => v * cr - right[i]! * sr)
  const Z = nf

  return [
    [X[0]!, Y[0]!, Z[0]!],
    [X[1]!, Y[1]!, Z[1]!],
    [X[2]!, Y[2]!, Z[2]!],
  ]
}

/**
 * What the device reports for a pose.
 *
 * The Z-X'-Y'' decomposition the spec defines, which is exactly where the
 * trouble is: it is degenerate when `gamma` reaches ±90°, and a real device
 * reports whatever branch it happens to land on there. `alphaBranch` picks
 * which — the two are physically identical and numerically 180° apart, and a
 * device switching between them mid-motion is the thing that has to be
 * survived.
 */
export function report(pose: Pose, alphaBranch = false, alphaOffset = 0): DeviceReport {
  const m = matrixFor(pose)
  const beta = Math.asin(Math.max(-1, Math.min(1, m[2]![1]!)))
  let alpha = Math.atan2(-m[0]![1]!, m[1]![1]!)
  let gamma = Math.atan2(-m[2]![0]!, m[2]![2]!)

  if (alphaBranch) {
    // The other valid decomposition of the same physical orientation.
    alpha += Math.PI
    gamma += Math.PI
    // beta reflects about the pole.
    return {
      alpha: wrap360(alpha / DEG),
      beta: (Math.PI - beta) / DEG > 180 ? (Math.PI - beta) / DEG - 360 : (Math.PI - beta) / DEG,
      gamma: wrap180(gamma / DEG),
    }
  }

  return normalise(alpha / DEG, beta / DEG, gamma / DEG, alphaOffset)
}

/**
 * Force a triple into the ranges the spec actually allows.
 *
 * alpha [0,360), beta [-180,180), gamma [-90,90). That last one is the whole
 * story: a phone held sideways and tilted past the horizon *wants* a gamma
 * beyond 90 degrees, cannot report one, and re-expresses the identical
 * orientation on the other branch instead — gamma folds back, and alpha and
 * beta both jump by 180.
 *
 * Without this the simulator happily reported gamma = -120 and never
 * reproduced the flip, which is exactly why the first two attempts at this bug
 * were guesses. A simulator that is kinder than the hardware is worse than
 * none.
 */
function normalise(alpha: number, beta: number, gamma: number, alphaOffset: number): DeviceReport {
  let a = alpha
  let b = beta
  let g = wrap180(gamma)

  if (g >= 90 || g < -90) {
    g = g >= 90 ? g - 180 : g + 180
    a += 180
    b = 180 - b
  }

  return {
    alpha: wrap360(a + alphaOffset),
    beta: wrap180(b),
    gamma: g,
  }
}

/**
 * What the compass reports for a pose.
 *
 * iOS derives its heading from the device's own orientation, and the widely
 * used recipe `trueAlpha = 360 − heading` implies the axis it reports is the
 * top of the screen, projected onto the horizontal. Modelled that way here,
 * physically and continuously — which is the point: the compass does *not*
 * jump when the Euler branch does, and that mismatch is the bug.
 *
 * Returns null where the reading is meaningless: held upright in portrait the
 * top of the screen points at the sky, its horizontal projection vanishes, and
 * a real phone returns noise.
 */
export function compassOf(pose: Pose): number | null {
  const m = matrixFor(pose)
  // Device +Y in world east/north/up is the second column.
  const east = m[0]![1]!
  const north = m[1]![1]!
  if (Math.hypot(east, north) < 0.25) return null
  return wrap360((Math.atan2(east, north) / DEG))
}

export const wrap360 = (d: number) => ((d % 360) + 360) % 360
export const wrap180 = (d: number) => {
  const w = wrap360(d)
  return w > 180 ? w - 360 : w
}

/**
 * A run of reports along a continuous motion.
 *
 * `compass` decides what the compass field does, which is the part we cannot
 * derive: whether it is well behaved, absent, or doing the thing phones do near
 * vertical and flipping half a turn.
 */
export function sweep(
  poses: Pose[],
  compass: (pose: Pose, index: number) => number | undefined = () => undefined,
  alphaBranch: (index: number) => boolean = () => false,
  alphaOffset = 0,
): DeviceReport[] {
  return poses.map((pose, i) => {
    const r = report(pose, alphaBranch(i), alphaOffset)
    const heading = compass(pose, i)
    return heading === undefined ? { ...r, absolute: true } : { ...r, webkitCompassHeading: heading }
  })
}

/** A straight line of poses between two, inclusive. */
export function motion(from: Pose, to: Pose, steps: number): Pose[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps
    return {
      bearing: from.bearing + (to.bearing - from.bearing) * t,
      elevation: from.elevation + (to.elevation - from.elevation) * t,
      roll: from.roll + (to.roll - from.roll) * t,
    }
  })
}

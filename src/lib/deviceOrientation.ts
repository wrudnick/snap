/**
 * Where the phone's back camera is pointing.
 *
 * The relative version of the gyro integrated *changes* in alpha and beta,
 * which meant the view depended on how you happened to be holding the phone
 * when the run started and drifted from there. Absolute means the phone's
 * physical attitude is the camera's attitude: point it at the horizon and you
 * are looking at the horizon, every time, with nothing to re-zero.
 *
 * Doing that needs the full rotation, not two angles read off separately.
 * `beta` and `gamma` are defined against the device rather than the world, so
 * neither is elevation on its own — tilt the phone and roll it and beta changes
 * without the camera moving. Building the rotation matrix and asking where the
 * back of the phone points is the only thing that stays correct in every grip,
 * and it makes screen orientation irrelevant: the back camera faces the same
 * way whether the UI is portrait or landscape.
 */

const DEG = Math.PI / 180

export interface Attitude {
  /** Compass bearing of the camera, radians clockwise from north. */
  bearing: number
  /** Angle above the horizon, radians. Positive is up. */
  elevation: number
}

/**
 * Attitude from the three device-orientation angles, in degrees.
 *
 * The matrix is the W3C spec's: an intrinsic Z-X'-Y'' rotation by
 * alpha, beta, gamma, taking device coordinates into a world frame of
 * east / north / up. The camera looks along the device's −Z, so its world
 * direction is the negated third column.
 */
export function cameraAttitude(alpha: number, beta: number, gamma: number): Attitude {
  const cA = Math.cos(alpha * DEG)
  const sA = Math.sin(alpha * DEG)
  const cB = Math.cos(beta * DEG)
  const sB = Math.sin(beta * DEG)
  const cG = Math.cos(gamma * DEG)
  const sG = Math.sin(gamma * DEG)

  // Third column of R = Rz(alpha) · Rx(beta) · Ry(gamma).
  const east = -(cA * sG + cG * sA * sB)
  const north = -(sA * sG - cA * cG * sB)
  const up = -(cB * cG)

  return {
    bearing: Math.atan2(east, north),
    elevation: Math.asin(Math.max(-1, Math.min(1, up))),
  }
}

/**
 * The alpha to feed `cameraAttitude`, referenced to true north where possible.
 *
 * A plain `deviceorientation` event has an arbitrary alpha zero — it is
 * whatever the device felt like when it started — which is exactly the
 * "relative to when you open the app" problem. Two sources fix it:
 *
 * - iOS reports `webkitCompassHeading`, a true bearing. Alpha counts the
 *   opposite way round, hence the subtraction from 360.
 * - Android sets `absolute` on `deviceorientationabsolute`, where alpha is
 *   already measured from north.
 *
 * Returns null when neither is available, which is the caller's signal to fall
 * back to relative look rather than point the camera somewhere arbitrary.
 */
export function absoluteAlpha(event: DeviceOrientationEvent): number | null {
  const compass = (event as DeviceOrientationEvent & { webkitCompassHeading?: number })
    .webkitCompassHeading
  if (typeof compass === 'number' && Number.isFinite(compass)) return 360 - compass
  if (event.absolute && event.alpha !== null) return event.alpha
  return null
}

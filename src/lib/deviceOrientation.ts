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
 * North-referenced attitude straight from an event, or null if it has no north.
 *
 * The compass is applied as a *correction to the bearing*, never by
 * substituting it for alpha in the angle triple. That substitution is what
 * flipped the view 180° the moment the phone was tilted while held sideways,
 * and the reason is worth writing down because it is invisible from the code
 * that does it:
 *
 * The three angles are an intrinsic Z-X'-Y'' decomposition, and in landscape
 * gamma sits at ±90°, which is that decomposition's gimbal singularity. There
 * alpha and beta stop being independent — only their sum or difference is
 * determined — so a device reports them *jumping together*, by 180° each, with
 * the physical orientation completely unchanged. The matrix built from the
 * reported triple is continuous through that jump. Replace alpha with a compass
 * reading and keep the jumped beta, and it is not: you have built a rotation
 * the phone was never in.
 *
 * Since alpha is the first rotation of the three, changing it by Δ post-
 * multiplies nothing and pre-multiplies a rotation about world up — so it
 * turns the camera's bearing by exactly −Δ and leaves elevation alone. That
 * makes the correction a scalar on the output, which is safe at any pose.
 */
export function attitudeFromEvent(event: DeviceOrientationEvent): Attitude | null {
  const { alpha, beta, gamma } = event
  if (alpha === null || beta === null || gamma === null) return null

  // Built from the reported triple, unmodified, so it stays self-consistent.
  const raw = cameraAttitude(alpha, beta, gamma)

  const compass = (event as DeviceOrientationEvent & { webkitCompassHeading?: number })
    .webkitCompassHeading
  if (typeof compass === 'number' && Number.isFinite(compass)) {
    // iOS: the recipe is `trueAlpha = 360 − heading`, applied as a bearing
    // offset rather than a substitution.
    const delta = (360 - compass - alpha) * DEG
    return { bearing: wrapPi(raw.bearing - delta), elevation: raw.elevation }
  }

  // Android's absolute event already measures alpha from north.
  if (event.absolute) return raw

  return null
}

/** Bring an angle into −π…π. */
export function wrapPi(angle: number): number {
  let a = angle
  while (a > Math.PI) a -= Math.PI * 2
  while (a < -Math.PI) a += Math.PI * 2
  return a
}

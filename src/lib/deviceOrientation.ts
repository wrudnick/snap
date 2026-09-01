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
/**
 * The device's axes in the world, as east/north/up triples.
 *
 * The matrix is the W3C spec's: an intrinsic Z-X'-Y'' rotation by alpha, beta,
 * gamma, taking device coordinates into a world frame of east / north / up.
 * Its columns are the device's own axes, and two of them matter — the camera
 * looks along −Z, and the compass reports the heading of +Y.
 *
 * Everything downstream is derived from this rather than from the angles,
 * because the matrix is continuous where the angles are not.
 */
function frameOf(alpha: number, beta: number, gamma: number) {
  const cA = Math.cos(alpha * DEG)
  const sA = Math.sin(alpha * DEG)
  const cB = Math.cos(beta * DEG)
  const sB = Math.sin(beta * DEG)
  const cG = Math.cos(gamma * DEG)
  const sG = Math.sin(gamma * DEG)

  return {
    // −(third column): where the back camera points.
    camera: {
      east: -(cA * sG + cG * sA * sB),
      north: -(sA * sG - cA * cG * sB),
      up: -(cB * cG),
    },
    // Second column: the top of the screen.
    screenUp: { east: -cB * sA, north: cA * cB, up: sB },
  }
}

export function cameraAttitude(alpha: number, beta: number, gamma: number): Attitude {
  const { camera } = frameOf(alpha, beta, gamma)
  return {
    bearing: Math.atan2(camera.east, camera.north),
    elevation: Math.asin(Math.max(-1, Math.min(1, camera.up))),
  }
}

/**
 * Holds the offset between the device's alpha zero and true north.
 *
 * Stateful because it has to be. The compass is only meaningful in some poses,
 * and the reference it gives is a constant of the device — so it is measured
 * when it can be measured and held when it cannot, rather than recomputed from
 * whatever the sensor happens to be saying this frame.
 *
 * The bug this exists to kill: alpha, beta and gamma are an intrinsic
 * Z-X'-Y'' decomposition with gamma confined to [-90, 90). A phone held
 * sideways and tilted up through the horizon *wants* a gamma past 90, cannot
 * report one, and re-expresses the identical orientation on the other branch —
 * gamma folds back and alpha jumps by 180 degrees. Any correction with alpha in
 * it inherits that jump. The previous version computed
 * `360 - compass - alpha`, and flipped the view half a turn every time the
 * player tilted the phone through level.
 *
 * So the offset is measured between two quantities that both come from the
 * rotation matrix — the compass's own axis, and where that axis points — and
 * the matrix is continuous across the fold even though the angles are not.
 */
export class NorthReference {
  private offset: number | null = null
  /**
   * The last bearing taken from a pose that could actually express one.
   *
   * Held through poses that cannot. `conditioning` below is |cos(beta)|, and
   * beta reaches 90 degrees when the phone is upright in portrait — the top of
   * the screen pointing at the sky. There the Z-X'-Y'' decomposition loses a
   * degree of freedom: alpha and gamma stop being independent and a real device
   * reports whichever of the two swings wildly. Nothing is wrong with the
   * phone, and no amount of arithmetic recovers a heading the angles do not
   * contain.
   *
   * Elevation survives it — at beta 90 the camera really is on the horizon, and
   * that is what the maths returns — so only the bearing is held.
   */
  private bearing: number | null = null

  /**
   * How horizontal the compass's axis has to be for its reading to mean
   * anything. The top of the screen points at the sky when the phone is held
   * upright in portrait, and a heading derived from a vertical axis is noise.
   */
  private static readonly MIN_CONDITIONING = 0.3

  reset(): void {
    this.offset = null
    this.bearing = null
  }

  /** North-referenced attitude, or null while there is no reference yet. */
  update(event: DeviceOrientationEvent): Attitude | null {
    const { alpha, beta, gamma } = event
    if (alpha === null || beta === null || gamma === null) return null

    const { camera, screenUp } = frameOf(alpha, beta, gamma)
    const elevation = Math.asin(Math.max(-1, Math.min(1, camera.up)))

    /**
     * How much heading the reported angles can carry.
     *
     * The horizontal length of the screen-up axis, which is |cos(beta)|. It
     * governs both the compass reading and the bearing, because both are
     * headings and beta 90 is where headings stop existing.
     */
    const conditioning = Math.hypot(screenUp.east, screenUp.north)
    const usable = conditioning > NorthReference.MIN_CONDITIONING
    if (usable) this.bearing = Math.atan2(camera.east, camera.north)
    const bearing = this.bearing

    if (event.absolute) {
      // Android's absolute event already measures alpha from north.
      this.offset = 0
    } else {
      const compass = (event as DeviceOrientationEvent & { webkitCompassHeading?: number })
        .webkitCompassHeading
      if (typeof compass === 'number' && Number.isFinite(compass) && usable) {
        // Both sides are the heading of the same axis: one measured by the
        // magnetometer, one derived from the reported orientation. Their
        // difference is where the device's alpha zero sits relative to north.
        const axisBearing = Math.atan2(screenUp.east, screenUp.north)
        this.offset = wrapPi(compass * DEG - axisBearing)
      }
    }

    if (this.offset === null || bearing === null) return null
    return { bearing: wrapPi(bearing + this.offset), elevation }
  }
}

/** Bring an angle into −π…π. */
export function wrapPi(angle: number): number {
  let a = angle
  while (a > Math.PI) a -= Math.PI * 2
  while (a < -Math.PI) a += Math.PI * 2
  return a
}

/**
 * How far the device has turned from the bearing captured as "forward".
 *
 * The whole of the gyro look rule, in one line, so it can be tested as a
 * property rather than inspected inside a React component. The camera's world
 * heading is `railHeading + lookOffset(bearing, reference)`, and the reason
 * that composition matters is the bug it replaces: feeding the bearing in as a
 * world heading meant a still phone held a fixed compass direction while the
 * route turned away underneath it, so rounding a corner slid the view off the
 * street and into a wall.
 *
 * Wrapped, never clamped. A cone belongs to a mouse, where the hand stops when
 * the picture stops; a phone keeps turning with your body whatever the camera
 * does.
 */
export function lookOffset(bearing: number, reference: number): number {
  return wrapPi(bearing - reference)
}

import * as THREE from 'three'

import type { RouteDef } from '@/content/routes/types'

/**
 * The on-rails camera path.
 *
 * Travel and look are fully decoupled: the spline decides where the camera *is*
 * and which way it's nominally pointing, while the player only ever supplies
 * yaw/pitch offsets on top of that frame. This is also what makes the route a
 * performance asset — because the path is known ahead of time, we can gate world
 * content by rail segment instead of culling a live world every frame.
 */
export class Rail {
  readonly curve: THREE.CatmullRomCurve3
  readonly segmentCount: number

  // Scratch vectors — reused every frame so the game loop allocates nothing.
  private readonly _pos = new THREE.Vector3()
  private readonly _tan = new THREE.Vector3()

  constructor(route: RouteDef) {
    this.curve = new THREE.CatmullRomCurve3(
      route.waypoints.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
      false,
      'catmullrom',
      // Low tension keeps street corners crisp. At the default 0.5 the spline
      // sweeps through a 90-degree turn like a racetrack, which reads nothing
      // like walking a city grid; near zero it approaches straight runs between
      // waypoints with a tight radius at the corner.
      0.16,
    )
    this.segmentCount = route.segmentCount
  }

  /** Camera position at route progress `t` (0..1), written into `target`. */
  positionAt(t: number, target: THREE.Vector3): THREE.Vector3 {
    return this.curve.getPointAt(clamp01(t), target)
  }

  /** Normalized direction of travel at `t`. */
  tangentAt(t: number, target: THREE.Vector3): THREE.Vector3 {
    return this.curve.getTangentAt(clamp01(t), target).normalize()
  }

  /**
   * The rail's base heading at `t`, in radians, matching three's Y-up / -Z-forward
   * convention. Player yaw is added to this.
   */
  headingAt(t: number): number {
    const tan = this.tangentAt(t, this._tan)
    return Math.atan2(-tan.x, -tan.z)
  }

  /** Which segment index `t` falls in. Used for content gating. */
  segmentAt(t: number): number {
    const i = Math.floor(clamp01(t) * this.segmentCount)
    return Math.min(i, this.segmentCount - 1)
  }

  /** World-space centre of a segment — where its content is anchored. */
  segmentCenter(index: number, target: THREE.Vector3): THREE.Vector3 {
    return this.positionAt((index + 0.5) / this.segmentCount, target)
  }

  /** Total path length in world units. */
  get length(): number {
    return this.curve.getLength()
  }

  /**
   * Route progress nearest a world position.
   *
   * Catmull-Rom control points don't map linearly onto the arc-length
   * parameterisation `getPointAt` uses, so a section that spans waypoints 4–8
   * can't have its `t` range computed arithmetically. Sampling and taking the
   * nearest point is approximate but stable, and it runs once at load.
   */
  tNearest(point: THREE.Vector3, samples = 600): number {
    let bestT = 0
    let bestDistance = Infinity
    const probe = new THREE.Vector3()

    for (let i = 0; i < samples; i++) {
      const t = i / (samples - 1)
      this.curve.getPointAt(t, probe)
      const d = probe.distanceToSquared(point)
      if (d < bestDistance) {
        bestDistance = d
        bestT = t
      }
    }
    return bestT
  }

  /** Unit vector pointing right of travel at `t`, on the horizontal plane. */
  rightAt(t: number, target: THREE.Vector3): THREE.Vector3 {
    this.tangentAt(t, target)
    // cross(tangent, up) — written out to avoid a temporary.
    const { x, z } = target
    return target.set(-z, 0, x).normalize()
  }

  /** Convenience for debug draws: `count` evenly spaced points along the path. */
  samplePoints(count: number): THREE.Vector3[] {
    return Array.from({ length: count }, (_, i) =>
      this.curve.getPointAt(i / (count - 1), new THREE.Vector3()),
    )
  }

  /** Reused scratch position, for callers that just need a peek. */
  get scratch(): THREE.Vector3 {
    return this._pos
  }
}

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)

export const clamp = (v: number, min: number, max: number): number =>
  v < min ? min : v > max ? max : v

/**
 * Is `segment` close enough to the camera's current segment to be worth
 * rendering? Everything outside this window is unmounted entirely.
 */
export function segmentActive(
  segment: number,
  current: number,
  window: number,
): boolean {
  return Math.abs(segment - current) <= window
}

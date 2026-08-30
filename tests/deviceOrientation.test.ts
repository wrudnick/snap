import { describe, expect, it } from 'vitest'

import { cameraAttitude } from '../src/lib/deviceOrientation'

/**
 * The signs here are the whole point.
 *
 * Every one of these could be inverted without anything failing to compile or
 * throwing, and each inversion produces a game that is subtly unplayable in a
 * way that is hard to describe and easy to argue about. Pinned to cases that
 * can be checked by holding a phone and thinking about it.
 */
describe('camera attitude', () => {
  const deg = (radians: number) => (radians * 180) / Math.PI

  it('held upright facing north, looks north at the horizon', () => {
    const { bearing, elevation } = cameraAttitude(0, 90, 0)
    expect(deg(bearing)).toBeCloseTo(0, 4)
    expect(deg(elevation)).toBeCloseTo(0, 4)
  })

  it('tipping the top away from you points the camera down', () => {
    // beta 90 is upright; less than that is tipped forward.
    expect(deg(cameraAttitude(0, 60, 0).elevation)).toBeCloseTo(-30, 4)
  })

  it('leaning the top back towards you points the camera up', () => {
    expect(deg(cameraAttitude(0, 120, 0).elevation)).toBeCloseTo(30, 4)
  })

  it('turning to the right raises the bearing', () => {
    // Alpha counts anticlockwise, so turning right is alpha going down.
    const ahead = cameraAttitude(0, 90, 0).bearing
    const right = cameraAttitude(-40, 90, 0).bearing
    expect(deg(right) - deg(ahead)).toBeCloseTo(40, 3)
  })

  it('faces east when turned a quarter turn right', () => {
    expect(deg(cameraAttitude(-90, 90, 0).bearing)).toBeCloseTo(90, 3)
  })

  it('rolling the phone into landscape does not change where it points', () => {
    // Landscape is a roll about the device's own Z. Held upright and pointing
    // at the horizon, the camera must still point at the horizon.
    const portrait = cameraAttitude(0, 90, 0)
    const landscape = cameraAttitude(90, 0, -90)
    expect(deg(landscape.elevation)).toBeCloseTo(deg(portrait.elevation), 3)
    expect(deg(landscape.bearing)).toBeCloseTo(deg(portrait.bearing), 3)
  })
})

/**
 * Round-tripping real orientations through the angle triple.
 *
 * The 180° flip was invisible to the tests above because they all fed angle
 * triples in directly, and the bug was in *how a triple was assembled* — a
 * compass reading substituted for alpha while beta kept the value it had
 * jumped to. This builds a physical orientation, decomposes it the way a device
 * does, and checks what comes back out, which is the only way to catch that
 * class of thing.
 */
describe('round trip through device angles', () => {
  const DEG = Math.PI / 180

  /** ZXY decomposition, matching the matrix `cameraAttitude` builds. */
  function decompose(m: number[][]): { alpha: number; beta: number; gamma: number } {
    const beta = Math.asin(Math.max(-1, Math.min(1, m[2]![1]!)))
    return {
      alpha: Math.atan2(-m[0]![1]!, m[1]![1]!) / DEG,
      beta: beta / DEG,
      gamma: Math.atan2(-m[2]![0]!, m[2]![2]!) / DEG,
    }
  }

  /**
   * A device whose back camera points at `bearing`/`elevation`, rolled by
   * `roll` about that direction. Roll ±90° is landscape — which is where the
   * decomposition is degenerate and where the bug lived.
   */
  function orient(bearing: number, elevation: number, roll: number): number[][] {
    const b = bearing * DEG
    const e = elevation * DEG
    const r = roll * DEG
    // Camera direction in east/north/up.
    const f = [Math.sin(b) * Math.cos(e), Math.cos(b) * Math.cos(e), Math.sin(e)]
    // Screen-up before roll: world up with the along-f component removed.
    const dot = f[2]!
    let up = [-f[0]! * dot, -f[1]! * dot, 1 - f[2]! * dot]
    const un = Math.hypot(up[0]!, up[1]!, up[2]!)
    up = up.map((v) => v / un)
    // Right = up × (−f), then roll both about f.
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
    // Columns are the device axes in world coordinates.
    return [
      [X[0]!, Y[0]!, Z[0]!],
      [X[1]!, Y[1]!, Z[1]!],
      [X[2]!, Y[2]!, Z[2]!],
    ]
  }

  const check = (bearing: number, elevation: number, roll: number) => {
    const { alpha, beta, gamma } = decompose(orient(bearing, elevation, roll))
    const got = cameraAttitude(alpha, beta, gamma)
    return {
      bearing: ((((got.bearing * 180) / Math.PI) % 360) + 360) % 360,
      elevation: (got.elevation * 180) / Math.PI,
    }
  }

  it('recovers the orientation it was given, in portrait', () => {
    const got = check(35, 12, 0)
    expect(got.bearing).toBeCloseTo(35, 2)
    expect(got.elevation).toBeCloseTo(12, 2)
  })

  it('recovers it in landscape, where the decomposition is degenerate', () => {
    for (const roll of [90, -90]) {
      const got = check(200, -8, roll)
      expect(got.bearing, `roll ${roll}`).toBeCloseTo(200, 2)
      expect(got.elevation, `roll ${roll}`).toBeCloseTo(-8, 2)
    }
  })

  it('tilting up in landscape does not flip the bearing', () => {
    // The reported bug: past level, the view spun 180°.
    let previous = check(120, -30, 90).bearing
    for (let elevation = -25; elevation <= 45; elevation += 5) {
      const got = check(120, elevation, 90)
      expect(got.bearing, `at ${elevation}°`).toBeCloseTo(120, 2)
      expect(Math.abs(got.bearing - previous), `jump at ${elevation}°`).toBeLessThan(5)
      previous = got.bearing
      expect(got.elevation).toBeCloseTo(elevation, 2)
    }
  })
})

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

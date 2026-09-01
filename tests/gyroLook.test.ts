import { describe, expect, it } from 'vitest'

import { lookOffset, wrapPi } from '../src/lib/deviceOrientation'

/** What the camera actually ends up pointing at, in world terms. */
const cameraHeading = (railHeading: number, bearing: number, reference: number) =>
  wrapPi(railHeading + lookOffset(bearing, reference))

const deg = (d: number) => (d * Math.PI) / 180

describe('gyro look', () => {
  /**
   * The one that was wrong.
   *
   * Hold the phone perfectly still through a corner and the view must come
   * round with the road. Before this, the bearing *was* the camera heading, so
   * a still phone held its compass direction and a ninety degree turn left the
   * player facing a building.
   */
  it('follows the route when the phone is held still', () => {
    const bearing = deg(23)
    const reference = deg(23)
    for (const rail of [0, deg(30), deg(90), deg(180), deg(-140)]) {
      expect(cameraHeading(rail, bearing, reference)).toBeCloseTo(wrapPi(rail), 6)
    }
  })

  it('turns with the phone, wherever the route points', () => {
    const reference = deg(23)
    for (const rail of [0, deg(90), deg(-140)]) {
      for (const turn of [deg(15), deg(-40), deg(120)]) {
        expect(cameraHeading(rail, reference + turn, reference)).toBeCloseTo(wrapPi(rail + turn), 6)
      }
    }
  })

  /**
   * The second complaint: a wall halfway round.
   *
   * The old cone was 1.75 rad, so anything past a hundred degrees stopped
   * dead. Turning right round has to keep working, and has to come back to
   * where it started rather than pile up.
   */
  it('is not walled at any angle', () => {
    const reference = 0
    let previous = 0
    for (let d = 0; d <= 360; d += 5) {
      const offset = lookOffset(deg(d), reference)
      expect(Math.abs(offset)).toBeLessThanOrEqual(Math.PI + 1e-9)
      // Never sticks: consecutive readings always differ until it comes home.
      if (d > 0 && d < 360) expect(offset).not.toBe(previous)
      previous = offset
    }
    expect(lookOffset(deg(360), reference)).toBeCloseTo(0, 6)
    expect(lookOffset(deg(180), reference)).toBeCloseTo(Math.PI, 6)
    expect(lookOffset(deg(-179), reference)).toBeCloseTo(deg(-179), 6)
  })

  it('recentring makes forward wherever the phone is pointing', () => {
    for (const bearing of [deg(23), deg(-150), deg(179)]) {
      // Recentre captures the current bearing as the reference.
      expect(lookOffset(bearing, bearing)).toBeCloseTo(0, 6)
    }
  })
})

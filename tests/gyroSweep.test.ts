import { describe, expect, it } from 'vitest'

import { NorthReference, wrapPi } from '../src/lib/deviceOrientation'
import { compassOf, motion, report, type Pose } from './deviceSimulator'

/**
 * The gyro, driven through motions that are continuous by construction.
 *
 * This bug was diagnosed by reasoning twice and shipped broken twice. Both
 * times the reasoning was plausible and both times it was about the wrong
 * angle. What was missing was not insight but an instrument: a way to feed the
 * real code path a *physical* motion and check that what comes out moves as
 * smoothly as what went in.
 *
 * The failure the third attempt actually found: alpha, beta and gamma are an
 * intrinsic Z-X'-Y'' decomposition with gamma confined to [-90, 90). A phone
 * held sideways and tilted up through the horizon wants a gamma past 90,
 * cannot report one, and re-expresses the same orientation on the other branch
 * — gamma folds and alpha jumps 180 degrees. Nothing about the phone moved
 * 180 degrees; only the description did.
 */

const DEG = 180 / Math.PI

/** Walk a motion through the tracker and return the largest single-step jump. */
function worstJump(poses: Pose[], alphaOffset = 40): { jump: number; at: Pose | null } {
  const north = new NorthReference()
  let previous: number | null = null
  let worst = 0
  let at: Pose | null = null

  for (const pose of poses) {
    const r = report(pose, false, alphaOffset)
    const compass = compassOf(pose)
    const event = {
      ...r,
      webkitCompassHeading: compass ?? undefined,
    } as unknown as DeviceOrientationEvent

    const attitude = north.update(event)
    if (!attitude) continue
    if (previous !== null) {
      const jump = Math.abs(wrapPi(attitude.bearing - previous) * DEG)
      if (jump > worst) {
        worst = jump
        at = pose
      }
    }
    previous = attitude.bearing
  }
  return { jump: worst, at }
}

/**
 * A step of well under a degree, so any jump found is the code and not the
 * sampling. Real events arrive at about 60 Hz, which is finer still.
 */
const STEPS = 120

describe('gyro continuity', () => {
  const cases: Array<[string, Pose, Pose]> = [
    // The reported bug: sideways, tilting up through level.
    ['landscape, tilting through the horizon', { bearing: 120, elevation: -30, roll: 90 }, { bearing: 120, elevation: 30, roll: 90 }],
    ['landscape the other way up', { bearing: 200, elevation: -30, roll: -90 }, { bearing: 200, elevation: 30, roll: -90 }],
    ['portrait, tilting through the horizon', { bearing: 40, elevation: -30, roll: 0 }, { bearing: 40, elevation: 30, roll: 0 }],
    ['landscape, panning past north', { bearing: -60, elevation: 5, roll: 90 }, { bearing: 60, elevation: 5, roll: 90 }],
    ['landscape, panning right round', { bearing: 0, elevation: 0, roll: 90 }, { bearing: 355, elevation: 0, roll: 90 }],
    ['rolling from portrait into landscape', { bearing: 150, elevation: 10, roll: 0 }, { bearing: 150, elevation: 10, roll: 90 }],
    ['panning and tilting together', { bearing: 40, elevation: -25, roll: 90 }, { bearing: 220, elevation: 35, roll: 90 }],
    ['steeply up, then down', { bearing: 300, elevation: 55, roll: 90 }, { bearing: 300, elevation: -55, roll: 90 }],
  ]

  for (const [label, from, to] of cases) {
    it(`stays continuous: ${label}`, () => {
      const { jump, at } = worstJump(motion(from, to, STEPS))
      expect(
        jump,
        at ? `worst jump at elevation ${at.elevation.toFixed(1)}, roll ${at.roll.toFixed(0)}` : '',
      ).toBeLessThan(6)
    })
  }

  it('reports the bearing the phone is actually pointing', () => {
    // Absolute, not merely smooth: a continuous but wrong answer would pass
    // every test above.
    const north = new NorthReference()
    const errors: string[] = []

    for (const pose of motion(
      { bearing: 70, elevation: -20, roll: 90 },
      { bearing: 250, elevation: 25, roll: 90 },
      60,
    )) {
      const r = report(pose, false, 137)
      const event = {
        ...r,
        webkitCompassHeading: compassOf(pose) ?? undefined,
      } as unknown as DeviceOrientationEvent
      const attitude = north.update(event)
      if (!attitude) continue

      const gotBearing = ((attitude.bearing * DEG) % 360 + 360) % 360
      const gotElevation = attitude.elevation * DEG
      let db = Math.abs(gotBearing - pose.bearing)
      if (db > 180) db = 360 - db
      if (db > 1 || Math.abs(gotElevation - pose.elevation) > 1) {
        errors.push(
          `at ${pose.bearing.toFixed(0)}/${pose.elevation.toFixed(0)}: ` +
          `got ${gotBearing.toFixed(0)}/${gotElevation.toFixed(0)}`,
        )
      }
    }
    expect(errors.slice(0, 5)).toEqual([])
  })

  it('holds its reference through poses where the compass is meaningless', () => {
    /**
     * Held upright in portrait the top of the screen points at the sky, so the
     * axis the compass reports on is vertical and the reading is noise. The
     * reference has to be held rather than recomputed from it — otherwise the
     * view swings whenever the phone passes through upright.
     */
    const north = new NorthReference()
    const settle = motion({ bearing: 90, elevation: 0, roll: 90 }, { bearing: 90, elevation: 0, roll: 90 }, 2)
    for (const pose of settle) {
      north.update({
        ...report(pose, false, 40),
        webkitCompassHeading: compassOf(pose) ?? undefined,
      } as unknown as DeviceOrientationEvent)
    }

    let worst = 0
    for (const pose of motion({ bearing: 90, elevation: 0, roll: 90 }, { bearing: 90, elevation: 0, roll: 0 }, 90)) {
      const attitude = north.update({
        ...report(pose, false, 40),
        // Null once the axis goes vertical, exactly as a phone reports noise.
        webkitCompassHeading: compassOf(pose) ?? undefined,
      } as unknown as DeviceOrientationEvent)
      if (!attitude) continue
      let db = Math.abs(((attitude.bearing * DEG) % 360 + 360) % 360 - 90)
      if (db > 180) db = 360 - db
      worst = Math.max(worst, db)
    }
    expect(worst, 'bearing drifted while rolling through upright').toBeLessThan(6)
  })
})

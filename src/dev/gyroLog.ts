import { NorthReference } from '@/lib/deviceOrientation'

/**
 * A recorder for what the phone actually says.
 *
 * The simulator can prove the code survives motions we can *think* of. It
 * cannot tell us what a particular handset does with its magnetometer near a
 * lift shaft, or whether iOS's compass means what the recipe assumes. So this
 * keeps the last few seconds of raw sensor readings alongside what the game
 * made of them, and hands them over as text.
 *
 * Text, and on screen, because the alternative on a phone is a debugger that
 * is not there. A ring buffer rather than a growing array: this runs at sixty
 * hertz for as long as someone is playing.
 */

export interface GyroSample {
  t: number
  alpha: number | null
  beta: number | null
  gamma: number | null
  absolute: boolean
  compass: number | null
  /** What the tracker made of it, in degrees. */
  bearing: number | null
  elevation: number | null
}

const CAPACITY = 900

export class GyroLog {
  private readonly samples: GyroSample[] = []
  private readonly north = new NorthReference()
  private start = 0

  record(event: DeviceOrientationEvent): void {
    if (this.start === 0) this.start = performance.now()
    const attitude = this.north.update(event)
    const compass = (event as DeviceOrientationEvent & { webkitCompassHeading?: number })
      .webkitCompassHeading

    this.samples.push({
      t: Math.round(performance.now() - this.start),
      alpha: event.alpha,
      beta: event.beta,
      gamma: event.gamma,
      absolute: Boolean(event.absolute),
      compass: typeof compass === 'number' ? compass : null,
      bearing: attitude ? (attitude.bearing * 180) / Math.PI : null,
      elevation: attitude ? (attitude.elevation * 180) / Math.PI : null,
    })
    if (this.samples.length > CAPACITY) this.samples.shift()
  }

  /** The most recent sample, for a live readout. */
  latest(): GyroSample | null {
    return this.samples[this.samples.length - 1] ?? null
  }

  /**
   * The biggest single-step jump in bearing in the buffer.
   *
   * The number that matters. A flip shows up here as something near 180 even if
   * it happened three seconds ago and is long gone from the live readout.
   */
  worstJump(): { degrees: number; at: GyroSample | null } {
    let worst = 0
    let at: GyroSample | null = null
    for (let i = 1; i < this.samples.length; i++) {
      const a = this.samples[i - 1]!.bearing
      const b = this.samples[i]!.bearing
      if (a === null || b === null) continue
      let d = Math.abs(b - a)
      if (d > 180) d = 360 - d
      if (d > worst) {
        worst = d
        at = this.samples[i]!
      }
    }
    return { degrees: worst, at }
  }

  /** Everything, as CSV — small enough to paste into a message. */
  toCsv(): string {
    const rows = ['t_ms,alpha,beta,gamma,absolute,compass,bearing,elevation']
    for (const s of this.samples) {
      rows.push(
        [
          s.t,
          s.alpha?.toFixed(2) ?? '',
          s.beta?.toFixed(2) ?? '',
          s.gamma?.toFixed(2) ?? '',
          s.absolute ? 1 : 0,
          s.compass?.toFixed(2) ?? '',
          s.bearing?.toFixed(2) ?? '',
          s.elevation?.toFixed(2) ?? '',
        ].join(','),
      )
    }
    return rows.join('\n')
  }

  clear(): void {
    this.samples.length = 0
    this.start = 0
    this.north.reset()
  }
}

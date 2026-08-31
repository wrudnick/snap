import { useEffect, useRef, useState } from 'react'

import { GyroLog } from './gyroLog'

/**
 * A live sensor readout, shown with `?gyro=1`.
 *
 * Written into the DOM from the event handler rather than through React state:
 * this updates sixty times a second, and re-rendering the HUD at that rate is
 * the exact trap the rest of the architecture avoids.
 *
 * The numbers on it are chosen to make one specific failure obvious. `worst`
 * is the largest single-frame jump in bearing since the buffer started — a flip
 * pins it near 180 and it stays pinned, so it can be read after the fact rather
 * than having to be caught in the act. `gamma` and `beta` are there because the
 * flip happens when gamma folds at ±90 and they are what shows it happening.
 */
export function GyroOverlay() {
  const log = useRef(new GyroLog())
  const readout = useRef<HTMLPreElement>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const recorder = log.current
    const onOrientation = (event: DeviceOrientationEvent) => recorder.record(event)
    window.addEventListener('deviceorientationabsolute', onOrientation)
    window.addEventListener('deviceorientation', onOrientation)

    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const el = readout.current
      if (!el) return
      const s = recorder.latest()
      const worst = recorder.worstJump()
      const n = (v: number | null | undefined, w = 7) =>
        v === null || v === undefined ? '—'.padStart(w) : v.toFixed(1).padStart(w)

      el.textContent = s
        ? [
            `alpha ${n(s.alpha)}   beta ${n(s.beta)}`,
            `gamma ${n(s.gamma)}   compass ${n(s.compass)}`,
            `absolute ${s.absolute ? 'yes' : 'no'}`,
            '',
            `bearing ${n(s.bearing)}   elev ${n(s.elevation)}`,
            '',
            `worst jump ${worst.degrees.toFixed(1)}°`,
            worst.at ? `   at gamma ${n(worst.at.gamma)} beta ${n(worst.at.beta)}` : '',
          ].join('\n')
        : 'waiting for the motion sensors…\n(grant access on the menu screen)'
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('deviceorientationabsolute', onOrientation)
      window.removeEventListener('deviceorientation', onOrientation)
    }
  }, [])

  return (
    <div className="gyro">
      <pre className="gyro__readout" ref={readout} />
      <div className="gyro__row">
        <button
          type="button"
          className="gyro__btn"
          onPointerDown={() => {
            // Clipboard, because a phone has no console to read and no file to
            // hand over. Falls back to dumping into the readout, which can at
            // least be screenshotted.
            const csv = log.current.toCsv()
            void navigator.clipboard?.writeText(csv).then(
              () => setCopied(true),
              () => {
                if (readout.current) readout.current.textContent = csv.slice(-1200)
              },
            )
          }}
        >
          {copied ? 'copied' : 'copy trace'}
        </button>
        <button
          type="button"
          className="gyro__btn"
          onPointerDown={() => {
            log.current.clear()
            setCopied(false)
          }}
        >
          reset
        </button>
      </div>
    </div>
  )
}

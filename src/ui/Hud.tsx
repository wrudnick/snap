import { useEffect, useRef } from 'react'

import { runtime } from '@/game/runtime'
import { useGame } from '@/game/state'

/**
 * The viewfinder.
 *
 * Route progress is animated by writing to the DOM directly from a rAF loop
 * rather than through React state — it changes every frame, and re-rendering the
 * HUD at 60fps is exactly the trap the architecture is built to avoid. Only the
 * film counter and the shutter flash, both discrete, come from the store.
 */
export function Hud() {
  const filmRemaining = useGame((s) => s.filmRemaining)
  const shutterTick = useGame((s) => s.shutterTick)

  const barRef = useRef<HTMLDivElement>(null)
  const flashRef = useRef<HTMLDivElement>(null)
  const sectionRef = useRef<HTMLDivElement>(null)
  const speedRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let raf = 0
    let lastTitle = ''
    let lastSpeed = -1

    const tick = () => {
      if (barRef.current) barRef.current.style.transform = `scaleX(${runtime.t})`

      // Both change rarely; comparing before writing keeps this off the layout
      // path on the frames where nothing moved.
      if (sectionRef.current && runtime.sectionTitle !== lastTitle) {
        lastTitle = runtime.sectionTitle
        sectionRef.current.textContent = lastTitle
      }
      if (speedRef.current && runtime.speed !== lastSpeed) {
        lastSpeed = runtime.speed
        speedRef.current.textContent = lastSpeed === 1 ? '' : `${lastSpeed}×`
      }

      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  // Retrigger the flash animation on each shot.
  useEffect(() => {
    if (shutterTick === 0) return
    const el = flashRef.current
    if (!el) return
    el.classList.remove('fire')
    void el.offsetWidth
    el.classList.add('fire')
  }, [shutterTick])

  return (
    <div className="hud">
      <div className="progress">
        <div className="bar" ref={barRef} />
      </div>

      <div className="corner tl" />
      <div className="corner tr" />
      <div className="corner bl" />
      <div className="corner br" />
      <div className="reticle" />

      <div className="section" ref={sectionRef} />
      <div className="speed" ref={speedRef} />

      <div className="film">
        <div className="count">{filmRemaining}</div>
        <div className="label">shots left</div>
      </div>

      <div className="hint">
        Drag to look · Click or Space to shoot · Shift or right-click to zoom
        <br />
        <span style={{ opacity: 0.65 }}>
          [ ] speed · , . jump checkpoint
        </span>
      </div>

      <div className="flash" ref={flashRef} />
    </div>
  )
}

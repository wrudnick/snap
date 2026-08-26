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

  useEffect(() => {
    let raf = 0
    const tick = () => {
      if (barRef.current) barRef.current.style.transform = `scaleX(${runtime.t})`
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

      <div className="film">
        <div className="count">{filmRemaining}</div>
        <div className="label">shots left</div>
      </div>

      <div className="hint">
        Drag to look · Click or Space to shoot · Hold Shift or right-click to zoom
      </div>

      <div className="flash" ref={flashRef} />
    </div>
  )
}

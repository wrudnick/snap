import { useEffect, useMemo, useRef, useState } from 'react'

import { runtime } from '@/game/runtime'
import { useGame } from '@/game/state'
import { input, isPortrait, prefersTouch } from '@/input'

/**
 * "Turn your phone."
 *
 * The route's look cone is wide and shallow — you pan across a street far more
 * than you tilt up a building — so the game wants a landscape viewport, and in
 * portrait the viewfinder is a letterbox with most of the subject outside it.
 *
 * A prompt rather than a lock, because iOS Safari has no orientation lock at
 * all; `lockLandscape` is tried first for the browsers that do honour it, and
 * this covers the rest. Subscribed to the orientation change rather than polled
 * so it disappears the instant the phone is turned.
 */
function RotatePrompt() {
  const [portrait, setPortrait] = useState(() => isPortrait())

  useEffect(() => {
    const update = () => setPortrait(isPortrait())
    window.addEventListener('orientationchange', update)
    window.addEventListener('resize', update)
    // `orientationchange` fires before the viewport has settled on iOS, so the
    // resize listener is what actually gets the second reading right.
    return () => {
      window.removeEventListener('orientationchange', update)
      window.removeEventListener('resize', update)
    }
  }, [])

  if (!portrait) return null
  return (
    <div className="rotate">
      <div className="rotate__icon">▭</div>
      <div className="rotate__text">Turn your phone sideways</div>
    </div>
  )
}

/**
 * On-screen controls, for the device that has no keyboard.
 *
 * Every discrete action in this game is on a key — Space to shoot, Shift to
 * zoom, P to pause, brackets for speed, commas for checkpoints — so on a phone
 * the game runs and can do none of them. These write straight into the shared
 * `input` object, which is the same thing the adapters do, so the game loop
 * cannot tell the difference between a thumb and a key.
 *
 * Deliberately not React state: a control that re-rendered the HUD would defeat
 * the point of animating the progress bar through a ref.
 */
function TouchControls() {
  const press = useMemo(
    () => (key: keyof typeof input) => () => {
      // Every one of these is edge-triggered and cleared by the game loop.
      ;(input as unknown as Record<string, boolean>)[key as string] = true
    },
    [],
  )

  /**
   * Zoom is a toggle.
   *
   * It was press-and-hold, mirroring the Shift key it replaces, and holding a
   * button with one thumb while framing with the other is exactly how you get a
   * blurry photograph of your own hand. `input.zoom` is a level the rig lerps
   * the FOV toward, so a toggle is simply a flip of that level and needs no
   * release — which also disposes of the pointer-capture dance the held version
   * needed to survive a finger sliding off the button.
   *
   * The button reflects the state through `aria-pressed`, which the stylesheet
   * uses for the lit look. Kept in a ref rather than React state: nothing else
   * re-renders during play, and this must not either.
   */
  const zoomRef = useRef<HTMLButtonElement>(null)
  const toggleZoom = useMemo(
    () => () => {
      input.zoom = !input.zoom
      zoomRef.current?.setAttribute('aria-pressed', String(input.zoom))
    },
    [],
  )

  return (
    <>
      {/* Left cluster: the hand that is not on the shutter. */}
      <div className="touch touch--left">
        <button
          ref={zoomRef}
          type="button"
          className="touch__zoom"
          aria-label="Zoom"
          aria-pressed="false"
          onPointerDown={toggleZoom}
        >
          <span aria-hidden="true">⌖</span>
        </button>
      </div>

      <div className="touch touch--right">
        <div className="touch__row">
          <button type="button" className="touch__btn" onPointerDown={press('prevCheckpoint')}>
            ‹
          </button>
          <button type="button" className="touch__btn" onPointerDown={press('togglePause')}>
            ‖
          </button>
          <button type="button" className="touch__btn" onPointerDown={press('nextCheckpoint')}>
            ›
          </button>
        </div>
        <button
          type="button"
          className="touch__shutter"
          aria-label="Shutter"
          onPointerDown={press('shutter')}
        />
        <div className="touch__hint">Point the phone to look · ⌖ to zoom</div>
      </div>
    </>
  )
}

/**
 * The viewfinder.
 *
 * Route progress is animated by writing to the DOM directly from a rAF loop
 * rather than through React state — it changes every frame, and re-rendering the
 * HUD at 60fps is exactly the trap the architecture is built to avoid. Only the
 * film counter and the shutter flash, both discrete, come from the store.
 */
export function Hud() {
  // Read once: swapping control schemes mid-run would be stranger than being
  // wrong on a hybrid device.
  const touch = useMemo(() => prefersTouch(), [])
  const filmRemaining = useGame((s) => s.filmRemaining)
  const shutterTick = useGame((s) => s.shutterTick)

  const barRef = useRef<HTMLDivElement>(null)
  const flashRef = useRef<HTMLDivElement>(null)
  const sectionRef = useRef<HTMLDivElement>(null)
  const speedRef = useRef<HTMLDivElement>(null)
  const pausedRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let raf = 0
    let lastTitle = ''
    let lastSpeed = -1
    let lastPaused: boolean | null = null

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

      if (pausedRef.current && runtime.paused !== lastPaused) {
        lastPaused = runtime.paused
        pausedRef.current.textContent = lastPaused ? 'Paused' : ''
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
    <div className={touch ? 'hud hud--touch' : 'hud'}>
      <div className="progress">
        <div className="bar" ref={barRef} />
      </div>

      <div className="corner tl" />
      <div className="corner tr" />
      <div className="corner bl" />
      <div className="corner br" />
      <div className="reticle" />

      <div className="section" ref={sectionRef} />
      <div className="paused" ref={pausedRef} />
      <div className="speed" ref={speedRef} />

      <div className="film">
        <div className="count">{filmRemaining}</div>
        <div className="label">shots left</div>
      </div>

      {touch ? <RotatePrompt /> : null}
      {touch ? <TouchControls /> : (
        <div className="hint">
          Drag to look · Click or Space to shoot · Shift or right-click to zoom
          <br />
          <span style={{ opacity: 0.65 }}>
            P pause · [ ] speed · , . checkpoint · click the map to travel there
          </span>
        </div>
      )}

      <div className="flash" ref={flashRef} />
    </div>
  )
}

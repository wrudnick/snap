import { useEffect, useMemo, useRef, useState } from 'react'
import { BODIES, COMPACT, finderCrop } from '@/content/cameras'

import { runtime } from '@/game/runtime'
import { useGame } from '@/game/state'
import { GyroOverlay } from '@/dev/GyroOverlay'
import { input, isPortrait, prefersTouch } from '@/input'

/**
 * The sensor readout is opt-in. It covers the corner of the viewfinder, and it
 * is for diagnosing a specific fault rather than for playing with.
 */
const GYRO_DEBUG =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('gyro') === '1'

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
      input.raise = !input.raise
      zoomRef.current?.setAttribute('aria-pressed', String(input.raise))
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
          aria-label="Raise camera"
          aria-pressed="false"
          onPointerDown={toggleZoom}
        >
          <span aria-hidden="true">⌖</span>
        </button>
        {/*
          Throw. Under the same thumb as zoom, because throwing and then
          framing the reaction is one motion and the other hand is on the
          shutter.
        */}
        <button
          type="button"
          className="touch__btn touch__toss"
          aria-label="Throw"
          onPointerDown={press('toss')}
        >
          <span aria-hidden="true">◍</span>
        </button>
        {/*
          Face forward again.

          On a phone the view is wherever the phone is pointing, and after
          turning to follow something you are left holding the phone off to one
          side with the route running away in front of you. Turning back by hand
          means finding forward by eye. This just recaptures which way forward
          is, so you can hold the phone however you are comfortable and start
          from there.
        */}
        <button
          type="button"
          className="touch__btn touch__recentre"
          aria-label="Face forward"
          onPointerDown={press('recentre')}
        >
          <span aria-hidden="true">⌃</span>
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
  const body = BODIES[useGame((s) => s.cameraBody)] ?? COMPACT

  /**
   * The finder follows `runtime.raised`, polled rather than subscribed.
   *
   * It changes on a keypress in the middle of a run, and the one rule this HUD
   * has is that nothing in it re-renders during play — the progress bar is
   * animated through a ref for the same reason. A class on a ref is the whole
   * change; React never hears about it.
   */
  const finderRef = useRef<HTMLDivElement>(null)

  /**
   * The frame, sized from the same function the capture crops by.
   *
   * Not from CSS. `aspect-ratio` with a max on the other axis does not clamp
   * back through the ratio — it produced a 1282x855 frame inside a 1280x720
   * viewport — and more importantly it would be a second implementation of a
   * rectangle that three places have to agree on exactly.
   */
  const frameRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const host = finderRef.current
    const el = frameRef.current
    if (!host || !el) return

    /**
     * Measured from the finder's own box, not from `window`.
     *
     * The first attempt read `window.innerWidth` on mount and got zero, because
     * it ran before layout — which sized the frame to nothing. An element's own
     * rect cannot be asked before it exists, and a `ResizeObserver` fires once
     * on observe, so this is both correct at startup and correct on rotation,
     * without a listener for each way the page can change size.
     */
    const fit = () => {
      const { width, height } = host.getBoundingClientRect()
      if (width <= 0 || height <= 0) return
      const crop = finderCrop(width / height, body)
      el.style.width = `${crop.width * 100}%`
      el.style.height = `${crop.height * 100}%`
    }

    const observer = new ResizeObserver(fit)
    observer.observe(host)
    return () => observer.disconnect()
  }, [body])

  useEffect(() => {
    let frame = 0
    let was: boolean | null = null
    const tick = () => {
      frame = requestAnimationFrame(tick)
      if (runtime.raised === was) return
      was = runtime.raised
      finderRef.current?.classList.toggle('up', was)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

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

      {/*
        The frame, always drawn, masked only when the camera is up.

        A bright-line finder shows a rectangle inside a wider view, and that is
        exactly what this is: held at your side you see the street around the
        frame and the frame is only a guide, and raised the world outside it goes
        dark because you have a finder against your eye. The rectangle is the
        same one the capture crops to and the same one scoring is told about —
        it is the whole point that the player composes against the real frame.

        Driven off a ref rather than React state: it changes on a keypress
        mid-run and nothing else in the HUD may re-render during play.
      */}
      <div className="finder" ref={finderRef} data-finder="brightline">
        <div className="finder__frame" ref={frameRef}>
          <div className="corner tl" />
          <div className="corner tr" />
          <div className="corner bl" />
          <div className="corner br" />
          <div className="reticle" />
        </div>
      </div>

      <div className="section" ref={sectionRef} />
      <div className="paused" ref={pausedRef} />
      <div className="speed" ref={speedRef} />

      <div className="film">
        <div className="count">{filmRemaining}</div>
        <div className="label">shots left</div>
      </div>

      {touch ? <RotatePrompt /> : null}
      {GYRO_DEBUG ? <GyroOverlay /> : null}
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

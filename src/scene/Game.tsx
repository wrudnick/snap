import { AdaptiveDpr, PerformanceMonitor, Preload } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { EffectComposer } from '@react-three/postprocessing'
import { Perf } from 'r3f-perf'
import { useEffect, useState } from 'react'

import { resetRuntime, runtime } from '@/game/runtime'
import { useGame } from '@/game/state'
import { useRouteBundle } from '@/game/useRoute'
import { PointerKeyboardAdapter, TouchAdapter, prefersTouch } from '@/input'
import { CelOutline } from '@/render/CelOutline'

import { Rig } from './Rig'
import { Shutter } from './Shutter'
import { Environment } from './Environment'
import { Subjects } from './Subjects'
import { World } from './World'

/** Toggle for bisecting post-processing problems: ?post=0 disables the chain. */
const POST_ENABLED =
  typeof window === 'undefined' ||
  new URLSearchParams(window.location.search).get('post') !== '0'

/**
 * ?perf=0 hides the dev statistics overlay.
 *
 * Screenshots of this game are how it gets reviewed, and a draw-call readout
 * sitting over the bottom-left corner of every one of them is both a
 * distraction and, at eye level, right where the street is.
 */
const PERF_ENABLED = (() => {
  if (typeof window === 'undefined') return true
  const flag = new URLSearchParams(window.location.search).get('perf')
  if (flag !== null) return flag !== '0'
  /**
   * Off by default on a phone.
   *
   * The r3f-perf overlay is anchored bottom-left and sits directly on top of
   * the touch controls — it swallowed every tap on the shutter, which on a
   * device with no keyboard means the game cannot be played at all. Opt back in
   * with `?perf=1` when profiling on a real device.
   */
  return !prefersTouch()
})()

/**
 * The frame rate the game runs at.
 *
 * Capped rather than uncapped. An uncapped loop on a phone runs as fast as the
 * GPU will go, which on a 120 Hz panel means drawing this scene four times for
 * every one the player can distinguish, and the whole budget goes into heat and
 * battery instead of into what is on screen. A steady 30 also *looks* better
 * than a rate that swings between 45 and 60 — an on-rails camera makes any
 * variation read as stutter, because nothing else in frame is moving to
 * disguise it.
 *
 * Override with `?fps=60` when comparing.
 */
const TARGET_FPS = (() => {
  if (typeof window === 'undefined') return 30
  const flag = Number(new URLSearchParams(window.location.search).get('fps'))
  return Number.isFinite(flag) && flag > 0 ? flag : 30
})()

/**
 * Drives the render loop at a fixed rate.
 *
 * The Canvas is `frameloop="never"`, so nothing draws until `advance` is
 * called — throttling inside `useFrame` would not have worked, because R3F
 * renders after the frame callbacks whatever they do, so the work would have
 * been skipped and the draw would not.
 *
 * Timed off requestAnimationFrame rather than an interval so frames stay
 * aligned to the display's own refresh: at 60 Hz this fires on every second
 * one, at 120 Hz every fourth. A one-millisecond tolerance keeps it from
 * missing its slot and halving to 20.
 */
function FrameLimiter({ fps }: { fps: number }) {
  const advance = useThree((s) => s.advance)

  useEffect(() => {
    let raf = 0
    let last = 0
    const interval = 1000 / fps

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      if (now - last < interval - 1) return
      last = now
      advance(now)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [advance, fps])

  return null
}

/** Binds the input adapter to the canvas element. Swap the adapter for gamepad. */
function InputBinding({ sensitivity }: { sensitivity: number }) {
  const gl = useThree((s) => s.gl)

  useEffect(() => {
    // The seam this layer was built for: game code reads `InputState` and never
    // learns which adapter filled it. The touch adapter needs the route's look
    // sensitivity to convert the gyro's radians into the pixels the rig
    // expects — see TouchAdapter.
    const adapter = prefersTouch()
      ? new TouchAdapter(1 / sensitivity)
      : new PointerKeyboardAdapter()
    adapter.attach(gl.domElement)
    return () => adapter.detach()
  }, [gl, sensitivity])

  return null
}

/** Drives runtime start/stop off the discrete phase changes. */
function RunController({ fov, duration }: { fov: number; duration: number }) {
  const phase = useGame((s) => s.phase)

  useEffect(() => {
    if (phase === 'riding') {
      resetRuntime(fov, duration)
      runtime.running = true
    } else {
      runtime.running = false
    }
  }, [phase, fov, duration])

  return null
}

export function Game() {
  const routeId = useGame((s) => s.routeId)
  const { route, rail, resolved } = useRouteBundle(routeId)

  // Waypoint indices → route progress. Done once, because Catmull-Rom control
  // points don't map linearly onto arc length.

  // Shed resolution rather than framerate when the GPU can't keep up.
  const [degraded, setDegraded] = useState(false)

  return (
    <Canvas
      shadows
      // Nothing draws until FrameLimiter says so.
      frameloop="never" 
      // Retina at 2x is 4x the pixels for barely visible gain. This single line
      // is the largest performance win available.
      dpr={degraded ? 1 : [1, 1.5]}
      gl={{
        powerPreference: 'high-performance',
        antialias: true,
        // Explicitly NOT preserveDrawingBuffer — see game/capture/image.ts.
        preserveDrawingBuffer: false,
      }}
      camera={{ fov: route.fov.default, near: 0.1, far: 1400 }}
    >
      <World sections={resolved.sections}>
        <Environment route={route} rail={rail} sections={resolved.sections} />
        <Subjects route={route} rail={rail} sections={resolved.sections} />
      </World>

      <Rig
        route={route}
        rail={rail}
        sections={resolved.sections}
        checkpoints={resolved.checkpoints}
      />
      <Shutter routeId={route.id} />
      <RunController fov={route.fov.default} duration={route.durationSeconds} />
      <InputBinding sensitivity={route.look.sensitivity} />

      {/* Compile every material up front. Without this, the first frame a new
          material enters view stalls while the shader compiles — which reads to
          the player as a stutter, not as loading. */}
      <Preload all />

      {/* One fullscreen pass for the ink lines. See CelOutline for why this
          isn't an inverted hull.

          multisampling MUST be 0: an MSAA composer target can't also expose a
          readable depth texture in WebGL2, so the outline effect reads a flat
          depth buffer and silently produces no lines at all. Edge detection
          gives hard lines regardless, so MSAA buys little here. */}
      {POST_ENABLED && (
        <EffectComposer multisampling={0} enableNormalPass>
          <CelOutline />
        </EffectComposer>
      )}

      <FrameLimiter fps={TARGET_FPS} />
      {/*
        Bounds moved to bracket the cap. The default range is built for an
        uncapped loop and treats anything under about 50 fps as failing — with a
        30 fps cap that fires immediately and permanently, dropping the
        resolution to 1x on hardware that was never struggling.
      */}
      <PerformanceMonitor
        bounds={() => [TARGET_FPS - 8, TARGET_FPS + 4]}
        onDecline={() => setDegraded(true)}
        onIncline={() => setDegraded(false)}
      />
      <AdaptiveDpr pixelated />

      {import.meta.env.DEV && PERF_ENABLED && <Perf position="bottom-left" />}
    </Canvas>
  )
}

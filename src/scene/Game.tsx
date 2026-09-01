import { AdaptiveDpr, PerformanceMonitor, Preload } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { EffectComposer } from '@react-three/postprocessing'
import { Perf } from 'r3f-perf'
import { useEffect, useState } from 'react'

import { resetRuntime, runtime } from '@/game/runtime'
import { BODIES, COMPACT } from '@/content/cameras'
import { useGame } from '@/game/state'
import { useRouteBundle } from '@/game/useRoute'
import { PointerKeyboardAdapter, TouchAdapter, prefersTouch } from '@/input'
import { CelOutline } from '@/render/CelOutline'

import { Rig } from './Rig'
import { Items } from './Items'
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
  if (typeof window === 'undefined') return false
  /**
   * Opt-in, everywhere. `?perf=1` to profile.
   *
   * It was on by default on anything with a mouse, and it is an overlay that
   * accepts pointer events — so it swallowed every tap on the shutter on a
   * phone, and then swallowed the Sell button on a desk, because it is anchored
   * bottom-left and the buttons that end a run are at the bottom of the screen.
   * A readout that eats the controls is worse than no readout.
   *
   * It also sits over the corner of every screenshot, and screenshots are how
   * this game gets reviewed.
   */
  return new URLSearchParams(window.location.search).get('perf') === '1'
})()

/**
 * An optional cap on the frame rate. Uncapped by default.
 *
 * It used to run pinned at 30, on the argument that an uncapped loop on a phone
 * burns the whole budget on frames nobody can distinguish, and that a steady 30
 * reads better than a rate swinging between 45 and 60 — which is true of a
 * *swinging* rate, and this is an on-rails camera where any variation shows.
 *
 * But 30 is also visibly 30 when you pan, and panning is the entire verb of
 * this game. Capping was buying smoothness the game did not need at the cost of
 * the one motion it is built around. Uncapped, and if the rate turns out to
 * swing on a real phone, `AdaptiveDpr` and the performance monitor below are
 * the honest tools for that — they shed resolution rather than frames.
 *
 * `?fps=30` still pins it, for comparing the two.
 */
const FPS_CAP = (() => {
  if (typeof window === 'undefined') return null
  const flag = Number(new URLSearchParams(window.location.search).get('fps'))
  return Number.isFinite(flag) && flag > 0 ? flag : null
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
function InputBinding() {
  const gl = useThree((s) => s.gl)

  useEffect(() => {
    // The seam this layer was built for: game code reads `InputState` and never
    // learns which adapter filled it.
    const adapter = prefersTouch() ? new TouchAdapter() : new PointerKeyboardAdapter()
    adapter.attach(gl.domElement)
    return () => adapter.detach()
  }, [gl])

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
  // The camera in the player's hands. It decides the frame everything else
  // composes in, captures at and is scored against.
  const body = BODIES[useGame((s) => s.cameraBody)] ?? COMPACT
  const { route, rail, resolved } = useRouteBundle(routeId)

  // Waypoint indices → route progress. Done once, because Catmull-Rom control
  // points don't map linearly onto arc length.

  // Shed resolution rather than framerate when the GPU can't keep up.
  const [degraded, setDegraded] = useState(false)

  return (
    <Canvas
      shadows
      // Uncapped unless `?fps=` asks otherwise, in which case FrameLimiter
      // drives it and nothing draws until it says so.
      frameloop={FPS_CAP ? 'never' : 'always'}
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
        body={body}
        route={route}
        rail={rail}
        sections={resolved.sections}
        checkpoints={resolved.checkpoints}
      />
      <Shutter routeId={route.id} rail={rail} body={body} sections={resolved.sections} />
      <Items />
      <RunController fov={route.fov.default} duration={route.durationSeconds} />
      <InputBinding />

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

      {FPS_CAP !== null && <FrameLimiter fps={FPS_CAP} />}
      {/*
        Bounds bracket whatever rate is being targeted. Left at the library's
        default while uncapped; a capped run needs them moved, because the
        default range is built for an uncapped loop and treats anything under
        about 50 fps as failing — against a 30 fps cap that fires immediately
        and permanently, dropping resolution on hardware that was never
        struggling.
      */}
      <PerformanceMonitor
        bounds={FPS_CAP === null ? undefined : () => [FPS_CAP - 8, FPS_CAP + 4]}
        onDecline={() => setDegraded(true)}
        onIncline={() => setDegraded(false)}
      />
      <AdaptiveDpr pixelated />

      {import.meta.env.DEV && PERF_ENABLED && <Perf position="bottom-left" />}
    </Canvas>
  )
}

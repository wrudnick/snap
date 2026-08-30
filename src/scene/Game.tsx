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

      <PerformanceMonitor onDecline={() => setDegraded(true)} onIncline={() => setDegraded(false)} />
      <AdaptiveDpr pixelated />

      {import.meta.env.DEV && PERF_ENABLED && <Perf position="bottom-left" />}
    </Canvas>
  )
}

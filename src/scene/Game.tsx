import { AdaptiveDpr, PerformanceMonitor, Preload } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { EffectComposer } from '@react-three/postprocessing'
import { Perf } from 'r3f-perf'
import { useEffect, useMemo, useState } from 'react'

import { ROUTES } from '@/content/routes/downtown'
import { Rail } from '@/game/rail'
import { resetRuntime, runtime } from '@/game/runtime'
import { useGame } from '@/game/state'
import { PointerKeyboardAdapter } from '@/input'
import { CelOutline } from '@/render/CelOutline'

import { Rig } from './Rig'
import { Shutter } from './Shutter'
import { Street } from './Street'
import { Subjects } from './Subjects'
import { World } from './World'

/** Toggle for bisecting post-processing problems: ?post=0 disables the chain. */
const POST_ENABLED =
  typeof window === 'undefined' ||
  new URLSearchParams(window.location.search).get('post') !== '0'

/** Binds the input adapter to the canvas element. Swap the adapter for gamepad. */
function InputBinding() {
  const gl = useThree((s) => s.gl)

  useEffect(() => {
    const adapter = new PointerKeyboardAdapter()
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
  const route = ROUTES[routeId] ?? ROUTES.downtown!
  const rail = useMemo(() => new Rail(route), [route])

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
      camera={{ fov: route.fov.default, near: 0.1, far: 400 }}
    >
      <World>
        <Street route={route} />
        <Subjects route={route} rail={rail} />
      </World>

      <Rig route={route} rail={rail} />
      <Shutter routeId={route.id} />
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
        <EffectComposer multisampling={0}>
          <CelOutline />
        </EffectComposer>
      )}

      <PerformanceMonitor onDecline={() => setDegraded(true)} onIncline={() => setDegraded(false)} />
      <AdaptiveDpr pixelated />

      {import.meta.env.DEV && <Perf position="bottom-left" />}
    </Canvas>
  )
}

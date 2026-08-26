import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'

import type { RouteDef } from '@/content/routes/types'
import { bridge } from '@/dev/harness'
import { clamp, type Rail } from '@/game/rail'
import { runtime } from '@/game/runtime'
import { useGame } from '@/game/state'
import { consumeAim, input } from '@/input'

/**
 * The on-rails camera.
 *
 * Travel comes from the spline; the player only supplies yaw/pitch offsets on
 * top of the rail's heading. Because look is expressed as an offset rather than
 * an absolute orientation, the clamp cone travels with the route — you can
 * always look across the street, never backwards down it.
 */
export function Rig({ route, rail }: { route: RouteDef; rail: Rail }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const ended = useRef(false)

  useEffect(() => {
    ended.current = false
  }, [route.id])

  // Hand the camera and scene to the dev harness so tests can aim by world
  // position and inspect what actually got mounted.
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    if (!import.meta.env.DEV) return
    bridge.camera = camera
    bridge.scene = scene
    return () => {
      bridge.camera = null
      bridge.scene = null
    }
  }, [camera, scene])

  useFrame((_, delta) => {
    // Clamped so a backgrounded tab doesn't teleport the camera on return.
    const dt = Math.min(delta, 1 / 30)

    if (runtime.running) {
      runtime.elapsed += dt
      runtime.t = Math.min(1, runtime.elapsed / route.durationSeconds)
    }

    // Look. Inverted so dragging right looks right.
    runtime.yaw = clamp(
      runtime.yaw - input.aimX * route.look.sensitivity,
      -route.look.yawLimit,
      route.look.yawLimit,
    )
    runtime.pitch = clamp(
      runtime.pitch - input.aimY * route.look.sensitivity,
      -route.look.pitchLimit,
      route.look.pitchLimit,
    )
    consumeAim()

    // Zoom, eased rather than snapped — a hard FOV cut reads as a glitch.
    runtime.targetFov = input.zoom ? route.fov.zoomed : route.fov.default
    runtime.fov += (runtime.targetFov - runtime.fov) * Math.min(1, dt * 12)

    rail.positionAt(runtime.t, camera.position)
    runtime.railHeading = rail.headingAt(runtime.t)
    camera.rotation.set(runtime.pitch, runtime.railHeading + runtime.yaw, 0, 'YXZ')

    if (Math.abs(camera.fov - runtime.fov) > 0.01) {
      camera.fov = runtime.fov
      camera.updateProjectionMatrix()
    }

    runtime.segment = rail.segmentAt(runtime.t)

    if (runtime.t >= 1 && runtime.running && !ended.current) {
      ended.current = true
      runtime.running = false
      useGame.getState().endRun()
    }
  })

  return null
}

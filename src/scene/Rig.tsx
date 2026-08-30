import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'

import type { RouteDef } from '@/content/routes/types'
import { bridge } from '@/dev/harness'
import { clamp, type Rail } from '@/game/rail'
import { runtime } from '@/game/runtime'
import {
  sectionAt,
  type ResolvedCheckpoint,
  type ResolvedSection,
} from '@/game/sections'
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
const SPEEDS = [0.5, 1, 2, 4, 8, 16] as const

function stepSpeed(current: number, direction: 1 | -1): number {
  const i = SPEEDS.indexOf(current as (typeof SPEEDS)[number])
  const next = (i === -1 ? 1 : i) + direction
  return SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, next))]!
}

/** Bring an angle difference into −π…π, so a turn past north is not a full circle. */
function wrapPi(angle: number): number {
  let a = angle
  while (a > Math.PI) a -= Math.PI * 2
  while (a < -Math.PI) a += Math.PI * 2
  return a
}

export function Rig({
  route,
  rail,
  sections,
  checkpoints,
}: {
  route: RouteDef
  rail: Rail
  sections: ResolvedSection[]
  checkpoints: ResolvedCheckpoint[]
}) {
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

    // Review controls. Edge-triggered, so consume the flag as we read it.
    if (input.speedUp) {
      input.speedUp = false
      runtime.speed = stepSpeed(runtime.speed, 1)
    }
    if (input.speedDown) {
      input.speedDown = false
      runtime.speed = stepSpeed(runtime.speed, -1)
    }

    const jumpTo = (t: number) => {
      runtime.t = Math.max(0, Math.min(1, t))
      // The rig recomputes t from elapsed each frame, so elapsed has to move too.
      runtime.elapsed = runtime.t * route.durationSeconds
      ended.current = false
    }
    if (input.togglePause) {
      input.togglePause = false
      runtime.paused = !runtime.paused
    }

    // Set by clicking the minimap. Consumed here so the rig stays the only
    // thing that writes route position.
    if (input.seekTo !== null) {
      jumpTo(input.seekTo)
      input.seekTo = null
    }

    if (input.nextCheckpoint) {
      input.nextCheckpoint = false
      const next = checkpoints.find((c) => c.t > runtime.t + 0.004)
      if (next) jumpTo(next.t)
    }
    if (input.prevCheckpoint) {
      input.prevCheckpoint = false
      const previous = [...checkpoints].reverse().find((c) => c.t < runtime.t - 0.004)
      jumpTo(previous ? previous.t : 0)
    }

    if (runtime.running && !runtime.paused) {
      runtime.elapsed += dt * runtime.speed
      runtime.t = Math.min(1, runtime.elapsed / route.durationSeconds)
    }

    runtime.railHeading = rail.headingAt(runtime.t)

    if (input.absoluteYaw !== null && input.absolutePitch !== null) {
      /**
       * The phone's attitude is the camera's attitude.
       *
       * `absoluteYaw` is a world heading, so the offset the cone clamps is the
       * difference between it and the way the route is currently facing —
       * which means holding the phone still keeps the camera pointed at the
       * same place in the world while the route turns underneath, exactly as a
       * camera in your hand behaves. The clamp is what stops you looking behind
       * you; on a corner it will hold at the edge until you turn your body,
       * which is the intended feel rather than a limitation to work around.
       *
       * Pitch needs no such correction: the rig applies it as the camera's own
       * pitch, already in world terms.
       */
      runtime.yaw = clamp(
        wrapPi(input.absoluteYaw - runtime.railHeading),
        -route.look.yawLimit,
        route.look.yawLimit,
      )
      runtime.pitch = clamp(
        input.absolutePitch,
        -route.look.pitchLimit,
        route.look.pitchLimit,
      )
    } else {
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
    }
    consumeAim()

    // Zoom, eased rather than snapped — a hard FOV cut reads as a glitch.
    runtime.targetFov = input.zoom ? route.fov.zoomed : route.fov.default
    runtime.fov += (runtime.targetFov - runtime.fov) * Math.min(1, dt * 12)

    rail.positionAt(runtime.t, camera.position)
    camera.rotation.set(runtime.pitch, runtime.railHeading + runtime.yaw, 0, 'YXZ')

    if (Math.abs(camera.fov - runtime.fov) > 0.01) {
      camera.fov = runtime.fov
      camera.updateProjectionMatrix()
    }

    runtime.segment = rail.segmentAt(runtime.t)
    runtime.sectionTitle = sectionAt(sections, runtime.t).title

    if (runtime.t >= 1 && runtime.running && !ended.current) {
      ended.current = true
      runtime.running = false
      useGame.getState().endRun()
    }
  })

  return null
}

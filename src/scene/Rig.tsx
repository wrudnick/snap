import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'

import { lookOffset } from '@/lib/deviceOrientation'
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

    /**
     * Recentre, handled before the branch so it works with or without a sensor.
     *
     * With a gyro it recaptures which way "forward" is; without one there is no
     * reference to capture and the offset is simply zeroed. Left inside the
     * gyro branch it would never clear on a desktop, and would sit latched.
     */
    if (input.recentre) {
      input.recentre = false
      runtime.yawReference = input.absoluteYaw
      if (input.absoluteYaw === null) runtime.yaw = 0
    }
    if (runtime.yawReference === null && input.absoluteYaw !== null) {
      runtime.yawReference = input.absoluteYaw
    }

    if (input.absoluteYaw !== null && input.absolutePitch !== null) {
      /**
       * How far the phone has turned from forward — not where it points.
       *
       * This used to feed the device's world bearing straight in and clamp the
       * difference against the route's heading, so holding the phone still kept
       * the camera locked to a compass direction while the road turned away
       * underneath it. Rounding a corner, the view slid off the street and
       * ended up staring at a wall, and the only way back was to physically
       * turn your whole body through the corner as you took it. The comment
       * here argued that was correct because it is what a camera in your hand
       * does. A camera in your hand is not bolted to a rail that turns without
       * you, and the two together are not a camera, they are a fight.
       *
       * So the reading is relative: the difference between the current bearing
       * and the bearing that was captured as "forward". Hold the phone still
       * and the view stays pointed down the route through every turn; turn
       * yourself ninety degrees and you are looking ninety degrees off the
       * route, wherever the route happens to be pointing. The recentre button
       * simply recaptures the reference.
       */
      /**
       * Unclamped, and wrapped instead.
       *
       * A cone made sense when yaw was a world bearing, because the route's own
       * turning ate into it and something had to bound the result. Now that the
       * reading is relative to forward, the cone is nothing but a wall you hit
       * halfway through turning round — and on a phone that wall is worse than
       * on a mouse, because your body keeps going after the picture stops.
       */
      runtime.yaw = lookOffset(input.absoluteYaw, runtime.yawReference ?? input.absoluteYaw)
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

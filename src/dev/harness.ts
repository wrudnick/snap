import * as THREE from 'three'

import { activeSubjects } from '@/game/capture/registry'
import { groundHeightAt } from '@/content/models/groundHeight'
import { activeItems } from '@/game/items'
import { runtime } from '@/game/runtime'
import { useGame } from '@/game/state'
import { input } from '@/input'

/**
 * Test harness.
 *
 * Exposes the input state, the runtime, and the store on `window.__snap` so
 * end-to-end tests can drive the game deterministically — aim at a known
 * subject, fire the shutter, assert on the resulting score — without depending
 * on the timing of real pointer input.
 *
 * Dev builds only; tree-shaken out of production.
 */

/** Side channel for the live camera and scene, populated by the Rig. */
export const bridge: { camera: THREE.Camera | null; scene: THREE.Scene | null } = {
  camera: null,
  scene: null,
}

export interface HarnessSubject {
  id: string
  species: string
  position: [number, number, number]
}

export interface SnapHarness {
  input: typeof input
  runtime: typeof runtime
  store: typeof useGame
  /** Fire the shutter on the next frame. */
  shoot: () => void
  /** Jump to a point along the route, 0..1. */
  seek: (t: number) => void
  /** Set look angles directly, in radians, relative to the rail heading. */
  aim: (yaw: number, pitch: number) => void
  /** Point the camera at a world position. False if the camera isn't ready. */
  lookAt: (x: number, y: number, z: number) => boolean
  /** Every subject currently mounted, with world positions. */
  subjects: () => HarnessSubject[]
  /** Thrown items, in flight and at rest. */
  items: () => Array<{
    id: string
    at: [number, number, number]
    velocity: [number, number, number]
    ground: number
    restingFor: number | null
  }>
  /** Current camera world position, or null before the first frame. */
  cameraPosition: () => [number, number, number] | null
  /** End the route immediately. */
  finish: () => void
  /** Every mesh in the scene, with instance counts — for diagnosing empty draws. */
  sceneStats: () => Array<{ type: string; name: string; count: number; visible: boolean }>
}

/** Wrap an angle into [-π, π] so yaw offsets don't accumulate past the clamp. */
function normalizeAngle(a: number): number {
  let x = a
  while (x > Math.PI) x -= Math.PI * 2
  while (x < -Math.PI) x += Math.PI * 2
  return x
}

export function installHarness(): void {
  if (!import.meta.env.DEV) return

  const scratch = new THREE.Vector3()

  const harness: SnapHarness = {
    input,
    runtime,
    store: useGame,

    shoot: () => {
      input.shutter = true
    },

    seek: (t: number) => {
      runtime.t = Math.max(0, Math.min(1, t))
      // The rig recomputes `t` from `elapsed` every frame, so seeking has to
      // move elapsed too or the jump is undone on the very next tick.
      runtime.elapsed = runtime.t * runtime.duration
    },

    aim: (yaw: number, pitch: number) => {
      runtime.yaw = yaw
      runtime.pitch = pitch
    },

    lookAt: (x: number, y: number, z: number) => {
      const camera = bridge.camera
      if (!camera) return false

      const cam = camera.position
      const dx = x - cam.x
      const dy = y - cam.y
      const dz = z - cam.z

      // Absolute heading to the target, in three's -Z-forward convention.
      const heading = Math.atan2(-dx, -dz)

      // The rig applies yaw as an offset from the rail heading, so subtract it.
      runtime.yaw = normalizeAngle(heading - runtime.railHeading)
      runtime.pitch = Math.atan2(dy, Math.hypot(dx, dz))
      return true
    },

    items: () =>
      activeItems().map((item) => ({
        id: item.id,
        at: [item.position.x, item.position.y, item.position.z] as [number, number, number],
        velocity: [item.velocity.x, item.velocity.y, item.velocity.z] as [number, number, number],
        ground: groundHeightAt(item.position.x, item.position.z, item.position.y),
        restingFor: item.restingFor,
      })),

    subjects: () =>
      activeSubjects().map((s) => {
        s.object.getWorldPosition(scratch)
        return {
          id: s.id,
          species: s.species,
          position: [scratch.x, scratch.y, scratch.z],
        }
      }),

    cameraPosition: () => {
      const camera = bridge.camera
      if (!camera) return null
      camera.getWorldPosition(scratch)
      return [scratch.x, scratch.y, scratch.z]
    },

    finish: () => {
      runtime.t = 1
      runtime.elapsed = runtime.duration
    },

    sceneStats: () => {
      const out: Array<{ type: string; name: string; count: number; visible: boolean }> = []
      bridge.scene?.traverse((o) => {
        const mesh = o as THREE.Mesh & { count?: number; isInstancedMesh?: boolean }
        if (!(mesh as THREE.Mesh).isMesh) return
        out.push({
          type: mesh.isInstancedMesh ? 'InstancedMesh' : 'Mesh',
          name: mesh.name || '(unnamed)',
          count: mesh.count ?? 1,
          visible: mesh.visible,
        })
      })
      return out
    },
  }

  ;(window as unknown as { __snap: SnapHarness }).__snap = harness
}

/**
 * Per-frame mutable state.
 *
 * Deliberately NOT a React store. These values change every frame, and routing
 * them through React (or through zustand's reactive path) would re-render the
 * tree at 60fps. The game loop reads and writes this object directly; anything
 * the UI needs to *see* goes into the zustand store as a discrete event instead.
 *
 * See the "React discipline rules" in the plan.
 */
export interface Runtime {
  /** Route progress, 0..1. */
  t: number
  /** Seconds since the run started. */
  elapsed: number
  /** Player look offsets, radians, relative to the rail's heading. */
  yaw: number
  pitch: number
  /** Current and target field of view, for smooth zoom. */
  fov: number
  targetFov: number
  /** Rail segment the camera is currently in. Drives content gating. */
  segment: number
  /** False while paused, in menus, or after the route completes. */
  running: boolean
  /** Length of the active route in seconds. Needed to convert `t` to elapsed. */
  duration: number
  /** The rail's own heading this frame, before the player's yaw offset. */
  railHeading: number
}

export const runtime: Runtime = {
  t: 0,
  elapsed: 0,
  yaw: 0,
  pitch: 0,
  fov: 60,
  targetFov: 60,
  segment: 0,
  running: false,
  duration: 1,
  railHeading: 0,
}

export function resetRuntime(fov: number, duration: number): void {
  runtime.t = 0
  runtime.elapsed = 0
  runtime.yaw = 0
  runtime.pitch = 0
  runtime.fov = fov
  runtime.targetFov = fov
  runtime.segment = 0
  runtime.running = false
  runtime.duration = duration
}

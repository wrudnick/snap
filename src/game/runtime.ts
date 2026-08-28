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
  /** False in menus and after the route completes. */
  running: boolean
  /**
   * Player-held pause on travel.
   *
   * Kept separate from `running` because they mean different things: `running`
   * is whether a run is underway, `paused` is whether the camera is moving.
   * Folding them together would make un-pausing indistinguishable from starting.
   */
  paused: boolean
  /** Length of the active route in seconds. Needed to convert `t` to elapsed. */
  duration: number
  /**
   * Travel speed multiplier.
   *
   * A four-minute route is a long way to ride when you only want to look at the
   * kitchen. Scrubbing forward is a review tool, not a game mechanic.
   */
  speed: number
  /** The rail's own heading this frame, before the player's yaw offset. */
  railHeading: number
  /** Title of the section the camera is in. Shown in the HUD. */
  sectionTitle: string
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
  paused: false,
  duration: 1,
  railHeading: 0,
  speed: 1,
  sectionTitle: '',
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
  runtime.paused = false
  runtime.duration = duration
  // Speed deliberately survives a reset — it is a review preference, not run state.
}

import type { LandmarkDef } from '@/content/models/landmarks'
/**
 * Route and subject placement data.
 *
 * Everything here is plain data with no three.js imports, so routes can be
 * authored, diffed, and tested as content rather than code. Adding a route means
 * adding a file in this directory — nothing in `src/game/` changes.
 */

/**
 * Where along the route a subject stands.
 *
 * `section` + `u` (0 at the section's start, 1 at its end) survives the route
 * being refitted. Raw `t` is kept for anything that genuinely belongs to the
 * route as a whole rather than to one of its places.
 */
export type SubjectAnchor =
  | { t: number; offset: number; y?: number }
  | { section: string; u: number; offset: number; y?: number }

export interface SubjectPlacement {
  /** Unique within the route. */
  id: string
  /** Key into the subject registry (`src/content/subjects/`). */
  species: string
  /**
   * Route-relative placement. `offset` is metres left of travel and `y` is
   * height above grade in both forms; they differ in how far along they sit.
   *
   * Prefer the `section` form. Anchoring to the whole route's `t` was already
   * an improvement on absolute coordinates — those silently rot whenever the
   * path moves — but it rots too, one level up: restoring the second block of
   * Michigan Avenue lengthened that section and shortened the one after it, and
   * every `t` in the file pointed at a different street than its comment
   * claimed. A subject belongs to a *place*, so it should say which place and
   * how far through it.
   */
  at?: SubjectAnchor
  /** Absolute world position. Only for things genuinely fixed in the world. */
  position?: [number, number, number]
  /** Initial facing, radians about Y. */
  rotationY?: number
  /**
   * Optional patrol path in world space. The subject loops along it; its facing
   * follows the direction of travel, which is what makes "direction" scoring
   * something the player has to time rather than just find.
   */
  path?: Array<[number, number, number]>
  /** Seconds for one full circuit of `path`. Ignored when there is no path. */
  patrolSeconds?: number
  /** Per-subject animation seed, so each one poses on its own rhythm. */
  seed: number
}

/**
 * What kind of place a stretch of route is.
 *
 * Drives both content generation (what gets built alongside the path) and
 * lighting. Adding a kind means teaching the generator one new case — it does
 * not mean touching the rail, the capture pipeline, or scoring.
 */
export type SectionKind =
  | 'beach'
  | 'tunnel'
  | 'avenue'
  | 'boutique'
  | 'dining'
  | 'park'
  | 'alley'
  | 'interior'

export interface LightingProfile {
  /** Background and fog colour. */
  sky: number
  fogNear: number
  fogFar: number
  key: number
  keyIntensity: number
  skyFill: number
  groundFill: number
  fillIntensity: number
  /** Shadowed surfaces drift toward this. */
  shadowTint: number
  shadowTintStrength: number
  /** Interiors and tunnels have no sun; shadow maps are wasted there. */
  castShadows: boolean
}

export interface RouteSection {
  id: string
  kind: SectionKind
  /** Human-readable, shown at the checkpoint. */
  title: string
  /** Inclusive waypoint index range this section spans. */
  waypoints: [number, number]
  lighting: LightingProfile
}

export interface Checkpoint {
  id: string
  title: string
  /** Waypoint index the checkpoint sits on. */
  waypoint: number
}

/**
 * A street the player never walks but can see down.
 *
 * When the route turns off Michigan Avenue the canyon shouldn't stop with it —
 * you should still see the grid running south toward the river. Corridors
 * generate building rows along a polyline with no ground and no rail
 * relationship, purely so the city has depth beyond the path.
 */
export interface Corridor {
  id: string
  /** Polyline in world space, [x, z] pairs. */
  path: Array<[number, number]>
  /** Metres of frontage per building. */
  frontage: number
  /** Metres from centreline to the building line. */
  setback: number
  depth: [number, number]
  height: [number, number]
  gapChance: number
  palette: number[]
}

export interface RouteDef {
  id: string
  displayName: string
  /** Seconds to travel the full spline. */
  durationSeconds: number
  /** Spline control points, already at eye height. */
  waypoints: Array<[number, number, number]>
  /** Ordered, contiguous. Every waypoint should fall inside exactly one. */
  sections: RouteSection[]
  /** Resume points; also how the player replays a stretch. */
  checkpoints: Checkpoint[]
  look: {
    /** Max yaw offset from the rail heading, radians. */
    yawLimit: number
    /** Max pitch, radians. */
    pitchLimit: number
    /** Radians of look per pixel of pointer movement. */
    sensitivity: number
  }
  fov: {
    default: number
    zoomed: number
  }
  /** How many chunks the route is divided into for content gating. */
  segmentCount: number
  /** Segments either side of the camera that stay mounted. Default fallback. */
  activeWindow: number
  /**
   * Per-category gating windows, in segments.
   *
   * Buildings are drawn as one InstancedMesh, so mounting two hundred of them
   * costs exactly one draw call — gating them tightly buys nothing and cuts the
   * view to a fraction of a block. Small props are the ones worth gating: they
   * are numerous, close to the camera, and invisible at distance anyway.
   */
  activeWindows?: {
    buildings: number
    furniture: number
    clutter: number
    subjects: number
  }
  /**
   * Streets visible from the route but never walked. Never gated by segment —
   * the whole point is seeing them from a long way off, and they are instanced
   * into a single draw call.
   */
  corridors?: Corridor[]
  /** Hand-authored buildings, placed by real address. */
  landmarks?: LandmarkDef[]
  /** Seed for the procedural street blockout. */
  seed: number
  /** Shots available per run. */
  film: number
  subjects: SubjectPlacement[]
}

/**
 * Route and subject placement data.
 *
 * Everything here is plain data with no three.js imports, so routes can be
 * authored, diffed, and tested as content rather than code. Adding a route means
 * adding a file in this directory — nothing in `src/game/` changes.
 */

export interface SubjectPlacement {
  /** Unique within the route. */
  id: string
  /** Key into the subject registry (`src/content/subjects/`). */
  species: string
  position: [number, number, number]
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
  /** Segments either side of the camera that stay mounted. */
  activeWindow: number
  /** Seed for the procedural street blockout. */
  seed: number
  /** Shots available per run. */
  film: number
  subjects: SubjectPlacement[]
}

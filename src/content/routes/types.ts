/**
 * Route waypoints are authored at eye height; the ground sits this far below.
 *
 * Shared, because more than one thing has to agree with it: subjects stand on
 * it, props stand on it, and the underpass floor is derived from it. When it
 * was a literal repeated in three files, the underpass ramp and the route that
 * walks down it disagreed by up to 30 cm and the camera spent the descent
 * inside the tarmac.
 */
export const EYE_HEIGHT = 1.7

/**
 * Catmull-Rom tension for every route curve.
 *
 * Shared so the kerb correction can evaluate the exact curve the Rail will
 * build. Low tension keeps street corners crisp: at the default 0.5 the spline
 * sweeps a 90-degree turn like a racetrack, which reads nothing like walking a
 * city grid.
 */
export const CURVE_TENSION = 0.16

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
  /**
   * The lane a driving subject follows, derived from the street map at load.
   *
   * Never authored. Driving used to advance the car along its own facing in a
   * straight line, which is correct only on a straight street — and Michigan
   * bends, Lake Shore Drive bends hard, and the route turns two corners. A car
   * left the road within a few seconds and drove across the pavement and
   * through a building.
   */
  drivePath?: Array<[number, number]>
  /**
   * Metres per second along the way this subject faces, if it drives.
   *
   * Traffic was parked. Vehicles have a `cruise` clip and it spins the wheels
   * and bobs the body without ever moving the car an inch — which reads as a
   * street full of idling props, and worse, as a mistake, because the wheels
   * are visibly turning.
   *
   * Driving is placement, not animation: the clip says what the car is doing
   * and this says where it is. Direction comes from the subject's own facing,
   * so a car pointed back down the street drives back down the street with no
   * second thing to keep in step.
   */
  driveSpeed?: number
  /**
   * How far it travels before looping back, in metres.
   *
   * A car has to restart somewhere. Long enough that the wrap happens well
   * outside the segment window that had it on screen — a car that pops back
   * fifteen metres in front of you is worse than one that never moved.
   */
  driveSpan?: number
  /**
   * Initial facing, radians about Y.
   *
   * A world angle by default, which is right for a person who is facing a
   * particular way regardless of the street. With `alignToRoute` it becomes an
   * offset from the route's heading instead — 0 is with the traffic, PI is
   * against it — which is the only sane way to place a vehicle: a world angle
   * that points down Michigan points sideways across Rush, and every car on the
   * diagonal was parked broadside.
   */
  rotationY?: number
  /** Treat `rotationY` as an offset from the route heading rather than a world angle. */
  alignToRoute?: boolean
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
  /**
   * How good this light is to photograph a building in, 0..1.
   *
   * Authored rather than derived from the colours above, because it is a
   * judgement and not a measurement: golden hour and blue hour are worth more
   * than midday to a postcard, and a tunnel is worth nothing, and none of that
   * falls out of a key intensity. Defaults to a middling 0.5.
   */
  photographic?: number
  /**
   * How much of this section the fade in from the previous one takes, 0..1.
   *
   * Defaults to a third. Long for the sunset over Rush Street, which has to
   * happen across the block before it or it reads as a light switch.
   */
  blendIn?: number
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
  /** Seed for the procedural street blockout. */
  seed: number
  /** Shots available per run. */
  film: number
  subjects: SubjectPlacement[]
}

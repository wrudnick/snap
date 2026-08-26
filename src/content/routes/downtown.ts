import type { RouteDef } from './types'

/**
 * Downtown — the first route.
 *
 * A slow ride down a city street. The spline meanders slightly so the rail
 * heading changes, which keeps the player working to hold a subject in frame
 * rather than parking the camera in one direction for 90 seconds.
 *
 * Placement principles worth preserving when authoring more routes:
 *  - Put a cluster of one species somewhere, so the same-species bonus is
 *    reachable by a player who notices it.
 *  - Put the rare subject somewhere easy to ride straight past.
 *  - Mix static and patrolling subjects, so `direction` is sometimes a matter of
 *    timing rather than just aiming.
 */
export const DOWNTOWN: RouteDef = {
  id: 'downtown',
  displayName: 'Downtown',
  durationSeconds: 95,

  // Eye height baked into the waypoints — roughly a slow open-top vehicle.
  waypoints: [
    [0, 1.7, 14],
    [0, 1.7, -14],
    [2.4, 1.7, -44],
    [3.2, 1.7, -74],
    [0.8, 1.7, -104],
    [-2.2, 1.7, -134],
    [-2.4, 1.7, -166],
    [0, 1.7, -196],
    [0.6, 1.7, -222],
  ],

  look: {
    // Just past 90° each way: you can look across the street but never backwards,
    // so the route always has a "front".
    yawLimit: 1.75,
    pitchLimit: 0.85,
    sensitivity: 0.0022,
  },

  fov: { default: 62, zoomed: 26 },

  // 12 segments of ~20 units, 2 either side active — about 100 units of street
  // mounted at a time. Kept just inside the fog far plane so content unmounts
  // where it's already invisible rather than popping out in view.
  segmentCount: 12,
  activeWindow: 2,
  seed: 20260826,
  film: 24,

  subjects: [
    // — Opening stretch: easy pigeons to teach the loop —
    { id: 'pig-1', species: 'pigeon', position: [6.6, 0.15, -6], rotationY: -1.9, seed: 11 },
    { id: 'pig-2', species: 'pigeon', position: [7.4, 0.15, -9], rotationY: -2.4, seed: 12 },

    { id: 'taxi-1', species: 'taxi', position: [-4.2, 0, -22], rotationY: 0, seed: 13 },

    // — A dog on a patrol path: direction has to be timed —
    {
      id: 'dog-1',
      species: 'dog',
      position: [6.2, 0, -38],
      seed: 21,
      path: [
        [6.2, 0, -34],
        [7.6, 0, -42],
        [6.0, 0, -50],
        [5.4, 0, -42],
      ],
      patrolSeconds: 26,
    },

    // — The flock. Same-species bonus lives here —
    { id: 'pig-3', species: 'pigeon', position: [-6.4, 0.15, -58], rotationY: 1.4, seed: 31 },
    { id: 'pig-4', species: 'pigeon', position: [-7.2, 0.15, -60.5], rotationY: 1.9, seed: 32 },
    { id: 'pig-5', species: 'pigeon', position: [-6.0, 0.15, -62], rotationY: 1.1, seed: 33 },
    { id: 'pig-6', species: 'pigeon', position: [-7.6, 0.15, -63.5], rotationY: 2.2, seed: 34 },

    {
      id: 'taxi-2',
      species: 'taxi',
      position: [-4.0, 0, -78],
      seed: 41,
      path: [
        [-4.0, 0, -64],
        [-4.0, 0, -96],
      ],
      patrolSeconds: 34,
    },

    // — The cat. Rare, tucked up a side alley, easy to ride straight past —
    { id: 'cat-1', species: 'cat', position: [9.4, 0, -96], rotationY: -1.5, seed: 51 },

    { id: 'pig-7', species: 'pigeon', position: [-6.8, 0.15, -112], rotationY: 1.6, seed: 61 },
    { id: 'taxi-3', species: 'taxi', position: [4.4, 0, -120], rotationY: Math.PI, seed: 62 },

    {
      id: 'dog-2',
      species: 'dog',
      position: [-6.6, 0, -142],
      seed: 71,
      path: [
        [-6.6, 0, -136],
        [-8.0, 0, -148],
        [-6.2, 0, -156],
      ],
      patrolSeconds: 30,
    },

    { id: 'pig-8', species: 'pigeon', position: [6.4, 0.15, -158], rotationY: -1.3, seed: 81 },
    { id: 'pig-9', species: 'pigeon', position: [7.0, 0.15, -161], rotationY: -1.7, seed: 82 },

    // — Second cat, on the far side, as a late reward —
    { id: 'cat-2', species: 'cat', position: [-9.0, 0, -180], rotationY: 1.5, seed: 91 },

    {
      id: 'dog-3',
      species: 'dog',
      position: [5.8, 0, -196],
      seed: 92,
      path: [
        [5.8, 0, -190],
        [7.2, 0, -204],
        [5.2, 0, -212],
      ],
      patrolSeconds: 24,
    },

    { id: 'pig-10', species: 'pigeon', position: [-6.2, 0.15, -206], rotationY: 1.2, seed: 93 },
    { id: 'taxi-4', species: 'taxi', position: [-4.2, 0, -214], rotationY: 0, seed: 94 },
  ],
}

export const ROUTES: Record<string, RouteDef> = {
  downtown: DOWNTOWN,
}

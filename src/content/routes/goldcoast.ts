import {
  ALLEY,
  AVENUE_DAWN,
  BEACH_DAWN,
  BOUTIQUE_DAWN,
  DINING_DAWN,
  INTERIOR,
  PARK_DAWN,
  TUNNEL,
} from './lighting'
import type { RouteDef } from './types'

/**
 * Gold Coast — Oak Street Beach to the Viagra Triangle.
 *
 * COORDINATE FRAME
 *   Origin sits at Michigan Avenue & Oak Street, the mouth of the pedestrian
 *   underpass. +X is east, −Z is north, +Y is up. Chicago's grid runs 800
 *   address units to the mile, so 1 address unit ≈ 2.01 m; positions below are
 *   metres derived from real addresses rather than invented.
 *
 * THE WALK
 *   Start on the sand at Oak Street Beach, duck through the 1934 WPA underpass
 *   beneath DuSable Lake Shore Drive, surface at the top of the Magnificent Mile,
 *   cross west onto Oak Street's tree-lined luxury block, turn north up Rush
 *   through the outdoor dining strip, round Mariano Park where Rush and State
 *   converge, then in off Bellevue through a service alley, through a kitchen,
 *   and out to the far end of the bar.
 *
 *   Tight → open → tight again, ending on a barstool having started on a
 *   shoreline. That shape is the point.
 *
 * SCALE
 *   True proportions, not compressed. The building manifest decides the length,
 *   so this comes out around 540 m — roughly four minutes at a stroll. That's
 *   long for one roll of film, which is what the checkpoints are for.
 */
export const GOLD_COAST: RouteDef = {
  id: 'goldcoast',
  displayName: 'Gold Coast',
  durationSeconds: 235,

  // Eye height 1.7 outdoors; the tunnel dips below grade and comes back up.
  waypoints: [
    // — Oak Street Beach, walking west off the sand —
    [215, 1.7, 56], //  0  water's edge
    [192, 1.7, 39], //  1
    [164, 1.7, 21], //  2  Lakefront Trail
    [141, 1.7, 8], //  3  underpass ramp

    // — Under Lake Shore Drive —
    [126, 0.6, 2], //  4  ramp down
    [112, -1.0, 0], //  5  tunnel mouth
    [86, -1.1, 0], //  6
    [58, -1.1, 0], //  7
    [40, -0.4, 0], //  8  ramp up

    // — Michigan & Oak, top of the Magnificent Mile —
    [22, 1.7, 0], //  9  surface, NE corner
    [8, 1.7, 5], // 10  cross south
    [-3, 1.7, 2], // 11  cross west onto Oak

    // — Oak Street, Michigan (100E) west to Rush (~20E) ≈ 161 m —
    [-42, 1.7, 0], // 12
    [-86, 1.7, -1], // 13
    [-126, 1.7, -2], // 14
    [-158, 1.7, -3], // 15  Rush & Oak

    // — Rush Street north, Oak (1000N) to Bellevue (1030N) ≈ 63 m,
    //   drifting west as Rush angles toward State —
    [-166, 1.7, -25], // 16  Taverne on Rush
    [-174, 1.7, -46], // 17  Hugo's / Gooby's
    [-181, 1.7, -62], // 18  Bellevue

    // — The Triangle: Rush and State converging on Mariano Park —
    [-192, 1.7, -71], // 19  Mariano Park pavilion
    [-181, 1.7, -79], // 20  round the park onto Bellevue

    // — East along Bellevue (Sinatra Way) into the service alley —
    [-168, 1.7, -73], // 21
    [-157, 1.7, -68], // 22  alley mouth

    // — Alley, kitchen, bar —
    [-150, 1.7, -61], // 23  alley
    [-146, 1.7, -54], // 24  service door
    [-144, 1.7, -47], // 25  through the kitchen
    [-142, 1.7, -40], // 26  dining room
    [-141, 1.7, -34], // 27  end of the bar
  ],

  sections: [
    {
      id: 'beach',
      kind: 'beach',
      title: 'Oak Street Beach',
      waypoints: [0, 3],
      lighting: BEACH_DAWN,
    },
    {
      id: 'underpass',
      kind: 'tunnel',
      title: 'The Underpass',
      waypoints: [4, 8],
      lighting: TUNNEL,
    },
    {
      id: 'michigan',
      kind: 'avenue',
      title: 'Michigan & Oak',
      waypoints: [9, 11],
      lighting: AVENUE_DAWN,
    },
    {
      id: 'oak',
      kind: 'boutique',
      title: 'Oak Street',
      waypoints: [12, 15],
      lighting: BOUTIQUE_DAWN,
    },
    {
      id: 'rush',
      kind: 'dining',
      title: 'Rush Street',
      waypoints: [16, 18],
      lighting: DINING_DAWN,
    },
    {
      id: 'triangle',
      kind: 'park',
      title: 'The Triangle',
      waypoints: [19, 20],
      lighting: PARK_DAWN,
    },
    {
      id: 'alley',
      kind: 'alley',
      title: 'The Alley',
      waypoints: [21, 23],
      lighting: ALLEY,
    },
    {
      id: 'inside',
      kind: 'interior',
      title: 'Through the Kitchen',
      waypoints: [24, 27],
      lighting: INTERIOR,
    },
  ],

  // One per section boundary. Resume points for the player, and the reason a
  // four-minute route is testable without riding it from the sand every time.
  checkpoints: [
    { id: 'cp-beach', title: 'Oak Street Beach', waypoint: 0 },
    { id: 'cp-tunnel', title: 'The Underpass', waypoint: 4 },
    { id: 'cp-michigan', title: 'Michigan & Oak', waypoint: 9 },
    { id: 'cp-oak', title: 'Oak Street', waypoint: 12 },
    { id: 'cp-rush', title: 'Rush Street', waypoint: 16 },
    { id: 'cp-triangle', title: 'The Triangle', waypoint: 19 },
    { id: 'cp-alley', title: 'The Alley', waypoint: 21 },
    { id: 'cp-inside', title: 'Through the Kitchen', waypoint: 24 },
  ],

  look: {
    yawLimit: 1.75,
    pitchLimit: 0.85,
    sensitivity: 0.0022,
  },

  fov: { default: 62, zoomed: 26 },

  // ~22 m per segment over 540 m, two either side active.
  segmentCount: 24,
  activeWindow: 2,
  seed: 20260826,
  // A longer route needs more film; 24 shots over four minutes is starvation.
  film: 40,

  subjects: [
    // — Beach: gulls and early swimmers —
    { id: 'gull-1', species: 'pigeon', position: [196, 0.2, 30], rotationY: 2.2, seed: 101 },
    { id: 'gull-2', species: 'pigeon', position: [188, 0.2, 26], rotationY: 1.8, seed: 102 },
    { id: 'dog-beach', species: 'dog', position: [172, 0, 22], seed: 103,
      path: [[176, 0, 28], [166, 0, 16], [178, 0, 14]], patrolSeconds: 22 },

    // — Tunnel: rats and roosting pigeons —
    { id: 'pig-tunnel', species: 'pigeon', position: [96, -0.9, 2.4], rotationY: -1.6, seed: 111 },
    { id: 'cat-tunnel', species: 'cat', position: [64, -1.0, -2.6], rotationY: 1.4, seed: 112 },

    // — Michigan & Oak: taxis and tourists —
    { id: 'taxi-mich-1', species: 'taxi', position: [12, 0, -18], rotationY: 0, seed: 121 },
    { id: 'taxi-mich-2', species: 'taxi', position: [4, 0, 22], rotationY: Math.PI, seed: 122 },
    { id: 'pig-mich-1', species: 'pigeon', position: [16, 0.15, 8], rotationY: -2.1, seed: 123 },
    { id: 'pig-mich-2', species: 'pigeon', position: [19, 0.15, 11], rotationY: -1.4, seed: 124 },

    // — Oak Street: the eccentrics and their small dogs —
    { id: 'dog-oak-1', species: 'dog', position: [-58, 0, -8], seed: 131,
      path: [[-50, 0, -8], [-72, 0, -9], [-60, 0, -6]], patrolSeconds: 28 },
    { id: 'cat-oak', species: 'cat', position: [-104, 0, 7], rotationY: -1.5, seed: 132 },
    { id: 'pig-oak-1', species: 'pigeon', position: [-132, 0.15, -9], rotationY: 1.2, seed: 133 },
    { id: 'pig-oak-2', species: 'pigeon', position: [-136, 0.15, -6], rotationY: 1.9, seed: 134 },
    { id: 'pig-oak-3', species: 'pigeon', position: [-129, 0.15, -5], rotationY: 0.7, seed: 135 },
    { id: 'taxi-oak', species: 'taxi', position: [-96, 0, 8], rotationY: Math.PI / 2, seed: 136 },

    // — Rush Street: the patios —
    { id: 'dog-rush', species: 'dog', position: [-160, 0, -34], rotationY: 2.6, seed: 141 },
    { id: 'pig-rush-1', species: 'pigeon', position: [-172, 0.15, -30], rotationY: 0.4, seed: 142 },
    { id: 'pig-rush-2', species: 'pigeon', position: [-169, 0.15, -33], rotationY: 1.1, seed: 143 },
    { id: 'taxi-rush', species: 'taxi', position: [-182, 0, -50], rotationY: 0.35, seed: 144 },
    { id: 'cat-rush', species: 'cat', position: [-186, 0, -40], rotationY: -0.9, seed: 145 },

    // — The Triangle: Mariano Park —
    { id: 'pig-tri-1', species: 'pigeon', position: [-190, 0.15, -66], rotationY: -0.6, seed: 151 },
    { id: 'pig-tri-2', species: 'pigeon', position: [-194, 0.15, -69], rotationY: 0.2, seed: 152 },
    { id: 'pig-tri-3', species: 'pigeon', position: [-188, 0.15, -73], rotationY: 1.5, seed: 153 },
    { id: 'pig-tri-4', species: 'pigeon', position: [-196, 0.15, -74], rotationY: 2.4, seed: 154 },
    { id: 'dog-tri', species: 'dog', position: [-184, 0, -76], seed: 155,
      path: [[-180, 0, -74], [-190, 0, -80], [-186, 0, -70]], patrolSeconds: 26 },

    // — Alley: the rare one, tucked behind the bins —
    { id: 'cat-alley', species: 'cat', position: [-152, 0, -66], rotationY: -2.2, seed: 161 },
    { id: 'pig-alley', species: 'pigeon', position: [-160, 0.15, -70], rotationY: 2.8, seed: 162 },

    // — Interior: kitchen and bar —
    { id: 'cat-bar', species: 'cat', position: [-139, 0, -37], rotationY: 1.2, seed: 171 },
    { id: 'dog-bar', species: 'dog', position: [-143, 0, -42], rotationY: -0.4, seed: 172 },
  ],
}

export const ROUTES: Record<string, RouteDef> = {
  goldcoast: GOLD_COAST,
}

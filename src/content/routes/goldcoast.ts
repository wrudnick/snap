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
 *   Origin is Michigan Avenue & Oak Street, the mouth of the pedestrian
 *   underpass. +X east, −Z north, +Y up. Chicago's grid runs 800 address units
 *   to the mile, so 1 unit ≈ 2.01 m and every position below is arithmetic on a
 *   real address rather than an invention:
 *
 *     Michigan Ave  100 E      Oak St       1000 N
 *     Rush St       diagonal   Walton Pl     932 N
 *     State St        0 E      Bellevue Pl  1030 N
 *
 *   Rush runs 65 E at 401 N to 0 E at 1138 N, so its easting at any northing is
 *   65 × (1138 − N) / 737. That diagonal is why the Rush leg drifts west as it
 *   climbs, and why Rush, State and Bellevue enclose a triangle at all.
 *
 * THE WALK
 *   Sand at Oak Street Beach → the 1934 WPA underpass beneath DuSable Lake Shore
 *   Drive → surface at the top of the Magnificent Mile → south on Michigan past
 *   the towers → west on Walton → north on Rush through the whole dining strip →
 *   Mariano Park where Rush meets State → east on Bellevue into a service alley →
 *   through a kitchen → the far end of the bar.
 *
 *   Open → tight → open → tight, ending on a barstool having started on a
 *   shoreline.
 *
 * WHY WALTON AND NOT OAK
 *   Walking south on Michigan and then west on *Oak* is geometrically impossible
 *   without doubling back — Oak is the street you surfaced on. Walton is the next
 *   block south and the only connector that reaches Rush without backtracking.
 *   It also puts you on Rush *below* the restaurants, so the northbound leg
 *   passes the entire strip (Taverne 1015, Hugo's 1024, Gooby's 1028,
 *   Clementine's 1043) rather than joining it halfway up.
 *
 * CORNERS
 *   Waypoints cluster in pairs at every turn. Combined with the rail's low
 *   spline tension, that gives street corners a tight radius instead of the wide
 *   sweep a smooth spline produces.
 */
export const GOLD_COAST: RouteDef = {
  id: 'goldcoast',
  displayName: 'Gold Coast',
  // ~810 m at a walking 2.5 m/s. Long — which is what the speed control and
  // checkpoints are for.
  durationSeconds: 320,

  waypoints: [
    // — Oak Street Beach, walking in off the sand —
    [232, 1.7, 62], //  0  water's edge
    [206, 1.7, 44], //  1
    [178, 1.7, 26], //  2  Lakefront Trail
    [150, 1.7, 10], //  3  underpass ramp

    // — Under DuSable Lake Shore Drive —
    [136, 0.8, 4], //  4  ramp down
    [126, -1.0, 3], //  5  tunnel mouth
    [104, -1.1, 3], //  6
    [78, -1.1, 3], //  7
    [52, -1.1, 3], //  8
    [38, -0.2, 3], //  9  ramp up

    // — Michigan & Oak: surface, cross south and west —
    [24, 1.7, 2], // 10  NE corner
    [13, 1.7, 5], // 11  into the crossing
    [6, 1.7, 11], // 12  corner ┐
    [4, 1.7, 19], // 13  corner ┘ turning south

    // — Michigan Avenue southbound, Oak (1000N) to Walton (932N) ≈ 137 m —
    [-1, 1.7, 34], // 14
    [-4, 1.7, 62], // 15  One Splendid Mile / Palmolympia across the street
    [-5, 1.7, 96], // 16
    [-5, 1.7, 126], // 17
    [-8, 1.7, 134], // 18  corner ┐
    [-15, 1.7, 138], // 19  corner ┘ turning west

    // — Walton Place westbound, Michigan (100E) to Rush (~18E) ≈ 164 m —
    [-46, 1.7, 139], // 20
    [-86, 1.7, 139], // 21
    [-124, 1.7, 139], // 22
    [-154, 1.7, 138], // 23
    [-163, 1.7, 133], // 24  corner ┘ turning north onto Rush

    // — Rush Street northbound, Walton (932N) through Oak (1000N) to
    //   Bellevue (1030N) ≈ 192 m, drifting west along the diagonal —
    [-166, 1.7, 104], // 25
    [-170, 1.7, 66], // 26
    [-173, 1.7, 30], // 27
    [-176, 1.7, 0], // 28  Rush & Oak — luxury block visible west
    [-179, 1.7, -28], // 29  the dining strip
    [-182, 1.7, -56], // 30  Bellevue

    // — The Triangle: Rush and State converging on Mariano Park —
    [-189, 1.7, -67], // 31
    [-197, 1.7, -74], // 32  round the pavilion
    [-186, 1.7, -80], // 33

    // — East on Bellevue (Sinatra Way) to the service alley —
    [-172, 1.7, -75], // 34
    [-162, 1.7, -69], // 35  alley mouth behind Gooby's

    // — Alley —
    [-156, 1.7, -61], // 36
    [-152, 1.7, -53], // 37

    // — Kitchen, then the bar —
    [-150, 1.7, -45], // 38  service door
    [-149, 1.7, -38], // 39  through the line
    [-148, 1.7, -31], // 40  dining room
    [-147, 1.7, -25], // 41  end of the bar
  ],

  sections: [
    { id: 'beach', kind: 'beach', title: 'Oak Street Beach', waypoints: [0, 3], lighting: BEACH_DAWN },
    { id: 'underpass', kind: 'tunnel', title: 'The Underpass', waypoints: [4, 9], lighting: TUNNEL },
    { id: 'michigan', kind: 'avenue', title: 'Michigan Avenue', waypoints: [10, 19], lighting: AVENUE_DAWN },
    { id: 'walton', kind: 'boutique', title: 'Walton Place', waypoints: [20, 24], lighting: BOUTIQUE_DAWN },
    { id: 'rush', kind: 'dining', title: 'Rush Street', waypoints: [25, 30], lighting: DINING_DAWN },
    { id: 'triangle', kind: 'park', title: 'The Triangle', waypoints: [31, 33], lighting: PARK_DAWN },
    { id: 'alley', kind: 'alley', title: 'The Alley', waypoints: [34, 37], lighting: ALLEY },
    { id: 'inside', kind: 'interior', title: 'Through the Kitchen', waypoints: [38, 41], lighting: INTERIOR },
  ],

  checkpoints: [
    { id: 'cp-beach', title: 'Oak Street Beach', waypoint: 0 },
    { id: 'cp-tunnel', title: 'The Underpass', waypoint: 4 },
    { id: 'cp-michigan', title: 'Michigan Avenue', waypoint: 10 },
    { id: 'cp-walton', title: 'Walton Place', waypoint: 20 },
    { id: 'cp-rush', title: 'Rush Street', waypoint: 25 },
    { id: 'cp-triangle', title: 'The Triangle', waypoint: 31 },
    { id: 'cp-alley', title: 'The Alley', waypoint: 34 },
    { id: 'cp-inside', title: 'Through the Kitchen', waypoint: 38 },
  ],

  look: { yawLimit: 1.75, pitchLimit: 0.85, sensitivity: 0.0022 },
  fov: { default: 62, zoomed: 26 },

  // ~22 m per segment over 810 m.
  segmentCount: 36,
  activeWindow: 3,
  // Buildings reach ~270 m so the avenue has real depth; furniture and clutter
  // stay tight because they are numerous and only read up close.
  activeWindows: { buildings: 12, furniture: 4, clutter: 3, subjects: 4 },


  /**
   * Hand-authored buildings.
   *
   * Deliberately short. OSM now supplies real footprints and heights for
   * everything outdoors, so a landmark only earns its place when the building
   * has signature geometry an extruded outline cannot express.
   *
   * The Hancock qualifies and almost nothing else does: its taper, X-bracing and
   * twin antennas are the whole silhouette, and OSM knows only that it is a
   * 22-sided polygon 343 m tall. Position and height come from the OSM centroid,
   * and its extruded footprint is suppressed in city.ts so the two don't fight.
   */
  landmarks: [
    {
      id: 'hancork',
      name: 'The Hancork',
      kind: 'hancock',
      position: [100, 0, 222], // OSM centroid of 875 N Michigan
      rotationY: 0,
      height: 343, // OSM height tag
      footprint: [80, 50],
      taper: 0.38,
      color: 0x2b2d33,
      accent: 0x585c66,
    },
  ],

  seed: 20260826,
  film: 40,

  subjects: [
    // — Beach —
    { id: 'gull-1', species: 'pigeon', position: [212, 0.2, 36], rotationY: 2.2, seed: 101 },
    { id: 'gull-2', species: 'pigeon', position: [204, 0.2, 31], rotationY: 1.8, seed: 102 },
    { id: 'dog-beach', species: 'dog', position: [186, 0, 24], seed: 103,
      path: [[192, 0, 32], [178, 0, 18], [196, 0, 20]], patrolSeconds: 24 },

    // — Tunnel —
    { id: 'pig-tunnel', species: 'pigeon', position: [100, -0.9, 5.4], rotationY: -1.6, seed: 111 },
    { id: 'cat-tunnel', species: 'cat', position: [68, -1.0, 0.4], rotationY: 1.4, seed: 112 },

    // — Michigan Avenue —
    { id: 'taxi-mich-1', species: 'taxi', position: [7, 0, 52], rotationY: 0.05, seed: 121 },
    { id: 'taxi-mich-2', species: 'taxi', position: [3, 0, 104], rotationY: Math.PI, seed: 122 },
    { id: 'pig-mich-1', species: 'pigeon', position: [-11, 0.15, 44], rotationY: -2.1, seed: 123 },
    { id: 'pig-mich-2', species: 'pigeon', position: [-13, 0.15, 48], rotationY: -1.4, seed: 124 },
    { id: 'dog-mich', species: 'dog', position: [-12, 0, 78], seed: 125,
      path: [[-11, 0, 68], [-14, 0, 92], [-9, 0, 80]], patrolSeconds: 30 },
    { id: 'cat-mich', species: 'cat', position: [-14, 0, 118], rotationY: -1.5, seed: 126 },

    // — Walton Place: the quiet block —
    { id: 'pig-wal-1', species: 'pigeon', position: [-64, 0.15, 145], rotationY: 1.2, seed: 131 },
    { id: 'pig-wal-2', species: 'pigeon', position: [-68, 0.15, 147], rotationY: 1.9, seed: 132 },
    { id: 'pig-wal-3', species: 'pigeon', position: [-61, 0.15, 148], rotationY: 0.7, seed: 133 },
    { id: 'dog-wal', species: 'dog', position: [-104, 0, 133], seed: 134,
      path: [[-96, 0, 133], [-118, 0, 132], [-106, 0, 136]], patrolSeconds: 28 },
    { id: 'taxi-wal', species: 'taxi', position: [-88, 0, 145], rotationY: Math.PI / 2, seed: 135 },
    { id: 'cat-wal', species: 'cat', position: [-140, 0, 132], rotationY: -1.5, seed: 136 },

    // — Rush Street: the patios —
    { id: 'dog-rush', species: 'dog', position: [-172, 0, 44], rotationY: 2.6, seed: 141 },
    { id: 'taxi-rush', species: 'taxi', position: [-186, 0, 8], rotationY: 0.28, seed: 142 },
    { id: 'pig-rush-1', species: 'pigeon', position: [-186, 0.15, -18], rotationY: 0.4, seed: 143 },
    { id: 'pig-rush-2', species: 'pigeon', position: [-183, 0.15, -22], rotationY: 1.1, seed: 144 },
    { id: 'cat-rush', species: 'cat', position: [-172, 0, -34], rotationY: -0.9, seed: 145 },

    // — The Triangle —
    { id: 'pig-tri-1', species: 'pigeon', position: [-188, 0.15, -63], rotationY: -0.6, seed: 151 },
    { id: 'pig-tri-2', species: 'pigeon', position: [-192, 0.15, -66], rotationY: 0.2, seed: 152 },
    { id: 'pig-tri-3', species: 'pigeon', position: [-186, 0.15, -70], rotationY: 1.5, seed: 153 },
    { id: 'pig-tri-4', species: 'pigeon', position: [-194, 0.15, -71], rotationY: 2.4, seed: 154 },
    { id: 'dog-tri', species: 'dog', position: [-190, 0, -76], seed: 155,
      path: [[-186, 0, -73], [-196, 0, -79], [-190, 0, -69]], patrolSeconds: 26 },

    // — Alley —
    { id: 'cat-alley', species: 'cat', position: [-157, 0, -64], rotationY: -2.2, seed: 161 },
    { id: 'pig-alley', species: 'pigeon', position: [-165, 0.15, -71], rotationY: 2.8, seed: 162 },

    // — Kitchen and bar —
    { id: 'dog-bar', species: 'dog', position: [-150, 0, -40], rotationY: -0.4, seed: 171 },
    { id: 'cat-bar', species: 'cat', position: [-146, 0, -28], rotationY: 1.2, seed: 172 },
  ],
}

export const ROUTES: Record<string, RouteDef> = {
  goldcoast: GOLD_COAST,
}

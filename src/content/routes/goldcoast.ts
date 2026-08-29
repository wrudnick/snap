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
 *   the towers → west on Delaware and down to Chestnut → north on Rush through
 *   the whole dining strip → Mariano Park where Rush meets State → east on Bellevue
 *   into a service alley → through a kitchen → the far end of the bar.
 *
 *   Open → tight → open → tight, ending on a barstool having started on a
 *   shoreline.
 *
 * TO SCALE, AND WHY THAT MATTERS
 *   Michigan Avenue used to run a single block, Oak to Walton, because two
 *   blocks seemed long. It read as a shortcut: the Magnificent Mile is *made* of
 *   its length, and one block of it is a corner rather than an avenue. Every
 *   position here is now a real OSM node or a point interpolated between two of
 *   them, and no block is shortened.
 *
 * WHY CHESTNUT AND NOT OAK
 *   Walking south on Michigan and then west on *Oak* is geometrically impossible
 *   without doubling back — Oak is the street you surfaced on. Chestnut is the
 *   third block south and the one the Hancock stands on: its footprint runs
 *   z 195 to 249, so Delaware turns before it and Chestnut runs its whole
 *   frontage first. Chestnut also joins Rush at its southern end, so the
 *   northbound leg covers the entire strip (Taverne 1015, Hugo's 1024,
 *   Gooby's 1028, Clementine's 1043) rather than the top half of it.
 *
 * CORNERS
 *   Waypoints cluster in pairs at every turn. Combined with the rail's low
 *   spline tension, that gives street corners a tight radius instead of the wide
 *   sweep a smooth spline produces.
 */
export const GOLD_COAST: RouteDef = {
  id: 'goldcoast',
  displayName: 'Gold Coast',
  // ~1.3 km at a brisk walk. Long — which is what the speed control and the
  // checkpoints are for.
  durationSeconds: 380,

  waypoints: [
    // — Oak Street Beach —
    [137.06, 1.7, -178.265], //  0
    [177.111, 1.7, -138.676], //  1
    [160.971, 1.7, -103.513], //  2

    // — The Underpass —
    [109.514, 0.4, -137.055], //  3
    [65.7509, -2, -98.873], //  4
    [43.2658, -2, -76.3298], //  5
    [34.9721, -0.4, -40.5951], //  6

    // — East Lake Shore Drive —
    [28.7218, 1.7, -19.8772], //  7
    [18.7754, 1.7, 7.52043], //  8

    // — Michigan Avenue —
    [0.16309, 1.7, 9.45922], //  9
    [2.28799, 1.7, 75.3335], // 10
    [3.84281, 1.7, 138.23], // 11
    [4.33095, 1.7, 164.983], // 12
    [4.62976, 1.7, 178.91], // 13

    // — Delaware Place —
    [-47.6886, 1.7, 178.723], // 14
    [-116.01, 1.7, 180.456], // 15
    [-172.272, 1.7, 181.952], // 16

    // — Rush Street —
    [-199, 1.7, 183], // 17
    [-230, 1.7, 95], // 18
    [-262, 1.7, 6], // 19
    [-278, 1.7, -40], // 20
    [-294, 1.7, -84], // 21

    // — The Triangle —
    [-338.27, 1.7, -82.9584], // 22
    [-336.377, 1.7, -171.85], // 23
    [-312.626, 1.7, -117.938], // 24

    // — The Alley —
    [-296.718, 1.7, -120.243], // 25
    [-283.117, 1.7, -119.597], // 26
    [-272.891, 1.7, -120.651], // 27
    [-267.06, 1.7, -119.72], // 28

    // — Through the Kitchen —
    [-272.435, 1.7, -130.924], // 29
    [-280.565, 1.7, -135.894], // 30
    [-280.932, 1.7, -127.894], // 31
    [-300.129, 1.7, -127.766], // 32
  ],

  sections: [
    { id: 'beach', kind: 'beach', title: 'Oak Street Beach', waypoints: [0, 2], lighting: BEACH_DAWN },
    { id: 'underpass', kind: 'tunnel', title: 'The Underpass', waypoints: [3, 6], lighting: TUNNEL },
    { id: 'lakeshore', kind: 'boutique', title: 'East Lake Shore Drive', waypoints: [7, 8], lighting: BOUTIQUE_DAWN },
    { id: 'michigan', kind: 'avenue', title: 'Michigan Avenue', waypoints: [9, 13], lighting: AVENUE_DAWN },
    { id: 'delaware', kind: 'boutique', title: 'Delaware Place', waypoints: [14, 16], lighting: BOUTIQUE_DAWN },
    { id: 'rush', kind: 'dining', title: 'Rush Street', waypoints: [17, 21], lighting: DINING_DAWN },
    { id: 'triangle', kind: 'park', title: 'The Triangle', waypoints: [22, 24], lighting: PARK_DAWN },
    { id: 'alley', kind: 'alley', title: 'The Alley', waypoints: [25, 28], lighting: ALLEY },
    { id: 'inside', kind: 'interior', title: 'Through the Kitchen', waypoints: [29, 32], lighting: INTERIOR },
  ],

  checkpoints: [
    { id: 'cp-beach', title: 'Oak Street Beach', waypoint: 0 },
    { id: 'cp-underpass', title: 'The Underpass', waypoint: 3 },
    { id: 'cp-lakeshore', title: 'East Lake Shore Drive', waypoint: 7 },
    { id: 'cp-michigan', title: 'Michigan Avenue', waypoint: 9 },
    { id: 'cp-delaware', title: 'Delaware Place', waypoint: 14 },
    { id: 'cp-rush', title: 'Rush Street', waypoint: 17 },
    { id: 'cp-triangle', title: 'The Triangle', waypoint: 22 },
    { id: 'cp-alley', title: 'The Alley', waypoint: 25 },
    { id: 'cp-inside', title: 'Through the Kitchen', waypoint: 29 },
  ],

  look: { yawLimit: 1.75, pitchLimit: 0.85, sensitivity: 0.0022 },
  fov: { default: 62, zoomed: 26 },

  // ~29 m per segment.
  segmentCount: 45,
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
  film: 46,

  /**
   * Subjects anchored to the rail, not the world.
   *
   * `t` is progress along the route and `offset` is metres left of travel, so a
   * subject stays beside the path however the path is later refitted. Authoring
   * these as absolute coordinates was a mistake the OSM refit exposed: every one
   * of them ended up in the wrong block, several inside buildings.
   */
  subjects: [
    // — Beach —
    { id: 'gull-1', species: 'pigeon', at: { section: 'beach', u: 0.2, offset: -14, y: 0.2 }, rotationY: 2.2, seed: 101 },
    { id: 'gull-2', species: 'pigeon', at: { section: 'beach', u: 0.45, offset: -9, y: 0.2 }, rotationY: 1.8, seed: 102 },
    { id: 'dog-beach', species: 'dog', at: { section: 'beach', u: 0.75, offset: 11 }, rotationY: 1.1, seed: 103 },

    // — Underpass —
    { id: 'pig-tunnel', species: 'pigeon', at: { section: 'underpass', u: 0.35, offset: 2.6, y: 0.15 }, rotationY: -1.6, seed: 111 },
    { id: 'cat-tunnel', species: 'cat', at: { section: 'underpass', u: 0.75, offset: -2.4 }, rotationY: 1.4, seed: 112 },

    // — East Lake Shore Drive —
    { id: 'taxi-elsd', species: 'taxi', at: { section: 'lakeshore', u: 0.15, offset: 9 }, rotationY: 1.6, seed: 121 },
    { id: 'dog-elsd', species: 'dog', at: { section: 'lakeshore', u: 0.38, offset: -8 }, rotationY: -1.2, seed: 122 },
    { id: 'pig-elsd-1', species: 'pigeon', at: { section: 'lakeshore', u: 0.6, offset: -7, y: 0.15 }, rotationY: 0.4, seed: 123 },
    { id: 'pig-elsd-2', species: 'pigeon', at: { section: 'lakeshore', u: 0.64, offset: -9, y: 0.15 }, rotationY: 1.1, seed: 124 },
    { id: 'cat-elsd', species: 'cat', at: { section: 'lakeshore', u: 0.85, offset: 10 }, rotationY: -1.5, seed: 125 },

    // — Michigan Avenue —
    { id: 'taxi-mich-1', species: 'taxi', at: { section: 'michigan', u: 0.2, offset: 14 }, rotationY: 0.18, seed: 131 },
    { id: 'pig-mich-1', species: 'pigeon', at: { section: 'michigan', u: 0.38, offset: -6, y: 0.15 }, rotationY: -2.1, seed: 132 },
    { id: 'pig-mich-2', species: 'pigeon', at: { section: 'michigan', u: 0.42, offset: -8, y: 0.15 }, rotationY: -1.4, seed: 133 },
    { id: 'dog-mich', species: 'dog', at: { section: 'michigan', u: 0.55, offset: -7 }, rotationY: 2.4, seed: 134 },
    { id: 'taxi-mich-2', species: 'taxi', at: { section: 'michigan', u: 0.78, offset: 15 }, rotationY: Math.PI, seed: 135 },

    // — Delaware Place —
    { id: 'cat-del', species: 'cat', at: { section: 'delaware', u: 0.12, offset: -7 }, rotationY: -1.5, seed: 141 },
    { id: 'pig-del-1', species: 'pigeon', at: { section: 'delaware', u: 0.3, offset: 6, y: 0.15 }, rotationY: 1.2, seed: 142 },
    { id: 'pig-del-2', species: 'pigeon', at: { section: 'delaware', u: 0.33, offset: 8, y: 0.15 }, rotationY: 1.9, seed: 143 },
    { id: 'pig-del-3', species: 'pigeon', at: { section: 'delaware', u: 0.36, offset: 5, y: 0.15 }, rotationY: 0.7, seed: 144 },
    { id: 'dog-del', species: 'dog', at: { section: 'delaware', u: 0.62, offset: -6 }, rotationY: 0.9, seed: 145 },

    // — Rush Street: the patios —
    { id: 'taxi-rush', species: 'taxi', at: { section: 'rush', u: 0.12, offset: 12 }, rotationY: 0.35, seed: 151 },
    { id: 'dog-rush', species: 'dog', at: { section: 'rush', u: 0.28, offset: -7 }, rotationY: 2.6, seed: 152 },
    { id: 'pig-rush-1', species: 'pigeon', at: { section: 'rush', u: 0.55, offset: -6, y: 0.15 }, rotationY: 0.4, seed: 153 },
    { id: 'pig-rush-2', species: 'pigeon', at: { section: 'rush', u: 0.58, offset: -8, y: 0.15 }, rotationY: 1.1, seed: 154 },
    { id: 'cat-rush', species: 'cat', at: { section: 'rush', u: 0.72, offset: 7 }, rotationY: -0.9, seed: 155 },

    // — The Triangle —
    { id: 'pig-tri-1', species: 'pigeon', at: { section: 'triangle', u: 0.15, offset: 5, y: 0.15 }, rotationY: -0.6, seed: 161 },
    { id: 'pig-tri-2', species: 'pigeon', at: { section: 'triangle', u: 0.25, offset: 8, y: 0.15 }, rotationY: 0.2, seed: 162 },
    { id: 'pig-tri-3', species: 'pigeon', at: { section: 'triangle', u: 0.35, offset: 3, y: 0.15 }, rotationY: 1.5, seed: 163 },
    { id: 'pig-tri-4', species: 'pigeon', at: { section: 'triangle', u: 0.45, offset: 10, y: 0.15 }, rotationY: 2.4, seed: 164 },
    { id: 'dog-tri', species: 'dog', at: { section: 'triangle', u: 0.6, offset: -5 }, rotationY: 1.3, seed: 165 },

    // — Alley —
    { id: 'cat-alley', species: 'cat', at: { section: 'alley', u: 0.3, offset: 2 }, rotationY: -2.2, seed: 171 },
    { id: 'pig-alley', species: 'pigeon', at: { section: 'alley', u: 0.65, offset: -1.8, y: 0.15 }, rotationY: 2.8, seed: 172 },

    // — Kitchen and bar —
    { id: 'dog-bar', species: 'dog', at: { section: 'inside', u: 0.3, offset: -1.6 }, rotationY: -0.4, seed: 181 },
    { id: 'cat-bar', species: 'cat', at: { section: 'inside', u: 0.85, offset: 1.6 }, rotationY: 1.2, seed: 182 },

    // — People. Placed where each class actually belongs: tourists gawking on
    //   the Magnificent Mile, a doorman outside the hotels, the Rush Street
    //   crowd around the Triangle. —
    { id: 'tour-elsd-1', species: 'tourist-woman', at: { section: 'lakeshore', u: 0.33, offset: 2.5 }, rotationY: 1.4, seed: 301 },
    { id: 'tour-elsd-2', species: 'tourist-man', at: { section: 'lakeshore', u: 0.36, offset: 4.5 }, rotationY: 1.2, seed: 302 },
    { id: 'old-elsd', species: 'old-man', at: { section: 'lakeshore', u: 0.72, offset: -2.5 }, rotationY: -1.4, seed: 303 },

    { id: 'door-mich', species: 'doorman', at: { section: 'michigan', u: 0.12, offset: 4.5 }, rotationY: -1.5, seed: 311 },
    { id: 'tour-mich-1', species: 'tourist-man', at: { section: 'michigan', u: 0.25, offset: 2.0 }, rotationY: 2.6, seed: 312 },
    { id: 'tour-mich-2', species: 'tourist-woman', at: { section: 'michigan', u: 0.28, offset: 4.0 }, rotationY: 2.9, seed: 313 },
    { id: 'tour-mich-3', species: 'tourist-woman', at: { section: 'michigan', u: 0.48, offset: 2.5 }, rotationY: 0.3, seed: 314 },
    { id: 'tour-mich-4', species: 'tourist-man', at: { section: 'michigan', u: 0.52, offset: 5.0 }, rotationY: 0.1, seed: 315 },
    { id: 'old-mich', species: 'old-man', at: { section: 'michigan', u: 0.66, offset: 3.5 }, rotationY: 1.8, seed: 316 },
    { id: 'esc-mich', species: 'escort', at: { section: 'michigan', u: 0.72, offset: 5.5 }, rotationY: 2.2, seed: 317 },

    { id: 'door-del', species: 'doorman', at: { section: 'delaware', u: 0.2, offset: -3.5 }, rotationY: -0.2, seed: 321 },
    { id: 'esc-del', species: 'escort', at: { section: 'delaware', u: 0.45, offset: 3.0 }, rotationY: 1.6, seed: 322 },
    { id: 'tour-del', species: 'tourist-woman', at: { section: 'delaware', u: 0.72, offset: -4.0 }, rotationY: -1.3, seed: 323 },

    // The dining strip: the crowd this route exists to photograph.
    //
    // Six people across 269 m was one person every forty-five metres, which on
    // a Saturday-night restaurant row reads as an evacuation. These sit in
    // pairs and threes on the patios — `offset` is metres LEFT of travel, and
    // the near sidewalk here runs from about −1 to −7 — with a scattering on
    // the far side for depth.
    { id: 'old-rush-1', species: 'old-man', at: { section: 'rush', u: 0.20, offset: -3.0 }, rotationY: 1.5, seed: 331 },
    { id: 'esc-rush-1', species: 'escort', at: { section: 'rush', u: 0.21, offset: -4.6 }, rotationY: 1.7, seed: 332 },
    { id: 'door-rush-1', species: 'doorman', at: { section: 'rush', u: 0.26, offset: -2.2 }, rotationY: 1.5, seed: 337 },

    { id: 'old-rush-2', species: 'old-man', at: { section: 'rush', u: 0.34, offset: -5.2 }, rotationY: 1.2, seed: 333 },
    { id: 'esc-rush-2', species: 'escort', at: { section: 'rush', u: 0.35, offset: -3.4 }, rotationY: 1.9, seed: 334 },
    { id: 'tour-rush-1', species: 'tourist-woman', at: { section: 'rush', u: 0.37, offset: -6.2 }, rotationY: 2.4, seed: 338 },

    { id: 'old-rush-3', species: 'old-man', at: { section: 'rush', u: 0.47, offset: -4.0 }, rotationY: 1.4, seed: 339 },
    { id: 'esc-rush-3', species: 'escort', at: { section: 'rush', u: 0.48, offset: -5.6 }, rotationY: 1.6, seed: 340 },

    { id: 'tour-rush-2', species: 'tourist-man', at: { section: 'rush', u: 0.55, offset: -2.6 }, rotationY: -1.1, seed: 344 },
    { id: 'esc-rush-4', species: 'escort', at: { section: 'rush', u: 0.57, offset: -6.0 }, rotationY: 2.1, seed: 345 },
    { id: 'old-rush-4', species: 'old-man', at: { section: 'rush', u: 0.58, offset: -4.4 }, rotationY: 1.3, seed: 346 },

    { id: 'door-rush-2', species: 'doorman', at: { section: 'rush', u: 0.66, offset: -1.8 }, rotationY: 1.5, seed: 335 },
    { id: 'tour-rush-3', species: 'tourist-man', at: { section: 'rush', u: 0.68, offset: -5.0 }, rotationY: -1.1, seed: 336 },
    { id: 'esc-rush-5', species: 'escort', at: { section: 'rush', u: 0.70, offset: -3.2 }, rotationY: 1.8, seed: 347 },

    { id: 'old-rush-5', species: 'old-man', at: { section: 'rush', u: 0.80, offset: -4.8 }, rotationY: 1.5, seed: 348 },
    { id: 'esc-rush-6', species: 'escort', at: { section: 'rush', u: 0.81, offset: -3.0 }, rotationY: 1.7, seed: 349 },

    // Across the street, small in frame — depth, and something to zoom at.
    { id: 'tour-rush-far-1', species: 'tourist-woman', at: { section: 'rush', u: 0.30, offset: -17.5 }, rotationY: -1.4, seed: 361 },
    { id: 'old-rush-far', species: 'old-man', at: { section: 'rush', u: 0.44, offset: -18.5 }, rotationY: -1.2, seed: 362 },
    { id: 'tour-rush-far-2', species: 'tourist-man', at: { section: 'rush', u: 0.62, offset: -17.0 }, rotationY: -1.5, seed: 363 },
    { id: 'esc-rush-far', species: 'escort', at: { section: 'rush', u: 0.75, offset: -18.0 }, rotationY: -1.3, seed: 364 },

    { id: 'old-tri', species: 'old-man', at: { section: 'triangle', u: 0.3, offset: -3.0 }, rotationY: -0.8, seed: 341 },
    { id: 'esc-tri', species: 'escort', at: { section: 'triangle', u: 0.35, offset: -4.5 }, rotationY: -0.6, seed: 342 },
    { id: 'tour-tri', species: 'tourist-woman', at: { section: 'triangle', u: 0.5, offset: 2.5 }, rotationY: 2.0, seed: 343 },

    { id: 'esc-bar', species: 'escort', at: { section: 'inside', u: 0.5, offset: 1.4 }, rotationY: 1.4, seed: 351 },
    { id: 'old-bar', species: 'old-man', at: { section: 'inside', u: 0.7, offset: -1.4 }, rotationY: -1.2, seed: 352 },
  ],
}


export const ROUTES: Record<string, RouteDef> = {
  goldcoast: GOLD_COAST,
}

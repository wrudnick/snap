import {
  ALLEY,
  AVENUE_DAWN,
  BEACH_DAWN,
  BOUTIQUE_DAWN,
  BOUTIQUE_SUNSET,
  DINING_DUSK,
  INTERIOR,
  PARK_DUSK,
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
    // The top of the ramp: the second turn, where the walk leaves the sand and
    // starts down into the cut.
    [160.971, 1.7, -103.513], //  2

    // — The Underpass —
    //   Down the ramp to the left-hand turn, then dead level for the width of
    //   Lake Shore Drive — which is the only stretch with a roof over it — and
    //   then a longer, gentler climb back to street level. The descent is 8%
    //   over 61 m and the climb 5% over 91 m, which is what makes going down
    //   feel like going under something and coming up feel like arriving.
    [109.514, -3.2, -137.055], //  3  bottom of the ramp, turn left
    [65.7509, -3.2, -98.873], //  4  clear of Lake Shore Drive
    [43.2658, -1.6, -76.3298], //  5
    [34.9721, 0.2, -40.5951], //  6

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
    { id: 'beach', kind: 'beach', title: 'Oak Street Beach', waypoints: [0, 1], lighting: BEACH_DAWN },
    { id: 'underpass', kind: 'tunnel', title: 'The Underpass', waypoints: [2, 6], lighting: TUNNEL },
    { id: 'lakeshore', kind: 'boutique', title: 'East Lake Shore Drive', waypoints: [7, 8], lighting: BOUTIQUE_DAWN },
    { id: 'michigan', kind: 'avenue', title: 'Michigan Avenue', waypoints: [9, 13], lighting: AVENUE_DAWN },
    { id: 'delaware', kind: 'boutique', title: 'Delaware Place', waypoints: [14, 16], lighting: BOUTIQUE_SUNSET },
    { id: 'rush', kind: 'dining', title: 'Rush Street', waypoints: [17, 21], lighting: DINING_DUSK },
    { id: 'triangle', kind: 'park', title: 'The Triangle', waypoints: [22, 24], lighting: PARK_DUSK },
    { id: 'alley', kind: 'alley', title: 'The Alley', waypoints: [25, 28], lighting: ALLEY },
    { id: 'inside', kind: 'interior', title: 'Through the Kitchen', waypoints: [29, 32], lighting: INTERIOR },
  ],

  checkpoints: [
    { id: 'cp-beach', title: 'Oak Street Beach', waypoint: 0 },
    { id: 'cp-underpass', title: 'The Underpass', waypoint: 2 },
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
  film: 80,

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

    /**
     * The beach, occupied.
     *
     * Sunbathers spread down the sand on both sides, then the crowd packed in
     * around the club at u 0.84 — the last thing you pass before the route
     * turns down into the underpass. Negative offsets are lakeward, so the
     * loungers sit between the path and the water and the club sits inland of
     * it, which is where the real one is.
     */
    { id: 'sun-1', species: 'beachgoer', at: { section: 'beach', u: 0.08, offset: -6.2 }, rotationY: 2.6, seed: 610 },
    { id: 'sun-2', species: 'beachgoer', at: { section: 'beach', u: 0.11, offset: -8.8 }, rotationY: 2.2, seed: 611 },
    { id: 'sun-3', species: 'beachgoer', at: { section: 'beach', u: 0.16, offset: -12.5 }, rotationY: 3.0, seed: 612 },
    { id: 'sun-4', species: 'beachgoer', at: { section: 'beach', u: 0.19, offset: 4.7 }, rotationY: -0.6, seed: 613 },
    { id: 'sun-5', species: 'beachgoer', at: { section: 'beach', u: 0.24, offset: -7.3 }, rotationY: 2.4, seed: 614 },
    { id: 'sun-6', species: 'beachgoer', at: { section: 'beach', u: 0.28, offset: -10.4 }, rotationY: 1.9, seed: 615 },
    { id: 'sun-7', species: 'beachgoer', at: { section: 'beach', u: 0.33, offset: 6.8 }, rotationY: -1.1, seed: 616 },
    { id: 'sun-8', species: 'beachgoer', at: { section: 'beach', u: 0.37, offset: -5.2 }, rotationY: 2.8, seed: 617 },
    { id: 'sun-9', species: 'beachgoer', at: { section: 'beach', u: 0.42, offset: -13.5 }, rotationY: 2.1, seed: 618 },
    { id: 'sun-10', species: 'beachgoer', at: { section: 'beach', u: 0.47, offset: -8.3 }, rotationY: 3.1, seed: 619 },
    { id: 'sun-11', species: 'beachgoer', at: { section: 'beach', u: 0.52, offset: 5.7 }, rotationY: -0.9, seed: 620 },
    { id: 'sun-12', species: 'beachgoer', at: { section: 'beach', u: 0.56, offset: -10.9 }, rotationY: 2.5, seed: 621 },
    { id: 'sun-13', species: 'beachgoer', at: { section: 'beach', u: 0.63, offset: -6.8 }, rotationY: 1.7, seed: 622 },
    { id: 'sun-14', species: 'beachgoer', at: { section: 'beach', u: 0.68, offset: -15.1 }, rotationY: 2.9, seed: 623 },
    { id: 'sun-15', species: 'beachgoer', at: { section: 'beach', u: 0.72, offset: 7.3 }, rotationY: -1.4, seed: 624 },
    { id: 'sun-16', species: 'beachgoer', at: { section: 'beach', u: 0.79, offset: -9.4 }, rotationY: 2.3, seed: 625 },
    { id: 'sun-17', species: 'beachgoer', at: { section: 'beach', u: 0.90, offset: -11.4 }, rotationY: 2.7, seed: 626 },
    { id: 'sun-18', species: 'beachgoer', at: { section: 'beach', u: 0.95, offset: -6.2 }, rotationY: 2.0, seed: 627 },

    // The club. `offset` 15 is its deck; the crowd rings the counter and spills
    // out toward the path.
    { id: 'club-1', species: 'partygoer', at: { section: 'beach', u: 0.82, offset: 12.5, y: 0.32 }, rotationY: 0.6, seed: 640 },
    { id: 'club-2', species: 'partygoer', at: { section: 'beach', u: 0.83, offset: 15.5, y: 0.32 }, rotationY: -2.1, seed: 641 },
    { id: 'club-3', species: 'partygoer', at: { section: 'beach', u: 0.845, offset: 13.5, y: 0.32 }, rotationY: 1.8, seed: 642 },
    { id: 'club-4', species: 'partygoer', at: { section: 'beach', u: 0.855, offset: 17.0, y: 0.32 }, rotationY: -1.2, seed: 643 },
    { id: 'club-5', species: 'partygoer', at: { section: 'beach', u: 0.865, offset: 12.0, y: 0.32 }, rotationY: 2.4, seed: 644 },
    { id: 'club-6', species: 'partygoer', at: { section: 'beach', u: 0.875, offset: 16.0, y: 0.32 }, rotationY: -0.4, seed: 645 },
    { id: 'club-7', species: 'partygoer', at: { section: 'beach', u: 0.815, offset: 18.0, y: 0.32 }, rotationY: 1.1, seed: 646 },
    { id: 'club-8', species: 'partygoer', at: { section: 'beach', u: 0.885, offset: 14.5, y: 0.32 }, rotationY: -2.6, seed: 647 },
    { id: 'club-9', species: 'partygoer', at: { section: 'beach', u: 0.80, offset: 9.5 }, rotationY: 0.9, seed: 648 },
    { id: 'club-10', species: 'partygoer', at: { section: 'beach', u: 0.87, offset: 8.5 }, rotationY: -1.7, seed: 649 },
    { id: 'club-11', species: 'partygoer', at: { section: 'beach', u: 0.89, offset: 10.5 }, rotationY: 2.2, seed: 650 },
    { id: 'club-12', species: 'partygoer', at: { section: 'beach', u: 0.835, offset: 20.5, y: 0.32 }, rotationY: -0.8, seed: 651 },
    { id: 'gull-3', species: 'pigeon', at: { section: 'beach', u: 0.86, offset: 7.0 }, rotationY: -0.7, seed: 652 },
    { id: 'gull-4', species: 'pigeon', at: { section: 'beach', u: 0.30, offset: -18, y: 0.2 }, rotationY: 1.2, seed: 653 },

    // — Underpass —
    { id: 'pig-tunnel', species: 'pigeon', at: { section: 'underpass', u: 0.35, offset: 2.6, y: 0.15 }, rotationY: -1.6, seed: 111 },
    { id: 'cat-tunnel', species: 'cat', at: { section: 'underpass', u: 0.75, offset: -2.4 }, rotationY: 1.4, seed: 112 },

    // — East Lake Shore Drive —
    { id: 'taxi-elsd', species: 'taxi', at: { section: 'lakeshore', u: 0.15, offset: 9 }, rotationY: 1.6, alignToRoute: true, seed: 121 },
    { id: 'dog-elsd', species: 'dog', at: { section: 'lakeshore', u: 0.38, offset: -8 }, rotationY: -1.2, seed: 122 },
    { id: 'pig-elsd-1', species: 'pigeon', at: { section: 'lakeshore', u: 0.6, offset: -7, y: 0.15 }, rotationY: 0.4, seed: 123 },
    { id: 'pig-elsd-2', species: 'pigeon', at: { section: 'lakeshore', u: 0.64, offset: -9, y: 0.15 }, rotationY: 1.1, seed: 124 },
    { id: 'cat-elsd', species: 'cat', at: { section: 'lakeshore', u: 0.85, offset: 10 }, rotationY: -1.5, seed: 125 },

    // — Michigan Avenue —
    { id: 'taxi-mich-1', species: 'taxi', at: { section: 'michigan', u: 0.2, offset: 14 }, rotationY: 0.18, alignToRoute: true, seed: 131 },
    { id: 'pig-mich-1', species: 'pigeon', at: { section: 'michigan', u: 0.38, offset: -6, y: 0.15 }, rotationY: -2.1, seed: 132 },
    { id: 'pig-mich-2', species: 'pigeon', at: { section: 'michigan', u: 0.42, offset: -8, y: 0.15 }, rotationY: -1.4, seed: 133 },
    { id: 'dog-mich', species: 'dog', at: { section: 'michigan', u: 0.55, offset: -7 }, rotationY: 2.4, seed: 134 },
    { id: 'taxi-mich-2', species: 'taxi', at: { section: 'michigan', u: 0.78, offset: 15 }, rotationY: Math.PI, alignToRoute: true, seed: 135 },

    // — Delaware Place —
    { id: 'cat-del', species: 'cat', at: { section: 'delaware', u: 0.12, offset: -7 }, rotationY: -1.5, seed: 141 },
    { id: 'pig-del-1', species: 'pigeon', at: { section: 'delaware', u: 0.3, offset: 6, y: 0.15 }, rotationY: 1.2, seed: 142 },
    { id: 'pig-del-2', species: 'pigeon', at: { section: 'delaware', u: 0.33, offset: 8, y: 0.15 }, rotationY: 1.9, seed: 143 },
    { id: 'pig-del-3', species: 'pigeon', at: { section: 'delaware', u: 0.36, offset: 5, y: 0.15 }, rotationY: 0.7, seed: 144 },
    { id: 'dog-del', species: 'dog', at: { section: 'delaware', u: 0.62, offset: -6 }, rotationY: 0.9, seed: 145 },

    // — Rush Street: the patios —
    { id: 'taxi-rush', species: 'taxi', at: { section: 'rush', u: 0.12, offset: 12 }, rotationY: 0.35, alignToRoute: true, seed: 151 },
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
    { id: 'tour-elsd-1', species: 'tourist-woman', at: { section: 'lakeshore', u: 0.33, offset: 3.3 }, rotationY: 1.4, seed: 301 },
    { id: 'tour-elsd-2', species: 'tourist-man', at: { section: 'lakeshore', u: 0.36, offset: 4.5 }, rotationY: 1.2, seed: 302 },
    { id: 'old-elsd', species: 'old-man', at: { section: 'lakeshore', u: 0.72, offset: -3.3 }, rotationY: -1.4, seed: 303 },

    { id: 'door-mich', species: 'doorman', at: { section: 'michigan', u: 0.12, offset: 4.5 }, rotationY: -1.5, seed: 311 },
    { id: 'tour-mich-1', species: 'tourist-man', at: { section: 'michigan', u: 0.25, offset: 3.4 }, rotationY: 2.6, seed: 312 },
    { id: 'tour-mich-2', species: 'tourist-woman', at: { section: 'michigan', u: 0.28, offset: 4.0 }, rotationY: 2.9, seed: 313 },
    { id: 'tour-mich-3', species: 'tourist-woman', at: { section: 'michigan', u: 0.48, offset: 3.2 }, rotationY: 0.3, seed: 314 },
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
    { id: 'old-rush-1', species: 'old-man', at: { section: 'rush', u: 0.20, offset: 8.7 }, rotationY: 1.5, seed: 331 },
    { id: 'esc-rush-1', species: 'escort', at: { section: 'rush', u: 0.21, offset: -10.2 }, rotationY: 1.7, seed: 332 },
    { id: 'door-rush-1', species: 'doorman', at: { section: 'rush', u: 0.26, offset: -8.9 }, rotationY: 1.5, seed: 337 },

    { id: 'old-rush-2', species: 'old-man', at: { section: 'rush', u: 0.34, offset: 10.8 }, rotationY: 1.2, seed: 333 },
    { id: 'esc-rush-2', species: 'escort', at: { section: 'rush', u: 0.35, offset: -9.1 }, rotationY: 1.9, seed: 334 },
    { id: 'tour-rush-1', species: 'tourist-woman', at: { section: 'rush', u: 0.37, offset: -11.7 }, rotationY: 2.4, seed: 338 },

    { id: 'old-rush-3', species: 'old-man', at: { section: 'rush', u: 0.47, offset: 9.6 }, rotationY: 1.4, seed: 339 },
    { id: 'esc-rush-3', species: 'escort', at: { section: 'rush', u: 0.48, offset: -11.2 }, rotationY: 1.6, seed: 340 },

    { id: 'tour-rush-2', species: 'tourist-man', at: { section: 'rush', u: 0.55, offset: -9.1 }, rotationY: -1.1, seed: 344 },
    { id: 'esc-rush-4', species: 'escort', at: { section: 'rush', u: 0.57, offset: 11.5 }, rotationY: 2.1, seed: 345 },
    { id: 'old-rush-4', species: 'old-man', at: { section: 'rush', u: 0.58, offset: -10.0 }, rotationY: 1.3, seed: 346 },

    { id: 'door-rush-2', species: 'doorman', at: { section: 'rush', u: 0.66, offset: -8.7 }, rotationY: 1.5, seed: 335 },
    { id: 'tour-rush-3', species: 'tourist-man', at: { section: 'rush', u: 0.68, offset: 10.6 }, rotationY: -1.1, seed: 336 },
    { id: 'esc-rush-5', species: 'escort', at: { section: 'rush', u: 0.70, offset: -8.9 }, rotationY: 1.8, seed: 347 },

    { id: 'old-rush-5', species: 'old-man', at: { section: 'rush', u: 0.80, offset: -10.4 }, rotationY: 1.5, seed: 348 },
    { id: 'esc-rush-6', species: 'escort', at: { section: 'rush', u: 0.81, offset: 8.7 }, rotationY: 1.7, seed: 349 },

    // Filling out the strip. Twenty people over 380 m is one every nineteen
    // metres, which on a Saturday-night restaurant row still reads as thin —
    // these close the gaps between the existing groups rather than starting new
    // ones, because a crowd is clusters and the space between them.
    { id: 'tour-rush-4', species: 'tourist-man', at: { section: 'rush', u: 0.16, offset: -11.0 }, rotationY: 1.9, seed: 371 },
    { id: 'esc-rush-7', species: 'escort', at: { section: 'rush', u: 0.23, offset: -11.4 }, rotationY: 1.4, seed: 372 },
    { id: 'old-rush-6', species: 'old-man', at: { section: 'rush', u: 0.30, offset: 8.9 }, rotationY: 1.6, seed: 373 },
    { id: 'tour-rush-5', species: 'tourist-woman', at: { section: 'rush', u: 0.31, offset: -10.5 }, rotationY: 2.2, seed: 374 },
    { id: 'door-rush-3', species: 'doorman', at: { section: 'rush', u: 0.43, offset: -8.7 }, rotationY: 1.5, seed: 375 },
    { id: 'esc-rush-8', species: 'escort', at: { section: 'rush', u: 0.44, offset: 11.9 }, rotationY: 1.8, seed: 376 },
    { id: 'old-rush-7', species: 'old-man', at: { section: 'rush', u: 0.50, offset: -11.2 }, rotationY: 1.2, seed: 377 },
    { id: 'tour-rush-6', species: 'tourist-man', at: { section: 'rush', u: 0.61, offset: -9.8 }, rotationY: -1.2, seed: 378 },
    { id: 'esc-rush-9', species: 'escort', at: { section: 'rush', u: 0.62, offset: 11.5 }, rotationY: 1.7, seed: 379 },
    { id: 'old-rush-8', species: 'old-man', at: { section: 'rush', u: 0.73, offset: -9.3 }, rotationY: 1.4, seed: 380 },
    { id: 'tour-rush-7', species: 'tourist-woman', at: { section: 'rush', u: 0.75, offset: -11.5 }, rotationY: 2.0, seed: 381 },
    { id: 'esc-rush-10', species: 'escort', at: { section: 'rush', u: 0.87, offset: 10.0 }, rotationY: 1.6, seed: 382 },
    { id: 'old-rush-9', species: 'old-man', at: { section: 'rush', u: 0.88, offset: -11.7 }, rotationY: 1.3, seed: 383 },
    { id: 'tour-rush-8', species: 'tourist-man', at: { section: 'rush', u: 0.93, offset: -9.1 }, rotationY: 1.5, seed: 384 },

    // Across the road, small in frame.
    { id: 'esc-rush-far-2', species: 'escort', at: { section: 'rush', u: 0.20, offset: -17.2 }, rotationY: -1.4, seed: 385 },
    { id: 'old-rush-far-2', species: 'old-man', at: { section: 'rush', u: 0.53, offset: -18.2 }, rotationY: -1.3, seed: 386 },
    { id: 'tour-rush-far-3', species: 'tourist-woman', at: { section: 'rush', u: 0.90, offset: -17.6 }, rotationY: -1.5, seed: 387 },

    // Across the street, small in frame — depth, and something to zoom at.
    { id: 'tour-rush-far-1', species: 'tourist-woman', at: { section: 'rush', u: 0.30, offset: -17.5 }, rotationY: -1.4, seed: 361 },
    { id: 'old-rush-far', species: 'old-man', at: { section: 'rush', u: 0.44, offset: -18.5 }, rotationY: -1.2, seed: 362 },
    { id: 'tour-rush-far-2', species: 'tourist-man', at: { section: 'rush', u: 0.62, offset: -17.0 }, rotationY: -1.5, seed: 363 },
    { id: 'esc-rush-far', species: 'escort', at: { section: 'rush', u: 0.75, offset: -18.0 }, rotationY: -1.3, seed: 364 },

    { id: 'old-tri', species: 'old-man', at: { section: 'triangle', u: 0.3, offset: -3.0 }, rotationY: -0.8, seed: 341 },
    { id: 'esc-tri', species: 'escort', at: { section: 'triangle', u: 0.35, offset: -4.5 }, rotationY: -0.6, seed: 342 },
    { id: 'tour-tri', species: 'tourist-woman', at: { section: 'triangle', u: 0.5, offset: 3.3 }, rotationY: 2.0, seed: 343 },

    // At the bar. `offset` is metres LEFT of travel and the counter runs down
    // the right, so these sit along it with a couple of staff behind.
    // — Traffic. Vehicles sit in the carriageway, which with the route on the
    //   centreline means offsets inside about seven metres; anything wider is
    //   parked on the pavement. Lanes are roughly ±2.5 and ±5.5. —
    { id: 'bus-mich-1', species: 'bus', at: { section: 'michigan', u: 0.22, offset: 3.0 }, rotationY: Math.PI, alignToRoute: true, seed: 401 },
    { id: 'bus-mich-2', species: 'bus', at: { section: 'michigan', u: 0.78, offset: -3.0 }, rotationY: 0, alignToRoute: true, seed: 402 },
    { id: 'bus-lsd', species: 'bus', at: { section: 'lakeshore', u: 0.55, offset: 3.2 }, rotationY: Math.PI, alignToRoute: true, seed: 403 },

    { id: 'sedan-mich-1', species: 'sedan', at: { section: 'michigan', u: 0.12, offset: -2.6 }, rotationY: 0, alignToRoute: true, seed: 410 },
    { id: 'sedan-mich-2', species: 'sedan', at: { section: 'michigan', u: 0.44, offset: 5.4 }, rotationY: Math.PI, alignToRoute: true, seed: 411 },
    { id: 'sedan-mich-3', species: 'sedan', at: { section: 'michigan', u: 0.66, offset: -5.4 }, rotationY: 0, alignToRoute: true, seed: 412 },
    { id: 'sedan-del-1', species: 'sedan', at: { section: 'delaware', u: 0.30, offset: 2.7 }, rotationY: Math.PI, alignToRoute: true, seed: 413 },
    { id: 'sedan-del-2', species: 'sedan', at: { section: 'delaware', u: 0.72, offset: -2.7 }, rotationY: 0, alignToRoute: true, seed: 414 },
    { id: 'sedan-rush-1', species: 'sedan', at: { section: 'rush', u: 0.18, offset: -2.6 }, rotationY: 0, alignToRoute: true, seed: 415 },
    { id: 'sedan-rush-2', species: 'sedan', at: { section: 'rush', u: 0.66, offset: 2.6 }, rotationY: Math.PI, alignToRoute: true, seed: 416 },
    { id: 'sedan-lsd', species: 'sedan', at: { section: 'lakeshore', u: 0.30, offset: -3.0 }, rotationY: 0, alignToRoute: true, seed: 417 },

    // Black SUVs idle outside the restaurants, which is most of what parks on
    // Rush Street after dark.
    { id: 'suv-rush-1', species: 'suv', at: { section: 'rush', u: 0.36, offset: -6.4 }, rotationY: 0, alignToRoute: true, seed: 420 },
    { id: 'suv-rush-2', species: 'suv', at: { section: 'rush', u: 0.58, offset: -6.4 }, rotationY: 0, alignToRoute: true, seed: 421 },
    { id: 'suv-rush-3', species: 'suv', at: { section: 'rush', u: 0.84, offset: 6.4 }, rotationY: Math.PI, alignToRoute: true, seed: 422 },
    { id: 'suv-mich', species: 'suv', at: { section: 'michigan', u: 0.55, offset: 6.2 }, rotationY: Math.PI, alignToRoute: true, seed: 423 },

    { id: 'uber-mich', species: 'rideshare', at: { section: 'michigan', u: 0.34, offset: -6.2 }, rotationY: 0, alignToRoute: true, seed: 430 },
    { id: 'uber-rush', species: 'rideshare', at: { section: 'rush', u: 0.47, offset: -6.2 }, rotationY: 0, alignToRoute: true, seed: 431 },
    { id: 'uber-del', species: 'rideshare', at: { section: 'delaware', u: 0.52, offset: 6.0 }, rotationY: Math.PI, alignToRoute: true, seed: 432 },
    { id: 'dash-car-mich', species: 'delivery-car', at: { section: 'michigan', u: 0.72, offset: -6.2 }, rotationY: 0, alignToRoute: true, seed: 433 },
    { id: 'dash-car-rush', species: 'delivery-car', at: { section: 'rush', u: 0.28, offset: 6.2 }, rotationY: Math.PI, alignToRoute: true, seed: 434 },

    { id: 'squad-mich', species: 'police-car', at: { section: 'michigan', u: 0.50, offset: -6.4 }, rotationY: 0, alignToRoute: true, seed: 440 },
    { id: 'squad-tri', species: 'police-car', at: { section: 'triangle', u: 0.30, offset: -5.6 }, rotationY: 0, alignToRoute: true, seed: 441 },
    { id: 'squad-lsd', species: 'police-car', at: { section: 'lakeshore', u: 0.72, offset: 5.6 }, rotationY: Math.PI, alignToRoute: true, seed: 442 },

    // More traffic. A city street is not three cars: these fill the lanes and
    // the kerbside on every block, and the body colour comes from the placement
    // seed so no two are the same car.
    { id: 'sedan-mich-4', species: 'sedan', at: { section: 'michigan', u: 0.06, offset: 5.4 }, rotationY: Math.PI, alignToRoute: true, seed: 501 },
    { id: 'sedan-mich-5', species: 'sedan', at: { section: 'michigan', u: 0.19, offset: -6.5 }, rotationY: 0, alignToRoute: true, seed: 502 },
    { id: 'sedan-mich-6', species: 'sedan', at: { section: 'michigan', u: 0.27, offset: 2.7 }, rotationY: Math.PI, alignToRoute: true, seed: 503 },
    { id: 'sedan-mich-7', species: 'sedan', at: { section: 'michigan', u: 0.38, offset: -2.6 }, rotationY: 0, alignToRoute: true, seed: 504 },
    { id: 'sedan-mich-8', species: 'sedan', at: { section: 'michigan', u: 0.49, offset: 6.5 }, rotationY: Math.PI, alignToRoute: true, seed: 505 },
    { id: 'sedan-mich-9', species: 'sedan', at: { section: 'michigan', u: 0.60, offset: 2.7 }, rotationY: Math.PI, alignToRoute: true, seed: 506 },
    { id: 'sedan-mich-10', species: 'sedan', at: { section: 'michigan', u: 0.74, offset: 5.4 }, rotationY: Math.PI, alignToRoute: true, seed: 507 },
    { id: 'sedan-mich-11', species: 'sedan', at: { section: 'michigan', u: 0.83, offset: -6.5 }, rotationY: 0, alignToRoute: true, seed: 508 },
    { id: 'sedan-mich-12', species: 'sedan', at: { section: 'michigan', u: 0.92, offset: -2.6 }, rotationY: 0, alignToRoute: true, seed: 509 },

    { id: 'sedan-del-3', species: 'sedan', at: { section: 'delaware', u: 0.10, offset: -6.3 }, rotationY: 0, alignToRoute: true, seed: 510 },
    { id: 'sedan-del-4', species: 'sedan', at: { section: 'delaware', u: 0.20, offset: 6.3 }, rotationY: Math.PI, alignToRoute: true, seed: 511 },
    { id: 'sedan-del-5', species: 'sedan', at: { section: 'delaware', u: 0.44, offset: -2.7 }, rotationY: 0, alignToRoute: true, seed: 512 },
    { id: 'sedan-del-6', species: 'sedan', at: { section: 'delaware', u: 0.58, offset: -6.3 }, rotationY: 0, alignToRoute: true, seed: 513 },
    { id: 'sedan-del-7', species: 'sedan', at: { section: 'delaware', u: 0.82, offset: 6.3 }, rotationY: Math.PI, alignToRoute: true, seed: 514 },
    { id: 'sedan-del-8', species: 'sedan', at: { section: 'delaware', u: 0.92, offset: 2.7 }, rotationY: Math.PI, alignToRoute: true, seed: 515 },

    { id: 'sedan-rush-3', species: 'sedan', at: { section: 'rush', u: 0.08, offset: 6.4 }, rotationY: Math.PI, alignToRoute: true, seed: 520 },
    { id: 'sedan-rush-4', species: 'sedan', at: { section: 'rush', u: 0.22, offset: -6.4 }, rotationY: 0, alignToRoute: true, seed: 521 },
    { id: 'sedan-rush-5', species: 'sedan', at: { section: 'rush', u: 0.33, offset: 2.6 }, rotationY: Math.PI, alignToRoute: true, seed: 522 },
    { id: 'sedan-rush-6', species: 'sedan', at: { section: 'rush', u: 0.44, offset: -2.6 }, rotationY: 0, alignToRoute: true, seed: 523 },
    { id: 'sedan-rush-7', species: 'sedan', at: { section: 'rush', u: 0.53, offset: 6.4 }, rotationY: Math.PI, alignToRoute: true, seed: 524 },
    { id: 'sedan-rush-8', species: 'sedan', at: { section: 'rush', u: 0.62, offset: -6.4 }, rotationY: 0, alignToRoute: true, seed: 525 },
    { id: 'sedan-rush-9', species: 'sedan', at: { section: 'rush', u: 0.74, offset: 2.6 }, rotationY: Math.PI, alignToRoute: true, seed: 526 },
    { id: 'sedan-rush-10', species: 'sedan', at: { section: 'rush', u: 0.88, offset: -6.4 }, rotationY: 0, alignToRoute: true, seed: 527 },
    { id: 'sedan-rush-11', species: 'sedan', at: { section: 'rush', u: 0.95, offset: 6.4 }, rotationY: Math.PI, alignToRoute: true, seed: 528 },

    { id: 'sedan-lsd-2', species: 'sedan', at: { section: 'lakeshore', u: 0.62, offset: -6.2 }, rotationY: 0, alignToRoute: true, seed: 530 },
    { id: 'sedan-lsd-3', species: 'sedan', at: { section: 'lakeshore', u: 0.86, offset: 2.8 }, rotationY: Math.PI, alignToRoute: true, seed: 531 },
    { id: 'sedan-tri-1', species: 'sedan', at: { section: 'triangle', u: 0.18, offset: 5.8 }, rotationY: Math.PI, alignToRoute: true, seed: 532 },
    { id: 'sedan-tri-2', species: 'sedan', at: { section: 'triangle', u: 0.66, offset: -5.8 }, rotationY: 0, alignToRoute: true, seed: 533 },
    { id: 'sedan-tri-3', species: 'sedan', at: { section: 'triangle', u: 0.86, offset: 2.6 }, rotationY: Math.PI, alignToRoute: true, seed: 534 },

    { id: 'suv-mich-2', species: 'suv', at: { section: 'michigan', u: 0.31, offset: -6.4 }, rotationY: 0, alignToRoute: true, seed: 540 },
    { id: 'suv-del', species: 'suv', at: { section: 'delaware', u: 0.68, offset: -6.4 }, rotationY: 0, alignToRoute: true, seed: 541 },
    { id: 'suv-rush-4', species: 'suv', at: { section: 'rush', u: 0.14, offset: -6.4 }, rotationY: 0, alignToRoute: true, seed: 542 },
    { id: 'suv-rush-5', species: 'suv', at: { section: 'rush', u: 0.71, offset: -6.4 }, rotationY: 0, alignToRoute: true, seed: 543 },

    { id: 'uber-mich-2', species: 'rideshare', at: { section: 'michigan', u: 0.58, offset: 6.2 }, rotationY: Math.PI, alignToRoute: true, seed: 550 },
    { id: 'uber-rush-2', species: 'rideshare', at: { section: 'rush', u: 0.80, offset: 6.2 }, rotationY: Math.PI, alignToRoute: true, seed: 551 },
    { id: 'uber-tri', species: 'rideshare', at: { section: 'triangle', u: 0.48, offset: -5.8 }, rotationY: 0, alignToRoute: true, seed: 552 },
    { id: 'dash-car-del', species: 'delivery-car', at: { section: 'delaware', u: 0.36, offset: 6.2 }, rotationY: Math.PI, alignToRoute: true, seed: 553 },

    // — Riders. In the bike lane, which is the outside of the carriageway. —
    { id: 'cyc-mich-1', species: 'cyclist', at: { section: 'michigan', u: 0.28, offset: -7.2 }, rotationY: 0, alignToRoute: true, seed: 450 },
    { id: 'cyc-mich-2', species: 'cyclist', at: { section: 'michigan', u: 0.62, offset: 7.2 }, rotationY: Math.PI, alignToRoute: true, seed: 451 },
    { id: 'cyc-del', species: 'cyclist', at: { section: 'delaware', u: 0.40, offset: -6.8 }, rotationY: 0, alignToRoute: true, seed: 452 },
    { id: 'cyc-rush', species: 'cyclist', at: { section: 'rush', u: 0.70, offset: -7.0 }, rotationY: 0, alignToRoute: true, seed: 453 },
    { id: 'cyc-lsd', species: 'cyclist', at: { section: 'lakeshore', u: 0.44, offset: -6.6 }, rotationY: 0, alignToRoute: true, seed: 454 },

    { id: 'dash-bike-mich', species: 'delivery-rider', at: { section: 'michigan', u: 0.40, offset: 7.0 }, rotationY: Math.PI, alignToRoute: true, seed: 460 },
    { id: 'dash-bike-rush-1', species: 'delivery-rider', at: { section: 'rush', u: 0.24, offset: -7.0 }, rotationY: 0, alignToRoute: true, seed: 461 },
    { id: 'dash-bike-rush-2', species: 'delivery-rider', at: { section: 'rush', u: 0.78, offset: 7.0 }, rotationY: Math.PI, alignToRoute: true, seed: 462 },
    { id: 'dash-bike-del', species: 'delivery-rider', at: { section: 'delaware', u: 0.62, offset: 6.8 }, rotationY: Math.PI, alignToRoute: true, seed: 463 },

    // — Police on foot, and the mounted pair the Triangle is known for. —
    { id: 'cop-mich-1', species: 'police', at: { section: 'michigan', u: 0.20, offset: 9.4 }, rotationY: 1.7, seed: 470 },
    { id: 'cop-mich-2', species: 'police', at: { section: 'michigan', u: 0.68, offset: -9.6 }, rotationY: -1.5, seed: 471 },
    { id: 'cop-rush', species: 'police', at: { section: 'rush', u: 0.40, offset: -9.2 }, rotationY: -1.4, seed: 472 },
    { id: 'cop-tri', species: 'police', at: { section: 'triangle', u: 0.55, offset: 8.8 }, rotationY: 1.6, seed: 473 },
    { id: 'cop-beach', species: 'police', at: { section: 'beach', u: 0.60, offset: -8.0 }, rotationY: -1.3, seed: 474 },

    { id: 'mounted-tri', species: 'mounted-police', at: { section: 'triangle', u: 0.42, offset: 9.6 }, rotationY: 1.8, seed: 480 },
    { id: 'mounted-mich', species: 'mounted-police', at: { section: 'michigan', u: 0.86, offset: 10.2 }, rotationY: 1.6, seed: 481 },

    // — Office crowd. Michigan and Delaware are lined with offices above the
    //   shops, so this is most of who is actually on the pavement at this hour.
    { id: 'biz-mich-1', species: 'business-man', at: { section: 'michigan', u: 0.09, offset: 9.8 }, rotationY: 1.6, seed: 620 },
    { id: 'biz-mich-2', species: 'business-woman', at: { section: 'michigan', u: 0.11, offset: 11.4 }, rotationY: 1.7, seed: 621 },
    { id: 'biz-mich-3', species: 'business-man', at: { section: 'michigan', u: 0.24, offset: -9.6 }, rotationY: -1.5, seed: 622 },
    { id: 'biz-mich-4', species: 'business-woman', at: { section: 'michigan', u: 0.33, offset: 10.2 }, rotationY: 1.4, seed: 623 },
    { id: 'biz-mich-5', species: 'business-man', at: { section: 'michigan', u: 0.42, offset: -11.0 }, rotationY: -1.7, seed: 624 },
    { id: 'biz-mich-6', species: 'business-woman', at: { section: 'michigan', u: 0.51, offset: -9.4 }, rotationY: -1.3, seed: 625 },
    { id: 'biz-mich-7', species: 'business-man', at: { section: 'michigan', u: 0.63, offset: 9.6 }, rotationY: 1.8, seed: 626 },
    { id: 'biz-mich-8', species: 'business-woman', at: { section: 'michigan', u: 0.71, offset: 11.2 }, rotationY: 1.5, seed: 627 },
    { id: 'biz-mich-9', species: 'business-man', at: { section: 'michigan', u: 0.80, offset: -10.4 }, rotationY: -1.6, seed: 628 },
    { id: 'biz-mich-10', species: 'business-woman', at: { section: 'michigan', u: 0.90, offset: -9.2 }, rotationY: -1.4, seed: 629 },

    { id: 'biz-del-1', species: 'business-woman', at: { section: 'delaware', u: 0.14, offset: 9.6 }, rotationY: 1.6, seed: 630 },
    { id: 'biz-del-2', species: 'business-man', at: { section: 'delaware', u: 0.27, offset: -9.8 }, rotationY: -1.5, seed: 631 },
    { id: 'biz-del-3', species: 'business-man', at: { section: 'delaware', u: 0.48, offset: 10.4 }, rotationY: 1.7, seed: 632 },
    { id: 'biz-del-4', species: 'business-woman', at: { section: 'delaware', u: 0.66, offset: -10.2 }, rotationY: -1.6, seed: 633 },
    { id: 'biz-del-5', species: 'business-man', at: { section: 'delaware', u: 0.86, offset: 9.4 }, rotationY: 1.4, seed: 634 },

    { id: 'biz-lsd-1', species: 'business-man', at: { section: 'lakeshore', u: 0.28, offset: 8.8 }, rotationY: 1.6, seed: 635 },
    { id: 'biz-lsd-2', species: 'business-woman', at: { section: 'lakeshore', u: 0.66, offset: -8.6 }, rotationY: -1.5, seed: 636 },
    { id: 'biz-rush-1', species: 'business-man', at: { section: 'rush', u: 0.19, offset: -9.2 }, rotationY: -1.5, seed: 637 },
    { id: 'biz-rush-2', species: 'business-woman', at: { section: 'rush', u: 0.64, offset: 9.6 }, rotationY: 1.6, seed: 638 },

    // — Rats. Underpass and alley, at the foot of a wall, which is where you
    //   see them. Placed in twos and threes so a stretch of kerb is worth
    //   watching rather than one exact spot. —
    { id: 'rat-tunnel-1', species: 'rat', at: { section: 'underpass', u: 0.30, offset: 4.4 }, rotationY: 1.4, seed: 601 },
    { id: 'rat-tunnel-2', species: 'rat', at: { section: 'underpass', u: 0.44, offset: -4.4 }, rotationY: -1.6, seed: 602 },
    { id: 'rat-tunnel-3', species: 'rat', at: { section: 'underpass', u: 0.52, offset: -4.0 }, rotationY: -1.2, seed: 603 },
    { id: 'rat-tunnel-4', species: 'rat', at: { section: 'underpass', u: 0.61, offset: 4.2 }, rotationY: 1.8, seed: 604 },
    { id: 'rat-tunnel-5', species: 'rat', at: { section: 'underpass', u: 0.76, offset: -4.4 }, rotationY: -1.5, seed: 605 },

    { id: 'rat-alley-1', species: 'rat', at: { section: 'alley', u: 0.22, offset: 3.0 }, rotationY: 1.5, seed: 610 },
    { id: 'rat-alley-2', species: 'rat', at: { section: 'alley', u: 0.38, offset: -3.2 }, rotationY: -1.4, seed: 611 },
    { id: 'rat-alley-3', species: 'rat', at: { section: 'alley', u: 0.55, offset: 3.2 }, rotationY: 1.7, seed: 612 },
    { id: 'rat-alley-4', species: 'rat', at: { section: 'alley', u: 0.72, offset: -3.0 }, rotationY: -1.6, seed: 613 },

    // — Rough sleepers. The underpass and the quieter blocks, against the wall
    //   rather than in the middle of the pavement. —
    { id: 'rs-tunnel', species: 'homeless', at: { section: 'underpass', u: 0.62, offset: 3.4 }, rotationY: 1.5, seed: 490 },
    { id: 'rs-mich-1', species: 'homeless', at: { section: 'michigan', u: 0.36, offset: 11.5 }, rotationY: 1.7, seed: 491 },
    { id: 'rs-mich-2', species: 'homeless', at: { section: 'michigan', u: 0.76, offset: -11.5 }, rotationY: -1.6, seed: 492 },
    { id: 'rs-del', species: 'homeless', at: { section: 'delaware', u: 0.24, offset: -10.5 }, rotationY: -1.5, seed: 493 },
    { id: 'rs-rush', species: 'homeless', at: { section: 'rush', u: 0.56, offset: 10.8 }, rotationY: 1.6, seed: 494 },
    { id: 'rs-lsd', species: 'homeless', at: { section: 'lakeshore', u: 0.20, offset: 9.8 }, rotationY: 1.5, seed: 495 },

    { id: 'old-bar-1', species: 'old-man', at: { section: 'inside', u: 0.60, offset: -2.0 }, rotationY: -1.4, seed: 351 },
    { id: 'esc-bar-1', species: 'escort', at: { section: 'inside', u: 0.63, offset: -2.0 }, rotationY: -1.5, seed: 352 },
    { id: 'old-bar-2', species: 'old-man', at: { section: 'inside', u: 0.74, offset: -2.0 }, rotationY: -1.3, seed: 353 },
    { id: 'esc-bar-2', species: 'escort', at: { section: 'inside', u: 0.77, offset: -2.0 }, rotationY: -1.6, seed: 354 },
    { id: 'tour-bar', species: 'tourist-woman', at: { section: 'inside', u: 0.88, offset: -2.1 }, rotationY: -1.4, seed: 355 },
    { id: 'door-bar', species: 'doorman', at: { section: 'inside', u: 0.70, offset: -3.5 }, rotationY: 1.6, seed: 356 },
    { id: 'esc-bar-3', species: 'escort', at: { section: 'inside', u: 0.93, offset: 3.0 }, rotationY: 1.9, seed: 357 },
  ],
}


export const ROUTES: Record<string, RouteDef> = {
  goldcoast: GOLD_COAST,
}

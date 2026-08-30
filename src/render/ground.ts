/**
 * Procedural ground surfaces, computed in the fragment shader.
 *
 * The buildings got their density from `facade.ts` and the characters got
 * theirs from the atlas, which left the ground as the only large surface in
 * frame still rendering as flat vertex-interpolated colour — and on a street
 * camera the ground is usually a third of the picture. Jet Set Radio Future
 * paves its streets with hard-edged graphic shapes: chunky slabs, bold painted
 * markings, banded water. None of it is photographic noise, which is why grain
 * or a detail texture would have been the wrong tool.
 *
 * Same technique as the facades, for the same reasons: no image assets, no
 * texture memory, sharp at any distance, and the whole 540 m route stays one
 * draw call.
 *
 * Inputs are two vertex attributes written in `environment.ts`:
 *   aGround  — metres from the route centreline, metres along the route
 *   aSurface — which material this vertex is (see SURFACE)
 *
 * Metres, not UVs: a paving slab has to be the same size on a 4 m alley and a
 * 38 m avenue, and road markings have to sit at real distances from the
 * centreline.
 */

/**
 * Surface kinds, as plain numbers because they travel through a float vertex
 * attribute.
 *
 * These interpolate across a quad, which is deliberate: a quad whose two edges
 * share a kind is a solid band of that material, and a quad whose edges differ
 * is a *boundary* — a kerb, a shoreline, a lawn edge. The shader reads the
 * blend to place the treatment that belongs there, so boundaries need no
 * separate geometry and no separate draw call.
 */
export const SURFACE = {
  sand: 0,
  asphalt: 1,
  sidewalk: 2,
  water: 3,
  park: 4,
  interior: 5,
  concrete: 6,
  /**
   * One carriageway of a divided road.
   *
   * Asphalt in every respect except that it carries no centre line. Michigan
   * Avenue and Lake Shore Drive are mapped as two parallel ways, and each of
   * them was drawing a double yellow down its own middle — so the player walked
   * a pavement with a centre line painted right against the kerb, and the road
   * read as two streets with a median rather than one divided one.
   */
  oneWay: 7,
} as const

export type SurfaceKind = (typeof SURFACE)[keyof typeof SURFACE]

export const GROUND_PARS_VERTEX = /* glsl */ `
  attribute vec2 aGround;
  attribute float aSurface;
  varying vec2 vGround;
  varying float vSurface;
`

export const GROUND_VERTEX = /* glsl */ `
  vGround = aGround;
  vSurface = aSurface;
`

export const GROUND_PARS_FRAGMENT = /* glsl */ `
  varying vec2 vGround;
  varying float vSurface;

  uniform float uSlab;
  uniform vec3 uJoint;
  uniform vec3 uRoadPaint;
  uniform vec3 uRoadCentre;
  uniform vec3 uFoam;
  uniform vec3 uKerbDark;
  uniform vec3 uKerbLight;
  uniform float uMarkings;

  float groundHash(vec2 cell, float seed) {
    return fract(sin(dot(cell, vec2(269.5, 183.3)) + seed * 57.13) * 43758.5453);
  }

  /** 1 inside [a, b], 0 outside, with a soft edge of half-width 'soft'. */
  float gband(float x, float a, float b, float soft) {
    return smoothstep(a - soft, a + soft, x) * (1.0 - smoothstep(b - soft, b + soft, x));
  }

  /**
   * Quantise to 'steps' discrete levels.
   *
   * The single most important line in this file for matching the reference.
   * Continuous variation reads as photographic grain no matter how subtle it
   * is; the same variation snapped to three levels reads as a decision someone
   * made with a paint bucket.
   */
  float posterize(float x, float steps) {
    return floor(x * steps) / max(1.0, steps - 1.0);
  }
`

export const GROUND_FRAGMENT = /* glsl */ `
{
  float u = vGround.x;
  float s = vGround.y;

  // Screen-space derivatives set every soft edge, so slab joints and lane
  // markings anti-alias into the distance instead of shimmering into moire.
  float soft = fwidth(s) * 0.6 + 0.003;

  float k = vSurface;
  // Rounded, so floating-point drift inside a solid band can never pick the
  // neighbouring material.
  float kind = floor(k + 0.5);
  float kLo = floor(k + 0.001);
  float f = clamp(k - kLo, 0.0, 1.0);

  // A solid band holds one kind, so its derivative is zero; only a boundary
  // quad varies. Testing the derivative rather than the value means a band
  // sitting at 1.9999 instead of 2.0 can't paint itself a phantom kerb.
  float boundary = step(0.0008, fwidth(k));

  vec3 c = diffuseColor.rgb;

  if (kind < 0.5) {
    // --- sand ---
    // Coarse patches first. Ripples alone vary only across the beach, so
    // looking *along* the shore — which is most of this section — they run away
    // to the vanishing point and read as two enormous soft bands rather than as
    // a pattern. Blocks read from every angle.
    vec2 sandCell = floor(vec2(u, s) / 3.4);
    c *= mix(0.93, 1.07, step(0.5, groundHash(sandCell, 4.7)));

    // Ripples, at a short enough period to survive being seen end-on.
    float rArg = u * 1.9 + sin(s * 0.35) * 1.1 + sin(s * 0.08) * 2.6;
    // Softened by the derivative of the ripple's own phase, so distant sand
    // averages to flat instead of tearing into moire.
    float rw = fwidth(rArg) + 0.02;
    float ripple = smoothstep(0.05 - rw, 0.05 + rw, sin(rArg));
    c *= mix(0.89, 1.11, ripple);

    // Broad tide marks parallel to the water, snapped to three flat tones.
    float tideBand = posterize(
      fract(u * 0.035 + sin(s * 0.02) * 0.35 + sin(s * 0.006) * 0.8),
      3.0
    );
    c *= mix(0.92, 1.06, tideBand);

    // Sparse debris. One cell in twenty, so it reads as litter on a beach
    // rather than as texture.
    vec2 cell = floor(vec2(u, s) / 1.3);
    float h = groundHash(cell, 5.3);
    vec2 g = fract(vec2(u, s) / 1.3) - 0.5;
    float speck = step(0.955, h) * (1.0 - smoothstep(0.10, 0.16, length(g)));
    c = mix(c, c * 0.70, speck);

  } else if (kind < 1.5 || kind > 6.5) {
    // --- asphalt ---
    // Patches, posterized hard. Real road surface is a quilt of repairs, and
    // two flat tones of it break up a large area far better than noise.
    // 'patch' is a reserved word in GLSL ES 3.0 and fails to compile.
    vec2 patchCell = floor(vec2(u, s) / 5.5 + vec2(0.0, groundHash(floor(vec2(u / 5.5, 0.0)), 2.0)));
    c *= mix(0.87, 1.10, step(0.5, groundHash(patchCell, 11.7)));

    // Double yellow: ONE band, mirrored by abs(u), which is two lines. Two
    // bands mirrored is four lines, which is not a marking that exists.
    //
    // Suppressed on one carriageway of a divided road: both its lanes run the
    // same way, so there is nothing for a centre line to divide.
    float divided = step(6.5, kind);
    float centre = gband(abs(u), 0.07, 0.20, soft);
    c = mix(c, uRoadCentre, centre * uMarkings * (1.0 - divided));

    // Dashed lane lines: about 3 m of paint every 7 m.
    float dash = step(0.56, fract(s / 7.0));
    float lane = gband(abs(abs(u) - 2.95), 0.0, 0.08, soft) * dash;
    c = mix(c, uRoadPaint, lane * uMarkings * 0.9);


  } else if (kind < 2.5) {
    // --- sidewalk ---
    // Chicago pours its pavements in big square slabs, and that grid is the
    // most recognisable thing about walking down one.
    vec2 q = vec2(u, s) / uSlab;
    vec2 cell = floor(q);
    vec2 g = fract(q);
    vec2 gw = fwidth(q) * 0.8 + 0.002;

    float joint = max(
      1.0 - gband(g.x, 0.03, 0.97, gw.x),
      1.0 - gband(g.y, 0.03, 0.97, gw.y)
    );

    // Three tones, not a gradient — see posterize().
    float tone = posterize(groundHash(cell, 3.1), 3.0);
    c *= mix(0.90, 1.10, tone);

    // One slab in twenty is a replacement: a flat darker patch, no blend.
    c *= mix(1.0, 0.80, step(0.95, groundHash(cell, 19.4)));

    c = mix(c, uJoint, joint * 0.62);

  } else if (kind < 3.5) {
    // --- water ---
    // Bands parallel to the shore, hard-edged. Lake Michigan at dawn is flat
    // enough that this is close to true, and it matches the way the reference
    // draws water as stacked ribbons of flat colour.
    float swell = sin(u * 0.115 + sin(s * 0.028) * 2.2);
    c = mix(c, c * 1.22, step(0.25, swell));
    c = mix(c, c * 0.86, step(0.55, -swell));
    float crest = step(0.55, sin(u * 0.047 - sin(s * 0.016) * 1.5));
    c = mix(c, uFoam, crest * 0.16);

  } else if (kind < 4.5) {
    // --- park lawn ---
    // Mown stripes, running across the path.
    c *= mix(0.90, 1.09, step(0.5, fract(s / 4.0)));
    // A second, wider pass at an angle to the first, the way a mower actually
    // leaves a lawn. One set of stripes alone reads as a printing error.
    c *= mix(0.96, 1.04, step(0.5, fract((s + u * 2.2) / 11.0)));

  } else if (kind < 5.5) {
    // --- interior floorboards ---
    float plank = 0.17;
    float across = u / plank;
    float seam = 1.0 - gband(fract(across), 0.05, 0.95, fwidth(across) * 0.8 + 0.01);
    // Butt joints stagger per plank, so the floor doesn't read as one long
    // sheet scored with lines.
    float row = floor(across);
    float along = s / 1.9 + groundHash(vec2(row, 0.0), 7.7);
    float butt = 1.0 - gband(fract(along), 0.02, 0.98, fwidth(along) * 0.8 + 0.01);
    c *= mix(1.0, 0.9, posterize(groundHash(vec2(row, floor(along)), 4.2), 3.0));
    c = mix(c, c * 0.55, max(seam, butt));

  } else {
    // --- concrete: tunnel floor and alley ---
    float slab = 2.4;
    float along = s / slab;
    float joint = 1.0 - gband(fract(along), 0.02, 0.98, fwidth(along) * 0.8 + 0.01);
    c = mix(c, uJoint, joint * 0.45);
    // Drainage channel down the middle.
    c *= 1.0 - gband(abs(u), 0.0, 0.13, soft) * 0.30;
    // Grime creeping out from the walls — an alley is 5 m wide and this is most
    // of what makes it feel like the back of a building.
    c *= 1.0 - smoothstep(1.5, 2.6, abs(u)) * 0.22;
  }

  // --- boundaries between two materials ---
  // 'f' runs 0 -> 1 toward the higher-numbered kind regardless of which side of
  // the route the boundary is on, so these read the same on both kerbs.
  if (boundary > 0.5) {
    float lo = kLo;

    if (lo < 0.5 && kind > 2.5) {
      // sand → water: a wet line and foam, wandering along the shore.
      float edge = 0.34 + 0.15 * sin(s * 0.055) + 0.07 * sin(s * 0.171);
      c *= 1.0 - gband(f, edge - 0.30, edge, 0.05) * 0.12;
      c = mix(c, uFoam, gband(f, edge - 0.13, edge, 0.045) * 0.8);

    } else if (lo > 0.5 && lo < 1.5) {
      // asphalt → sidewalk: the kerb. A shadow at the road side and a lit top
      // edge, which together give the pavement its height without geometry.
      c = mix(c, uKerbDark, (1.0 - smoothstep(0.0, 0.42, f)) * 0.55);
      c = mix(c, uKerbLight, smoothstep(0.5, 0.78, f) * 0.4);

    } else {
      // Everything else (lawn edging, floor changes) gets a plain scribed line.
      c = mix(c, uJoint, gband(f, 0.3, 0.62, 0.09) * 0.4);
    }
  }

  diffuseColor.rgb = c;
}
`

export interface GroundOptions {
  /** Paving slab size in metres. */
  slab?: number
  joint?: number
  roadPaint?: number
  roadCentre?: number
  foam?: number
  kerbDark?: number
  kerbLight?: number
  /** Strength of painted road markings, 0–1. */
  markings?: number
}

export const GROUND_DEFAULTS: Required<GroundOptions> = {
  // Chicago's standard sidewalk square is close to five feet.
  slab: 1.5,
  joint: 0x5f5a51,
  roadPaint: 0xd8d4c6,
  roadCentre: 0xd2ab45,
  foam: 0xe8eef0,
  kerbDark: 0x2b2d33,
  kerbLight: 0xbdb5a4,
  markings: 0.85,
}

/**
 * Procedural building facades, computed in the fragment shader.
 *
 * The single biggest visual gap against the Jet Set Radio reference was that a
 * mile of accurate Chicago geometry rendered as flat grey solids. In that
 * reference the geometry is boxes and *all* the density is surface — so surface
 * is what was missing, not detail.
 *
 * Done in-shader rather than with textures because it costs nothing this game
 * has to spend: no image assets to author or download, no texture memory, no
 * atlas packing, no extra draw calls, and it stays sharp at any distance. The
 * whole city remains one mesh.
 *
 * Inputs come from two vertex attributes written in `city.ts`:
 *   aFacade — metres along the wall, metres above grade
 *   aMeta   — wall height, per-building seed, roof flag
 *
 * Metres matter: normalised UVs would give a 6 m shopfront the same number of
 * windows as a 60 m frontage.
 */

export const FACADE_PARS_VERTEX = /* glsl */ `
  attribute vec2 aFacade;
  attribute vec3 aMeta;
  varying vec2 vFacade;
  varying vec3 vMeta;
`

export const FACADE_VERTEX = /* glsl */ `
  vFacade = aFacade;
  vMeta = aMeta;
`

export const FACADE_PARS_FRAGMENT = /* glsl */ `
  varying vec2 vFacade;
  varying vec3 vMeta;

  uniform float uFloorHeight;
  uniform float uBayWidth;
  uniform float uGroundHeight;
  uniform vec3 uWindowDark;
  uniform vec3 uWindowLit;
  uniform vec3 uTrim;
  uniform float uLitChance;

  float facadeHash(vec2 cell, float seed) {
    return fract(sin(dot(cell, vec2(127.1, 311.7)) + seed * 91.7) * 43758.5453);
  }

  /** 1 inside [a, b], 0 outside, with a half-pixel-ish soft edge. */
  float band(float x, float a, float b, float soft) {
    return smoothstep(a - soft, a + soft, x) * (1.0 - smoothstep(b - soft, b + soft, x));
  }
`

/**
 * Modulates `diffuseColor` with the facade pattern and returns the emissive
 * contribution for lit windows.
 *
 * Runs after `<color_fragment>`, so it composes over the per-building vertex
 * colour rather than replacing it — the palette still carries the material, and
 * the windows sit on top.
 */
export const FACADE_FRAGMENT = /* glsl */ `
  vec3 facadeEmissive = vec3(0.0);

  // Roofs are flagged in the vertex data; they get no fenestration.
  if (vMeta.z < 0.5) {
    float wallHeight = vMeta.x;
    float seed = vMeta.y;
    float u = vFacade.x;
    float v = vFacade.y;

    // Per-building rhythm. Without this every facade shares one window grid and
    // the street reads as a single repeated texture — which is exactly the
    // failure mode that makes procedural cities look procedural.
    float bayWidth = uBayWidth * (0.80 + 0.42 * fract(seed * 7.31));
    float floorHeight = uFloorHeight * (0.88 + 0.28 * fract(seed * 3.17));
    // Taller buildings get taller ground floors — lobbies, not shopfronts.
    float groundHeight = uGroundHeight * (0.85 + 0.5 * clamp(wallHeight / 120.0, 0.0, 1.0));

    // Screen-space derivative sets the softness, so windows anti-alias at
    // distance instead of shimmering into moire.
    float soft = fwidth(v) * 0.9 + 0.02;

    // --- ground floor: taller, mostly glazed, mullions on the bay rhythm ---
    if (v < groundHeight) {
      float mullion = band(fract(u / bayWidth), 0.06, 0.94, soft * 0.6);
      float glazing = band(v, 0.7, groundHeight - 0.9, soft);
      float shopfront = mullion * glazing;

      // Retail glazing reads warm and lit even at dawn — it's the layer of the
      // street closest to the player and the one that sells "open for business".
      diffuseColor.rgb = mix(diffuseColor.rgb, uWindowLit * 0.55, shopfront * 0.85);
      facadeEmissive += uWindowLit * shopfront * 0.35;

      // Plinth shadow line where the shopfront meets the sidewalk.
      diffuseColor.rgb *= 1.0 - band(v, 0.0, 0.55, soft) * 0.25;
    } else {
      // --- upper floors: a grid of punched windows ---
      float floorPos = (v - groundHeight) / floorHeight;
      float bayPos = u / bayWidth;

      vec2 cell = vec2(floor(bayPos), floor(floorPos));
      float inBay = band(fract(bayPos), 0.24, 0.76, soft * 0.5);
      float inFloor = band(fract(floorPos), 0.20, 0.74, soft * 0.5);
      float window = inBay * inFloor;

      // Deterministic per-cell lighting, biased by height so upper floors read
      // as more occupied — which is both true at dawn and useful, because it
      // gives towers a gradient instead of uniform noise.
      float lit = facadeHash(cell, seed);
      float litBias = uLitChance + floorPos * 0.004;
      float isLit = step(1.0 - litBias, lit);

      vec3 glass = mix(uWindowDark, uWindowLit, isLit);
      diffuseColor.rgb = mix(diffuseColor.rgb, glass, window * 0.9);
      facadeEmissive += uWindowLit * window * isLit * 0.55;

      // Spandrel band under each row of windows — the horizontal that stops a
      // facade reading as wallpaper.
      float spandrel = band(fract(floorPos), 0.80, 0.98, soft * 0.6);
      diffuseColor.rgb = mix(diffuseColor.rgb, uTrim, spandrel * 0.35);
    }

    // --- cornice ---
    float cornice = band(v, wallHeight - 1.8, wallHeight, soft);
    diffuseColor.rgb = mix(diffuseColor.rgb, uTrim, cornice * 0.55);

    // Vertical pier every few bays, breaking long frontages into masses.
    float pier = band(fract(u / (bayWidth * 4.0)), 0.0, 0.055, soft * 0.5);
    diffuseColor.rgb = mix(diffuseColor.rgb, uTrim, pier * 0.3);
  }
`

export interface FacadeOptions {
  floorHeight?: number
  bayWidth?: number
  groundHeight?: number
  windowDark?: number
  windowLit?: number
  trim?: number
  /** Fraction of upper-floor windows lit. Dawn, so most are not. */
  litChance?: number
}

export const FACADE_DEFAULTS: Required<FacadeOptions> = {
  floorHeight: 3.7,
  bayWidth: 3.4,
  // Chicago ground floors are generously tall — this is the retail band.
  groundHeight: 5.4,
  // Cool, because unlit glass mirrors the sky rather than going black.
  windowDark: 0x4a5b72,
  windowLit: 0xffd9a0,
  trim: 0x6d6455,
  litChance: 0.22,
}

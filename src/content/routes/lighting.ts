import type { LightingProfile } from './types'

/**
 * Lighting profiles, one per kind of place on the route.
 *
 * The route runs from open lakefront through a tunnel, down a street, and
 * finally indoors — sun-and-sky doesn't survive any of those transitions. Each
 * section names a profile and the World blends between them as the camera
 * travels, so a tunnel and a restaurant kitchen use the same mechanism rather
 * than each being a special case.
 *
 * The warm/cool axis carries the whole art direction: warm key against cool
 * shadow outdoors, inverted indoors where tungsten is the key and the cool comes
 * from daylight leaking in.
 */

/** Open lakefront at dawn. The brightest, widest moment in the route. */
export const BEACH_DAWN: LightingProfile = {
  sky: 0xa9c8e6,
  fogNear: 150,
  fogFar: 750,
  key: 0xffd9a8,
  keyIntensity: 2.4,
  skyFill: 0xb6d2ee,
  groundFill: 0xc4b393,
  fillIntensity: 1.35,
  shadowTint: 0x7c92c4,
  shadowTintStrength: 0.75,
  castShadows: true,
}

/**
 * Under Lake Shore Drive. Sodium orange against the cold daylight punching in at
 * both ends — the only place on the route with that contrast, and the reason the
 * tunnel is worth having.
 */
export const TUNNEL: LightingProfile = {
  // Daylight, not a dungeon.
  //
  // This used to dim the whole scene — dark sky, short fog — which meant the
  // one thing you can see from inside an underpass, the bright opening at the
  // far end, came out as brown murk. The sky is the sky whether or not you are
  // standing under a road.
  //
  // The darkness under the deck now comes from the deck: it casts a shadow into
  // the cut like any other solid thing, so the covered stretch reads as covered
  // because something is over it, rather than because a global multiplier says
  // so. That also means the ramps stay properly lit, which is what makes the
  // covered part read as darker at all.
  sky: 0xa4c4e2,
  fogNear: 140,
  fogFar: 900,
  key: 0xffdcb4,
  keyIntensity: 2.0,
  // A warm bounce off concrete walls close on both sides — the one thing that
  // should differ down here, and it is a colour shift rather than a dimming.
  skyFill: 0xa8bcd4,
  groundFill: 0x8a7a62,
  fillIntensity: 1.45,
  shadowTint: 0x64709c,
  shadowTintStrength: 0.72,
  castShadows: true,
}

/** Michigan Avenue. Tall, hard-edged, plenty of sky between the towers. */
export const AVENUE_DAWN: LightingProfile = {
  sky: 0x9fc0e0,
  // Reaches to the river — the Michigan corridor runs a mile south and the
  // distant towers are the reason to look that way at all.
  fogNear: 260,
  fogFar: 1900,
  key: 0xffd2a0,
  keyIntensity: 2.3,
  skyFill: 0xa8c4e8,
  groundFill: 0x7a6d5c,
  fillIntensity: 1.2,
  shadowTint: 0x6b7ba8,
  shadowTintStrength: 0.8,
  castShadows: true,
}

/** Oak Street. Low-rise and tree-lined, so more bounce and softer contrast. */
export const BOUTIQUE_DAWN: LightingProfile = {
  sky: 0xa4c4e2,
  fogNear: 100,
  fogFar: 480,
  key: 0xffdcb4,
  keyIntensity: 2.0,
  skyFill: 0xb0cbe8,
  groundFill: 0x8a7f6c,
  fillIntensity: 1.35,
  shadowTint: 0x7885b0,
  shadowTintStrength: 0.72,
  castShadows: true,
}

/** Rush Street. Awnings and heat lamps warm the patios from below. */
export const DINING_DAWN: LightingProfile = {
  sky: 0x9dbcd8,
  fogNear: 95,
  fogFar: 440,
  key: 0xffcf9a,
  keyIntensity: 2.1,
  // Rush runs north–south with the sun low to the east, so one whole pavement
  // is in shadow for the length of the strip — and that is the pavement the
  // patios and the crowd are on. Adding people did nothing because they were
  // unreadable, not absent. The fill is what decides whether a shadow is a
  // shape or a hole, so it carries more here than anywhere else on the route.
  skyFill: 0xb6cbe2,
  groundFill: 0xa08663,
  fillIntensity: 2.0,
  shadowTint: 0x8590b8,
  shadowTintStrength: 0.62,
  castShadows: true,
}

/** Mariano Park. Leaf cover, so cooler and more diffuse than the street. */
export const PARK_DAWN: LightingProfile = {
  sky: 0xa2c2de,
  fogNear: 90,
  fogFar: 400,
  key: 0xffe0bc,
  keyIntensity: 1.85,
  skyFill: 0xa9c8e0,
  groundFill: 0x6d7a56,
  fillIntensity: 1.4,
  shadowTint: 0x6a7d9c,
  shadowTintStrength: 0.74,
  castShadows: true,
}

/** Service alley. Sunless slot between buildings; almost all bounce. */
export const ALLEY: LightingProfile = {
  sky: 0x6a7488,
  fogNear: 14,
  fogFar: 60,
  key: 0xbfc9dd,
  keyIntensity: 0.7,
  skyFill: 0x8593ad,
  groundFill: 0x3d3a36,
  fillIntensity: 1.0,
  shadowTint: 0x4a5270,
  shadowTintStrength: 0.85,
  castShadows: false,
}

/**
 * Kitchen and bar. The warm/cool relationship inverts here — tungsten and
 * heat lamps are the key, and the only cool light is daylight through the
 * service door behind you.
 */
export const INTERIOR: LightingProfile = {
  sky: 0x120d09,
  fogNear: 10,
  fogFar: 42,
  key: 0xffc078,
  keyIntensity: 1.6,
  skyFill: 0xffb27a,
  groundFill: 0x2a1d13,
  fillIntensity: 1.1,
  shadowTint: 0x5a3f2c,
  shadowTintStrength: 0.7,
  castShadows: false,
}

/**
 * Delaware Place, with the sun going down.
 *
 * The route turns west here, straight into it, and it is the last daylight
 * section before the strip. A long blend so the sky reddens across the whole
 * block rather than at the corner.
 */
export const BOUTIQUE_SUNSET: LightingProfile = {
  sky: 0xe0a06a,
  fogNear: 70,
  fogFar: 420,
  key: 0xffb066,
  keyIntensity: 2.2,
  skyFill: 0xd89a72,
  groundFill: 0x8a6a4c,
  fillIntensity: 1.3,
  // Long shadows from a low sun go blue against a warm sky, which is most of
  // what makes an evening read as an evening.
  shadowTint: 0x5a5f9a,
  shadowTintStrength: 0.8,
  castShadows: true,
  blendIn: 0.85,
}

/**
 * Rush Street after dark.
 *
 * The sun has gone. Everything readable here comes from the awnings, the
 * windows and the string lights, so the fill is warm and carries almost all of
 * it — the key is barely more than a rim.
 */
export const DINING_DUSK: LightingProfile = {
  sky: 0x2b2740,
  fogNear: 60,
  fogFar: 320,
  key: 0xff8a52,
  keyIntensity: 0.55,
  skyFill: 0x4a4468,
  groundFill: 0x6b4a38,
  fillIntensity: 1.9,
  shadowTint: 0x3a3560,
  shadowTintStrength: 0.55,
  castShadows: false,
  blendIn: 0.5,
}

/** Mariano Park, same evening. */
export const PARK_DUSK: LightingProfile = {
  sky: 0x272441,
  fogNear: 60,
  fogFar: 300,
  key: 0xffa070,
  keyIntensity: 0.5,
  skyFill: 0x494365,
  groundFill: 0x4a4a42,
  fillIntensity: 1.7,
  shadowTint: 0x38345c,
  shadowTintStrength: 0.55,
  castShadows: false,
}

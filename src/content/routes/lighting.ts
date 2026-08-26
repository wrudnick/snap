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
  fogNear: 90,
  fogFar: 320,
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
  sky: 0x14100e,
  fogNear: 8,
  fogFar: 46,
  key: 0xff9a3c,
  keyIntensity: 0.9,
  skyFill: 0x4a3524,
  groundFill: 0x1a1512,
  fillIntensity: 0.8,
  shadowTint: 0x2a2440,
  shadowTintStrength: 0.9,
  // No sun down here; a shadow map would cost a pass to render nothing.
  castShadows: false,
}

/** Michigan Avenue. Tall, hard-edged, plenty of sky between the towers. */
export const AVENUE_DAWN: LightingProfile = {
  sky: 0x9fc0e0,
  fogNear: 70,
  fogFar: 230,
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
  fogNear: 60,
  fogFar: 180,
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
  fogNear: 55,
  fogFar: 165,
  key: 0xffcf9a,
  keyIntensity: 2.1,
  skyFill: 0xa6c0dc,
  groundFill: 0x8e7452,
  fillIntensity: 1.3,
  shadowTint: 0x6f7aa4,
  shadowTintStrength: 0.78,
  castShadows: true,
}

/** Mariano Park. Leaf cover, so cooler and more diffuse than the street. */
export const PARK_DAWN: LightingProfile = {
  sky: 0xa2c2de,
  fogNear: 50,
  fogFar: 150,
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

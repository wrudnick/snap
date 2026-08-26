import * as THREE from 'three'

/**
 * Cel-shading palette and ramp generation.
 *
 * Everything here is generated at runtime — no texture assets. The toon ramp is
 * a handful of pixels, and the whole look is driven by where its bands fall.
 */

/**
 * Build a toon gradient ramp as a tiny 1D texture.
 *
 * `NearestFilter` is what makes the bands hard; with linear filtering this is
 * just a low-resolution smooth gradient and the cel look disappears entirely.
 *
 * Band positions matter more than band count. Two bands reads as cheap 2000s
 * cel-shading; three or four, weighted so the lit band is wide and the terminator
 * sits low, reads much closer to Jet Set Radio — mostly flat light with a
 * decisive shadow edge rather than an even staircase.
 */
export function makeToonRamp(stops: number[] = [0.32, 0.55, 0.82, 1.0]): THREE.DataTexture {
  const data = new Uint8Array(stops.length * 4)

  stops.forEach((v, i) => {
    const b = Math.round(THREE.MathUtils.clamp(v, 0, 1) * 255)
    data[i * 4 + 0] = b
    data[i * 4 + 1] = b
    data[i * 4 + 2] = b
    data[i * 4 + 3] = 255
  })

  const texture = new THREE.DataTexture(data, stops.length, 1, THREE.RGBAFormat)
  texture.minFilter = THREE.NearestFilter
  texture.magFilter = THREE.NearestFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true
  return texture
}

/**
 * The one ramp every toon material shares.
 *
 * Lazily built so module load doesn't depend on a GL context, and shared so
 * materials stay poolable — every distinct material is a draw call boundary.
 */
let sharedRamp: THREE.DataTexture | null = null

export function toonRamp(): THREE.DataTexture {
  if (!sharedRamp) sharedRamp = makeToonRamp()
  return sharedRamp
}

/**
 * Chicago at dawn, which is the reference photo's lighting.
 *
 * The warm/cool split is doing the heavy lifting: a warm low key light against a
 * cool sky, with shadows that shift toward blue-violet rather than going grey.
 * Hue-shifted shadow is the single largest difference between "cel shaded" and
 * "looks like Jet Set Radio" — desaturating to grey reads as underexposed, while
 * shifting hue reads as deliberate.
 */
export const DAWN = {
  key: 0xffd9a8,
  keyIntensity: 2.3,
  skyFill: 0xa8c4e8,
  groundFill: 0x6b5f52,
  fillIntensity: 1.15,

  /** Colour shadowed surfaces drift toward. Cool violet, never black. */
  shadowTint: 0x6b7ba8,
  /** How far toward `shadowTint` a fully shadowed surface goes, 0..1. */
  shadowTintStrength: 0.8,

  /** Rim light picks silhouettes off the background. */
  rimColor: 0xffe6c4,
  rimStrength: 0.5,
  rimPower: 2.6,

  sky: 0x9fc0e0,
  fogNear: 55,
  fogFar: 150,

  outline: 0x241d2e,
} as const

export type PaletteName = keyof typeof PALETTES

export const PALETTES = {
  dawn: DAWN,
} as const

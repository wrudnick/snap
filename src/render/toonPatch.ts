import * as THREE from 'three'

import {
  FACADE_DEFAULTS,
  FACADE_FRAGMENT,
  FACADE_PARS_FRAGMENT,
  FACADE_PARS_VERTEX,
  FACADE_VERTEX,
  type FacadeOptions,
} from './facade'
import { DAWN } from './palette'

/**
 * Patches a MeshToonMaterial with hue-shifted shadows and a rim light.
 *
 * Done via `onBeforeCompile` rather than a hand-written ShaderMaterial, which
 * matters: it keeps three's shadow mapping, fog, and — critically — instancing
 * support intact. Rewriting the shader from scratch would mean reimplementing
 * all three, and the street depends on instancing for its draw-call budget.
 *
 * The two additions are what separate "cel shaded" from the reference look:
 *
 *  - **Hue-shifted shadow.** Shadowed surfaces drift toward a cool violet
 *    instead of merely darkening. Desaturating to grey reads as underexposure;
 *    shifting hue reads as an art choice.
 *  - **Rim light.** Lifts silhouettes off the background so a dark building
 *    against a dark building still reads as two objects.
 */

export interface ToonPatchOptions {
  shadowTint?: number
  shadowTintStrength?: number
  rimColor?: number
  rimStrength?: number
  rimPower?: number
  /**
   * Draw procedural windows, spandrels and cornices from the `aFacade`/`aMeta`
   * vertex attributes. Only meaningful on geometry that carries them — the
   * extruded OSM city.
   */
  facade?: FacadeOptions | false
}

/**
 * Uniform objects shared by every patched material.
 *
 * The route passes through eight lighting zones, and shadow colour has to move
 * with them. Because `onBeforeCompile` assigns *these exact objects* into each
 * shader's uniform map, mutating one here updates every material on screen —
 * no per-material walk, no re-compile, and it costs nothing per frame.
 */
export const sharedToonUniforms = {
  uShadowTint: { value: new THREE.Color(DAWN.shadowTint) },
  uShadowTintStrength: { value: DAWN.shadowTintStrength as number },
  uRimColor: { value: new THREE.Color(DAWN.rimColor) },
  uRimStrength: { value: DAWN.rimStrength as number },
  uRimPower: { value: DAWN.rimPower as number },
}

export function patchToonMaterial(
  material: THREE.MeshToonMaterial,
  options: ToonPatchOptions = {},
): THREE.MeshToonMaterial {
  const shadowTint = new THREE.Color(options.shadowTint ?? DAWN.shadowTint)
  const rimColor = new THREE.Color(options.rimColor ?? DAWN.rimColor)
  const shadowTintStrength = options.shadowTintStrength ?? DAWN.shadowTintStrength
  const rimStrength = options.rimStrength ?? DAWN.rimStrength
  const rimPower = options.rimPower ?? DAWN.rimPower

  const facade = options.facade
    ? { ...FACADE_DEFAULTS, ...options.facade }
    : null

  material.onBeforeCompile = (shader) => {
    if (facade) {
      shader.uniforms.uFloorHeight = { value: facade.floorHeight }
      shader.uniforms.uBayWidth = { value: facade.bayWidth }
      shader.uniforms.uGroundHeight = { value: facade.groundHeight }
      shader.uniforms.uWindowDark = { value: new THREE.Color(facade.windowDark) }
      shader.uniforms.uWindowLit = { value: new THREE.Color(facade.windowLit) }
      shader.uniforms.uTrim = { value: new THREE.Color(facade.trim) }
      shader.uniforms.uLitChance = { value: facade.litChance }

      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${FACADE_PARS_VERTEX}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>\n${FACADE_VERTEX}`)
    }

    // Materials with explicit overrides get their own uniforms; everything else
    // shares the module-level set so lighting zones can retint the whole scene
    // by mutating one value.
    shader.uniforms.uShadowTint = options.shadowTint
      ? { value: shadowTint }
      : sharedToonUniforms.uShadowTint
    shader.uniforms.uShadowTintStrength =
      options.shadowTintStrength !== undefined
        ? { value: shadowTintStrength }
        : sharedToonUniforms.uShadowTintStrength
    shader.uniforms.uRimColor = options.rimColor
      ? { value: rimColor }
      : sharedToonUniforms.uRimColor
    shader.uniforms.uRimStrength =
      options.rimStrength !== undefined
        ? { value: rimStrength }
        : sharedToonUniforms.uRimStrength
    shader.uniforms.uRimPower =
      options.rimPower !== undefined
        ? { value: rimPower }
        : sharedToonUniforms.uRimPower

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      /* glsl */ `
        #include <common>
        ${facade ? FACADE_PARS_FRAGMENT : ''}
        uniform vec3 uShadowTint;
        uniform float uShadowTintStrength;
        uniform vec3 uRimColor;
        uniform float uRimStrength;
        uniform float uRimPower;

        float snapLuma(vec3 c) {
          return dot(c, vec3(0.2126, 0.7152, 0.0722));
        }
      `,
    )

    if (facade) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>\n${FACADE_FRAGMENT}`,
      )
    }

    // `reflectedLight` is populated by this point, so direct light relative to
    // the surface colour approximates which toon band the fragment landed in.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <lights_fragment_end>',
      /* glsl */ `
        #include <lights_fragment_end>
        float snapLit = clamp(
          snapLuma(reflectedLight.directDiffuse) / (snapLuma(diffuseColor.rgb) + 0.001),
          0.0,
          1.0
        );
      `,
    )

    // `outgoingLight` is declared just above this include, so prepending here
    // lets us modify it before it reaches gl_FragColor.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      /* glsl */ `
        {
          // The shadow colour is the surface's own albedo lit by a cool ambient,
          // NOT the lit colour darkened. Multiplying down crushes everything to
          // near-black and reads as underexposure; re-lighting the albedo keeps
          // the material readable and makes the shadow look chosen.
          vec3 shadowed = diffuseColor.rgb * uShadowTint * 2.6;
          vec3 tinted = mix(outgoingLight, shadowed, uShadowTintStrength);
          outgoingLight = mix(tinted, outgoingLight, snapLit);

          float rim = pow(
            1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0),
            uRimPower
          );
          outgoingLight += uRimColor * rim * uRimStrength * snapLit;
${facade ? '          // Lit windows are emissive: a window in shadow still glows.\n          outgoingLight += facadeEmissive;' : ''}
        }
        #include <opaque_fragment>
      `,
    )
  }

  // Distinguishes patched from unpatched programs in three's shader cache.
  // Facade and plain variants are different programs; a shared key would make
  // three hand one shader to both.
  material.customProgramCacheKey = () => (facade ? 'snap-toon-facade-v1' : 'snap-toon-v1')
  material.needsUpdate = true
  return material
}

/**
 * A patched toon material. Cached per colour so instanced meshes keep sharing
 * materials — material switches are what draw calls actually cost.
 */
const cache = new Map<string, THREE.MeshToonMaterial>()

export function toonMaterial(
  color: number,
  gradientMap: THREE.Texture,
  options: ToonPatchOptions = {},
): THREE.MeshToonMaterial {
  const key = `${color}:${JSON.stringify(options)}`
  let material = cache.get(key)
  if (!material) {
    material = patchToonMaterial(
      new THREE.MeshToonMaterial({ color, gradientMap }),
      options,
    )
    cache.set(key, material)
  }
  return material
}

export function disposeToonMaterials(): void {
  cache.forEach((m) => m.dispose())
  cache.clear()
}

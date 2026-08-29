import { EffectComposerContext } from '@react-three/postprocessing'
import { Effect, EffectAttribute } from 'postprocessing'
import { forwardRef, useContext, useEffect, useMemo } from 'react'
import * as THREE from 'three'

import { activeComposer } from './composer'
import { DAWN } from './palette'

/**
 * Ink outlines, as a single fullscreen post-process pass.
 *
 * Chosen over the inverted-hull trick for two concrete reasons:
 *
 *  1. The street is instanced boxes. Inverted hulls would double every draw
 *     call, which is the entire budget the instancing exists to protect.
 *  2. Hard-edged boxes have per-face normals, so extruding along them splits the
 *     hull at every corner and leaves gaps exactly where the silhouette matters.
 *
 * Cost here is constant regardless of how much city is on screen.
 *
 * Edges come from two sources, and it needs both:
 *
 *  - **Silhouettes** from large jumps in linear depth between neighbours.
 *  - **Creases** from disagreeing surface normals.
 *
 * The first version tried to find creases in depth alone, using the second
 * derivative — on a flat surface the centre sample should equal the average of
 * its neighbours, and at a fold it doesn't. That works looking straight at a
 * wall and fails completely on the ground: at a grazing angle the road's *first*
 * derivative is so steep that numerical error in it swamps the second, and the
 * whole lower half of the screen fills with ink.
 *
 * A normal buffer costs one extra pass and has no such failure. A flat road has
 * the same normal everywhere no matter how obliquely you look at it.
 */

const fragmentShader = /* glsl */ `
uniform vec3 uOutlineColor;
uniform sampler2D uNormalBuffer;
uniform float uDepthThreshold;
uniform float uNormalThreshold;
uniform float uThickness;
uniform float uDistanceFade;
uniform vec2 uTexel;

vec3 readNormal(const in vec2 uv) {
  // NormalPass stores view-space normals packed into [0,1].
  return texture2D(uNormalBuffer, uv).rgb * 2.0 - 1.0;
}

// Linear eye-space depth, positive and increasing away from the camera.
float linearDepth(const in vec2 uv) {
  return -getViewZ(readDepth(uv));
}

void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {
  vec2 dx = vec2(uTexel.x * uThickness, 0.0);
  vec2 dy = vec2(0.0, uTexel.y * uThickness);

  float dC = linearDepth(uv);

  // Sky and far plane: no lines, or the horizon becomes a hard black band.
  if (dC > 1000.0) {
    outputColor = inputColor;
    return;
  }

  float dL = linearDepth(uv - dx);
  float dR = linearDepth(uv + dx);
  float dU = linearDepth(uv + dy);
  float dD = linearDepth(uv - dy);

  // Thresholds scale WITH distance, not against it. Dividing the measurement by
  // depth makes near surfaces hypersensitive — the road two metres away then
  // trips every test and the lower frame floods.
  float scale = max(dC, 1.0);

  float silhouette = max(
    max(abs(dC - dL), abs(dC - dR)),
    max(abs(dC - dU), abs(dC - dD))
  );

  // Creases from normals. Robust at grazing angles, where a depth-derivative
  // test is not: a flat road's normal is identical across the whole surface
  // however obliquely it is viewed.
  vec3 n0 = readNormal(uv);
  float normalEdge = 0.0;
  normalEdge = max(normalEdge, 1.0 - dot(n0, readNormal(uv - dx)));
  normalEdge = max(normalEdge, 1.0 - dot(n0, readNormal(uv + dx)));
  normalEdge = max(normalEdge, 1.0 - dot(n0, readNormal(uv + dy)));
  normalEdge = max(normalEdge, 1.0 - dot(n0, readNormal(uv - dy)));

  float fade = scale * (1.0 + dC * uDistanceFade);

  float silhouetteEdge = smoothstep(
    uDepthThreshold * fade,
    uDepthThreshold * fade * 2.5,
    silhouette
  );
  float creaseEdge = smoothstep(
    uNormalThreshold,
    uNormalThreshold * 2.2,
    normalEdge
  );

  // Creases fade out with distance; silhouettes hold on longer.
  //
  // At range, neighbouring pixels sample geometry metres apart, so their
  // normals always disagree and every distant surface inks itself. Along the
  // horizon that lands every building's base on the same few pixels and their
  // lines stack into a solid black bar across the sky — the first thing you see
  // in the game. A crease is detail, and detail is not legible at 200 m
  // anyway; an outline still is, which is why the two fade at different rates.
  creaseEdge *= 1.0 - smoothstep(55.0, 150.0, dC);
  silhouetteEdge *= 1.0 - smoothstep(220.0, 420.0, dC);

  float edge = max(silhouetteEdge, creaseEdge);

  outputColor = vec4(mix(inputColor.rgb, uOutlineColor, clamp(edge, 0.0, 1.0)), inputColor.a);
}
`

export interface CelOutlineOptions {
  color?: number
  /** Larger = fewer silhouette lines. */
  depthThreshold?: number
  /** Larger = fewer crease lines. Normal disagreement, 0..2. */
  normalThreshold?: number
  /** Line width in pixels. */
  thickness?: number
  /** How fast thresholds loosen with distance. */
  distanceFade?: number
}

class CelOutlineEffect extends Effect {
  constructor(options: CelOutlineOptions = {}) {
    super('CelOutline', fragmentShader, {
      attributes: EffectAttribute.DEPTH,
      uniforms: new Map<string, THREE.Uniform>([
        ['uOutlineColor', new THREE.Uniform(new THREE.Color(options.color ?? DAWN.outline))],
        // Metres of depth step per metre of distance. 0.02 means a subject 10m
        // away needs a ~20cm step to draw a line — roughly a building edge, not
        // a paving slab.
        ['uNormalBuffer', new THREE.Uniform(null)],
        ['uDepthThreshold', new THREE.Uniform(options.depthThreshold ?? 0.02)],
        // Normals disagreeing by this much read as a fold. ~0.1 is roughly a
        // 25-degree crease, which catches building corners and skips the gentle
        // curvature of a sphere.
        ['uNormalThreshold', new THREE.Uniform(options.normalThreshold ?? 0.1)],
        ['uThickness', new THREE.Uniform(options.thickness ?? 1.5)],
        // How fast the thresholds loosen with distance. Raised from 0.002: at
        // the horizon every building base lands on the same few pixels and
        // their outlines stack into a solid black bar across the frame — the
        // first thing you see on the beach. Lines fade out before they can pile
        // up, which also stops distant facades reading as ink rather than as
        // buildings.
        ['uDistanceFade', new THREE.Uniform(options.distanceFade ?? 0.011)],
        ['uTexel', new THREE.Uniform(new THREE.Vector2(1 / 1280, 1 / 800))],
      ]),
    })
  }

  override setSize(width: number, height: number): void {
    const texel = this.uniforms.get('uTexel')
    if (texel) (texel.value as THREE.Vector2).set(1 / width, 1 / height)
  }
}

export const CelOutline = forwardRef<CelOutlineEffect, CelOutlineOptions>(
  function CelOutline(options, ref) {
    const effect = useMemo(
      () => new CelOutlineEffect(options),
      [
        options.color,
        options.depthThreshold,
        options.normalThreshold,
        options.thickness,
        options.distanceFade,
      ],
    )

    // The normal buffer is created by the composer, so it can only be wired in
    // once the effect is inside one. Being in here is also the only place with a
    // handle on the composer itself, which photo capture needs so that saved
    // photos carry the same ink lines the player was looking at.
    const { composer, normalPass } = useContext(EffectComposerContext)
    useEffect(() => {
      const uniform = effect.uniforms.get('uNormalBuffer')
      if (uniform && normalPass) uniform.value = normalPass.texture
    }, [effect, normalPass])

    useEffect(() => {
      activeComposer.current = composer ?? null
      return () => {
        activeComposer.current = null
      }
    }, [composer])

    return <primitive ref={ref} object={effect} dispose={null} />
  },
)

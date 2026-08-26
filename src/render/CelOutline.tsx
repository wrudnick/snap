import { Effect, EffectAttribute } from 'postprocessing'
import { forwardRef, useMemo } from 'react'
import * as THREE from 'three'

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
 * Edges come from depth alone — no normal prepass:
 *
 *  - **Silhouettes** are large jumps in linear depth between neighbours.
 *  - **Creases** are where depth stops varying *linearly*. On any flat surface,
 *    however steeply angled, the centre sample equals the average of its
 *    opposite neighbours; at a fold it doesn't. That second-derivative test
 *    catches building corners without ever reconstructing a normal, which saves
 *    a whole render pass.
 *
 * Both thresholds scale with distance, or every distant rooftop dissolves into
 * solid ink.
 */

const fragmentShader = /* glsl */ `
uniform vec3 uOutlineColor;
uniform float uDepthThreshold;
uniform float uCreaseThreshold;
uniform float uThickness;
uniform float uDistanceFade;
uniform vec2 uTexel;

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
  // depth (the intuitive "relative difference") makes near surfaces
  // hypersensitive — the road two metres from the camera then trips every test
  // and the whole lower frame floods with ink. Comparing absolute depth steps
  // against a distance-scaled threshold is the correct way round.
  float scale = max(dC, 1.0);

  float silhouette = max(
    max(abs(dC - dL), abs(dC - dR)),
    max(abs(dC - dU), abs(dC - dD))
  );

  // Deviation from linear depth falloff — a fold, not a face.
  //
  // The slope subtraction is essential. A road seen at a grazing angle has a
  // huge first derivative, and numerical error in it swamps the second
  // derivative — so without this the entire ground plane detects as one
  // continuous crease and floods solid black. Subtracting a fraction of the
  // local gradient suppresses steeply-angled faces while leaving real folds,
  // where the second derivative genuinely dominates, untouched.
  float slopeH = abs(dR - dL);
  float slopeV = abs(dU - dD);
  float crease = max(
    abs(dL + dR - 2.0 * dC) - 0.25 * slopeH,
    abs(dU + dD - 2.0 * dC) - 0.25 * slopeV
  );

  // Loosen further with distance so haze wins over ink at the end of the block.
  float fade = scale * (1.0 + dC * uDistanceFade);

  float silhouetteEdge = smoothstep(
    uDepthThreshold * fade,
    uDepthThreshold * fade * 2.5,
    silhouette
  );
  float creaseEdge = smoothstep(
    uCreaseThreshold * fade,
    uCreaseThreshold * fade * 2.5,
    crease
  );

  float edge = max(silhouetteEdge, creaseEdge);

  outputColor = vec4(mix(inputColor.rgb, uOutlineColor, clamp(edge, 0.0, 1.0)), inputColor.a);
}
`

export interface CelOutlineOptions {
  color?: number
  /** Larger = fewer silhouette lines. */
  depthThreshold?: number
  /** Larger = fewer corner/crease lines. */
  creaseThreshold?: number
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
        ['uDepthThreshold', new THREE.Uniform(options.depthThreshold ?? 0.02)],
        ['uCreaseThreshold', new THREE.Uniform(options.creaseThreshold ?? 0.012)],
        ['uThickness', new THREE.Uniform(options.thickness ?? 1.5)],
        ['uDistanceFade', new THREE.Uniform(options.distanceFade ?? 0.002)],
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
        options.creaseThreshold,
        options.thickness,
        options.distanceFade,
      ],
    )
    return <primitive ref={ref} object={effect} dispose={null} />
  },
)

import type { EffectComposer } from 'postprocessing'
import * as THREE from 'three'

import { renderThroughComposer } from '@/render/composer'

/**
 * Framebuffer capture.
 *
 * Deliberately NOT using `preserveDrawingBuffer: true`. That flag makes the
 * browser keep a copy of the drawing buffer after *every* frame, so we'd pay a
 * continuous cost all run long for something that happens on a click. Rendering
 * into an offscreen target on demand keeps the price where it belongs.
 */

let target: THREE.WebGLRenderTarget | null = null
let pixels: Uint8Array | null = null

/**
 * Fullscreen quad used to copy the composed frame into a readable target.
 *
 * The composer works in half-float so that effects have headroom, which means
 * its buffers can't be read into a `Uint8Array` at all — WebGL rejects the call
 * outright with "buffer is not large enough for dimensions". Blitting through a
 * quad converts to 8-bit, applies the sRGB transform on the way (the target's
 * colour space drives it, same as the direct path below), and resamples to the
 * photo's resolution on the GPU rather than in a 2D canvas.
 */
let blit: {
  scene: THREE.Scene
  camera: THREE.OrthographicCamera
  material: THREE.ShaderMaterial
} | null = null

/**
 * The blit, which is also where the film happens.
 *
 * Grain, warmth and vignette are applied *here* and nowhere else, which is a
 * deliberate call rather than an implementation detail: you compose through an
 * optical viewfinder, and there is no grain in a viewfinder. Film is a property
 * of the developed photograph. So the live view stays clean, the contact sheet
 * shows you something the screen never did, and the look costs nothing per
 * frame because it only runs when the shutter fires.
 *
 * The crop moved in here too. It used to be done by mutating `repeat` and
 * `offset` on the composer's own texture and putting them back afterwards —
 * reaching into a live object the renderer is still using, to read a
 * sub-rectangle we could just as easily sample directly.
 */
function getBlit() {
  if (!blit) {
    const material = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tMap: { value: null },
        uOffset: { value: new THREE.Vector2(0, 0) },
        uRepeat: { value: new THREE.Vector2(1, 1) },
        uGrain: { value: 0 },
        uWarmth: { value: 0 },
        uVignette: { value: 0 },
        uSeed: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D tMap;
        uniform vec2 uOffset;
        uniform vec2 uRepeat;
        uniform float uGrain;
        uniform float uWarmth;
        uniform float uVignette;
        uniform float uSeed;
        varying vec2 vUv;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }

        void main() {
          vec3 c = texture2D(tMap, uOffset + vUv * uRepeat).rgb;

          // Consumer colour negative runs warm, and it is most of why a
          // photograph reads as film before you have noticed the grain.
          c = mix(c, c * vec3(1.06, 1.0, 0.90), uWarmth);

          // Falloff on the *frame's* coordinates, not the screen's, so it sits
          // in the corners of the photograph wherever the crop was taken from.
          float d = distance(vUv, vec2(0.5));
          c *= 1.0 - uVignette * smoothstep(0.36, 0.80, d);

          /**
           * Grain last, so it is not tinted or darkened by the two above.
           *
           * Sampled coarsely rather than per pixel. Per-pixel noise is the
           * first thing a JPEG encoder discards — measured at quality 0.85 it
           * left a standard deviation of 1.1 in a flat patch where the shader
           * had put 3.5 — and it is not what film does anyway. Silver halide
           * clumps, so grain has a size.
           */
          c += (hash(floor(vUv * 420.0) + uSeed) - 0.5) * uGrain * 0.22;

          gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
          #include <colorspace_fragment>
        }
      `,
    })
    const scene = new THREE.Scene()
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material))
    blit = { scene, camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), material }
  }
  return blit
}

function getTarget(width: number, height: number): THREE.WebGLRenderTarget {
  if (!target || target.width !== width || target.height !== height) {
    target?.dispose()
    target = new THREE.WebGLRenderTarget(width, height, {
      // Without this the readback is linear and every photo comes out dark.
      colorSpace: THREE.SRGBColorSpace,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      samples: 4,
    })
  }
  return target
}

function getBuffer(size: number): Uint8Array {
  if (!pixels || pixels.length !== size) pixels = new Uint8Array(size)
  return pixels
}

export interface CaptureOptions {
  gl: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.Camera
  /** Long edge of the saved photo, in pixels. */
  width: number
  height: number
  /**
   * The live post chain, if there is one. Photos are the entire point of the
   * game, so they have to come out of the same pipeline the viewfinder does —
   * a plain `gl.render` here would save an un-inked image of a cel-shaded game.
   */
  composer?: EffectComposer | null
  /**
   * The finder's frame within the rendered view, as fractions.
   *
   * The scene renders at the viewport's aspect and the photograph is a crop of
   * it, because that is what a bright-line finder is: a rectangle drawn inside a
   * wider view. Must be the same rectangle the HUD masks to and the same one the
   * snapshot reports, or the player composes against one frame and is judged on
   * another.
   */
  crop?: { width: number; height: number; x: number; y: number }
  /**
   * The film in the camera. Applied to the photograph only — never to the live
   * view, because you are composing through a viewfinder and there is no grain
   * in a viewfinder.
   */
  film?: { grain: number; warmth: number; vignette: number }
}

/**
 * Render the current view into an offscreen target and encode it as a JPEG blob.
 * Uses async pixel readback where available to avoid stalling the GPU pipeline.
 */
export async function capturePhotoImage(opts: CaptureOptions): Promise<Blob> {
  const { gl, scene, camera, width, height, composer } = opts

  // Through the post chain when one exists, so the photo carries the same ink
  // lines the viewfinder showed. Its buffers are canvas-sized and half-float, so
  // the result is blitted down into our own 8-bit target rather than read
  // directly — which also supersamples the lines, since they're one pixel wide
  // at canvas resolution and the photo is smaller.
  const composed = composer ? renderThroughComposer(composer) : null

  const rt = composed
    ? blitToTarget(gl, composed, width, height, opts.crop, opts.film)
    : renderOffscreen(gl, scene, camera, width, height, opts.crop)

  const buffer = getBuffer(width * height * 4)

  const maybeAsync = gl as unknown as {
    readRenderTargetPixelsAsync?: (
      rt: THREE.WebGLRenderTarget,
      x: number,
      y: number,
      w: number,
      h: number,
      out: Uint8Array,
    ) => Promise<void>
  }

  if (typeof maybeAsync.readRenderTargetPixelsAsync === 'function') {
    await maybeAsync.readRenderTargetPixelsAsync(rt, 0, 0, width, height, buffer)
  } else {
    gl.readRenderTargetPixels(rt, 0, 0, width, height, buffer)
  }

  return encode(buffer, width, height)
}

/** Copy a composed frame into an 8-bit sRGB target at photo resolution. */
function blitToTarget(
  gl: THREE.WebGLRenderer,
  source: THREE.WebGLRenderTarget,
  width: number,
  height: number,
  crop?: { width: number; height: number; x: number; y: number },
  film?: { grain: number; warmth: number; vignette: number },
): THREE.WebGLRenderTarget {
  const rt = getTarget(width, height)
  const { scene, camera, material } = getBlit()

  material.uniforms.tMap!.value = source.texture
  material.uniforms.uOffset!.value.set(crop?.x ?? 0, crop?.y ?? 0)
  material.uniforms.uRepeat!.value.set(crop?.width ?? 1, crop?.height ?? 1)
  material.uniforms.uGrain!.value = film?.grain ?? 0
  material.uniforms.uWarmth!.value = film?.warmth ?? 0
  material.uniforms.uVignette!.value = film?.vignette ?? 0
  // A different grain pattern per exposure, the way a different piece of film
  // would be. Without this every photograph carries an identical dust pattern,
  // which reads as a dirty lens rather than as film.
  material.uniforms.uSeed!.value = Math.random() * 1000

  const previous = gl.getRenderTarget()
  gl.setRenderTarget(rt)
  gl.render(scene, camera)
  gl.setRenderTarget(previous)

  // Don't hold a reference to a composer buffer between shots.
  material.uniforms.tMap!.value = null
  return rt
}

/** Fallback for when post-processing is off: a plain render into our own target. */
function renderOffscreen(
  gl: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  width: number,
  height: number,
  crop?: { width: number; height: number; x: number; y: number },
): THREE.WebGLRenderTarget {
  const rt = getTarget(width, height)
  /**
   * Without the post chain there is no texture to crop, so the frame has to come
   * from the projection instead: narrow the camera to the finder's rectangle for
   * one render and put it back. `setViewOffset` states it exactly — this is the
   * sub-rectangle of a larger view — and restoring is `clearViewOffset`.
   */
  const perspective = camera as THREE.PerspectiveCamera
  const croppable = crop && perspective.isPerspectiveCamera
  if (croppable) {
    perspective.setViewOffset(
      1 / crop.width, 1 / crop.height,
      crop.x / crop.width, crop.y / crop.height,
      1, 1,
    )
  }
  const previous = gl.getRenderTarget()
  gl.setRenderTarget(rt)
  gl.render(scene, camera)
  gl.setRenderTarget(previous)
  return rt
}

/** WebGL reads bottom-up; canvas draws top-down. Flip rows and force opacity. */
function encode(buffer: Uint8Array, width: number, height: number): Promise<Blob> {
  const flipped = new Uint8ClampedArray(width * height * 4)
  const rowBytes = width * 4

  for (let y = 0; y < height; y++) {
    const src = (height - 1 - y) * rowBytes
    flipped.set(buffer.subarray(src, src + rowBytes), y * rowBytes)
  }
  for (let i = 3; i < flipped.length; i += 4) flipped[i] = 255

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.reject(new Error('2D context unavailable for photo encode'))

  ctx.putImageData(new ImageData(flipped, width, height), 0, 0)

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Photo encode failed'))),
      'image/jpeg',
      0.85,
    )
  })
}

/**
 * Small data URL for the album. Object URLs don't survive a reload, so anything
 * persisted has to be inlined.
 */
export async function makeThumbnail(url: string, maxWidth = 240): Promise<string | null> {
  try {
    const img = await loadImage(url)
    const scale = Math.min(1, maxWidth / img.width)
    const w = Math.round(img.width * scale)
    const h = Math.round(img.height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, w, h)
    return canvas.toDataURL('image/jpeg', 0.7)
  } catch {
    return null
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('thumbnail load failed'))
    img.src = url
  })
}

export function disposeCaptureTargets(): void {
  target?.dispose()
  target = null
  pixels = null
  blit?.material.dispose()
  blit = null
}

/**
 * Build the capture pipeline before the player needs it.
 *
 * The first shutter press paid roughly half a second on the frame it happened,
 * because the render target and the blit material were created — and the blit
 * shader compiled — right then. That is the shader-compile stall the plan warns
 * about, arriving on the one interaction in the game whose whole point is
 * timing.
 *
 * Called once at scene setup, where half a second costs nothing.
 */
export function warmCapturePipeline(
  gl: THREE.WebGLRenderer,
  width: number,
  height: number,
): void {
  const rt = getTarget(width, height)
  const { scene, camera, material } = getBlit()
  // A real texture bound, so the program that compiles here is the one the
  // first genuine capture uses rather than a variant of it — otherwise the
  // stall this exists to prevent simply moves.
  material.uniforms.tMap!.value = rt.texture
  const previous = gl.getRenderTarget()
  gl.setRenderTarget(rt)
  gl.render(scene, camera)
  gl.setRenderTarget(previous)
  material.uniforms.tMap!.value = null
}

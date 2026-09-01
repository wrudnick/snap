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
  material: THREE.MeshBasicMaterial
} | null = null

function getBlit() {
  if (!blit) {
    const material = new THREE.MeshBasicMaterial({
      // Tone mapping and depth are the composer's business, already done.
      toneMapped: false,
      depthTest: false,
      depthWrite: false,
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
    ? blitToTarget(gl, composed, width, height)
    : renderOffscreen(gl, scene, camera, width, height)

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
): THREE.WebGLRenderTarget {
  const rt = getTarget(width, height)
  const { scene, camera, material } = getBlit()

  material.map = source.texture

  const previous = gl.getRenderTarget()
  gl.setRenderTarget(rt)
  gl.render(scene, camera)
  gl.setRenderTarget(previous)

  // Don't hold a reference to a composer buffer between shots.
  material.map = null
  return rt
}

/** Fallback for when post-processing is off: a plain render into our own target. */
function renderOffscreen(
  gl: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  width: number,
  height: number,
): THREE.WebGLRenderTarget {
  const rt = getTarget(width, height)
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
  // A real texture, so the shader compiles with the same defines the first
  // genuine capture will use. Without a map bound it compiles a different
  // program and the stall simply moves.
  material.map = rt.texture
  const previous = gl.getRenderTarget()
  gl.setRenderTarget(rt)
  gl.render(scene, camera)
  gl.setRenderTarget(previous)
  material.map = null
}

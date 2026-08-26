import * as THREE from 'three'

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
}

/**
 * Render the current view into an offscreen target and encode it as a JPEG blob.
 * Uses async pixel readback where available to avoid stalling the GPU pipeline.
 */
export async function capturePhotoImage(opts: CaptureOptions): Promise<Blob> {
  const { gl, scene, camera, width, height } = opts
  const rt = getTarget(width, height)

  const previous = gl.getRenderTarget()
  gl.setRenderTarget(rt)
  gl.render(scene, camera)
  gl.setRenderTarget(previous)

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
}

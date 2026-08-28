import * as THREE from 'three'

import { makeRng, range } from '@/lib/rng'

/**
 * Character texture atlas, drawn to a canvas at load.
 *
 * The reference art gets its detail from painted texture on simple geometry, not
 * from polygons — a Jet Set Radio character is roughly a thousand triangles with
 * a hand-painted face. Our people are boxes with no texture at all, so every bit
 * of detail has had to come from geometry, and boxes can't carry a face.
 *
 * Generated rather than authored: no files to download, no atlas packer, and the
 * whole thing is one texture shared by every person on the street, so it stays a
 * single material.
 *
 * LAYOUT — a 4 x N grid of 128px cells.
 *   row 0  faces           (eyes, brows, mouth; some with sunglasses)
 *   row 1  face variants   (older, with lines; obscured)
 *   row 2  torso fronts    (plain, buttons, lapels, zip)
 *   row 3  torso backs     (plain with a seam)
 *
 * Parts pick a cell by seed, so two people share geometry and a material but not
 * a face.
 */

export const CELL = 128
export const COLS = 4
export const ROWS = 5
const W = CELL * COLS
const H = CELL * ROWS

export interface AtlasCell {
  /** UV offset and scale for `THREE.Texture.offset` / `.repeat`. */
  offset: [number, number]
  repeat: [number, number]
}

export function cellAt(col: number, row: number): AtlasCell {
  return {
    // Canvas rows run top-down; UV rows run bottom-up.
    offset: [col / COLS, 1 - (row + 1) / ROWS],
    repeat: [1 / COLS, 1 / ROWS],
  }
}

/** Skin is tinted by the material, so faces draw only their features. */
function drawFace(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  variant: number,
  older: boolean,
) {
  const rng = makeRng(variant * 7919 + (older ? 31 : 0))
  const cx = x + CELL / 2

  // Features sit high in the cell: a box head puts the face on the upper half,
  // and eyes drawn at the geometric centre read as a chin.
  const eyeY = y + CELL * 0.40
  const eyeGap = CELL * range(rng, 0.16, 0.21)
  const eyeW = CELL * range(rng, 0.075, 0.105)
  const eyeH = CELL * range(rng, 0.05, 0.085)

  const sunglasses = !older && rng() < 0.28

  if (sunglasses) {
    ctx.fillStyle = '#15171c'
    ctx.fillRect(cx - eyeGap - eyeW * 1.5, eyeY - eyeH, eyeGap * 2 + eyeW * 3, eyeH * 2.1)
    // Bridge.
    ctx.fillRect(cx - eyeGap * 0.35, eyeY - eyeH * 0.35, eyeGap * 0.7, eyeH * 0.5)
  } else {
    // Brows first, then eyes over them.
    ctx.fillStyle = older ? 'rgba(140,140,140,0.85)' : 'rgba(40,30,24,0.85)'
    const browY = eyeY - eyeH * range(rng, 1.5, 2.1)
    const browTilt = range(rng, -0.1, 0.1)
    for (const side of [-1, 1]) {
      ctx.save()
      ctx.translate(cx + side * eyeGap, browY)
      ctx.rotate(browTilt * side)
      ctx.fillRect(-eyeW * 0.75, -CELL * 0.012, eyeW * 1.5, CELL * 0.024)
      ctx.restore()
    }

    ctx.fillStyle = '#ffffff'
    for (const side of [-1, 1]) {
      ctx.beginPath()
      ctx.ellipse(cx + side * eyeGap, eyeY, eyeW * 0.62, eyeH * 0.62, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.fillStyle = '#1b1a1f'
    for (const side of [-1, 1]) {
      ctx.beginPath()
      ctx.ellipse(cx + side * eyeGap, eyeY, eyeW * 0.3, eyeH * 0.42, 0, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // Mouth.
  const mouthY = y + CELL * 0.62
  const mouthW = CELL * range(rng, 0.13, 0.2)
  ctx.strokeStyle = 'rgba(90,50,45,0.75)'
  ctx.lineWidth = CELL * 0.022
  ctx.lineCap = 'round'
  ctx.beginPath()
  const smile = range(rng, -0.05, 0.09) * CELL
  ctx.moveTo(cx - mouthW / 2, mouthY)
  ctx.quadraticCurveTo(cx, mouthY + smile, cx + mouthW / 2, mouthY)
  ctx.stroke()

  if (older) {
    // A few lines: enough to read as age at a glance without becoming a
    // caricature at close range.
    ctx.strokeStyle = 'rgba(120,90,70,0.4)'
    ctx.lineWidth = CELL * 0.012
    for (let i = 0; i < 3; i++) {
      const ly = y + CELL * (0.26 + i * 0.035)
      ctx.beginPath()
      ctx.moveTo(cx - CELL * 0.16, ly)
      ctx.lineTo(cx + CELL * 0.16, ly)
      ctx.stroke()
    }
    // Nasolabial folds.
    ctx.beginPath()
    ctx.moveTo(cx - CELL * 0.11, y + CELL * 0.5)
    ctx.lineTo(cx - CELL * 0.14, y + CELL * 0.62)
    ctx.moveTo(cx + CELL * 0.11, y + CELL * 0.5)
    ctx.lineTo(cx + CELL * 0.14, y + CELL * 0.62)
    ctx.stroke()
  }
}

/** Clothing detail. The garment colour comes from the material underneath. */
function drawTorsoFront(ctx: CanvasRenderingContext2D, x: number, y: number, variant: number) {
  const cx = x + CELL / 2
  const ink = 'rgba(0,0,0,0.28)'
  const light = 'rgba(255,255,255,0.16)'

  ctx.strokeStyle = ink
  ctx.lineWidth = CELL * 0.018

  if (variant === 0) {
    // Placket and buttons.
    ctx.beginPath()
    ctx.moveTo(cx, y + CELL * 0.06)
    ctx.lineTo(cx, y + CELL * 0.94)
    ctx.stroke()
    ctx.fillStyle = light
    for (let i = 0; i < 4; i++) {
      ctx.beginPath()
      ctx.arc(cx, y + CELL * (0.22 + i * 0.2), CELL * 0.022, 0, Math.PI * 2)
      ctx.fill()
    }
  } else if (variant === 1) {
    // Open jacket over a shirt: two lapels meeting at the sternum.
    ctx.fillStyle = 'rgba(0,0,0,0.22)'
    ctx.beginPath()
    ctx.moveTo(x + CELL * 0.28, y)
    ctx.lineTo(cx, y + CELL * 0.42)
    ctx.lineTo(x + CELL * 0.16, y + CELL)
    ctx.lineTo(x, y + CELL)
    ctx.lineTo(x, y)
    ctx.closePath()
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(x + CELL * 0.72, y)
    ctx.lineTo(cx, y + CELL * 0.42)
    ctx.lineTo(x + CELL * 0.84, y + CELL)
    ctx.lineTo(x + CELL, y + CELL)
    ctx.lineTo(x + CELL, y)
    ctx.closePath()
    ctx.fill()
  } else if (variant === 2) {
    // Zip and a chest pocket.
    ctx.beginPath()
    ctx.moveTo(cx, y + CELL * 0.04)
    ctx.lineTo(cx, y + CELL * 0.96)
    ctx.stroke()
    ctx.strokeStyle = light
    ctx.strokeRect(x + CELL * 0.6, y + CELL * 0.22, CELL * 0.22, CELL * 0.18)
  } else {
    // Collar only — the plain garment.
    ctx.beginPath()
    ctx.moveTo(x + CELL * 0.32, y + CELL * 0.02)
    ctx.lineTo(cx, y + CELL * 0.2)
    ctx.lineTo(x + CELL * 0.68, y + CELL * 0.02)
    ctx.stroke()
  }

  // Shoulder seams, on every variant: they give a flat panel some structure.
  ctx.strokeStyle = 'rgba(0,0,0,0.16)'
  ctx.lineWidth = CELL * 0.012
  ctx.beginPath()
  ctx.moveTo(x + CELL * 0.06, y + CELL * 0.1)
  ctx.lineTo(x + CELL * 0.06, y + CELL * 0.95)
  ctx.moveTo(x + CELL * 0.94, y + CELL * 0.1)
  ctx.lineTo(x + CELL * 0.94, y + CELL * 0.95)
  ctx.stroke()
}

function drawTorsoBack(ctx: CanvasRenderingContext2D, x: number, y: number, variant: number) {
  ctx.strokeStyle = 'rgba(0,0,0,0.18)'
  ctx.lineWidth = CELL * 0.014
  // Centre seam and a yoke.
  ctx.beginPath()
  ctx.moveTo(x + CELL / 2, y + CELL * 0.18)
  ctx.lineTo(x + CELL / 2, y + CELL * 0.96)
  ctx.moveTo(x + CELL * 0.08, y + CELL * 0.2)
  ctx.lineTo(x + CELL * 0.92, y + CELL * 0.2)
  ctx.stroke()

  if (variant % 2 === 1) {
    // A printed panel — the closest thing to a logo without inventing a brand.
    ctx.fillStyle = 'rgba(255,255,255,0.14)'
    ctx.fillRect(x + CELL * 0.3, y + CELL * 0.38, CELL * 0.4, CELL * 0.26)
  }
}

let cached: THREE.Texture | null = null

/**
 * The atlas, built once and shared.
 *
 * The base is opaque **white**, not transparent. A toon material multiplies its
 * map by the material colour, so white passes the colour through untouched and
 * the drawn detail modulates it — which is what lets one atlas serve every skin
 * tone and every garment colour. Transparency would instead punch holes: alpha
 * zero with black rgb, blended, gives a black hole rather than the base colour.
 */
export function characterAtlas(): THREE.Texture {
  if (cached) return cached

  // No DOM under test. A 1x1 white texture is the correct stand-in: white is
  // the atlas's own base, so a model built headlessly is identical to one built
  // in a browser minus the painted detail — and the unit tests care about
  // geometry and animation binding, not pixels.
  if (typeof document === 'undefined') {
    const blank = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)
    blank.needsUpdate = true
    cached = blank
    return blank
  }

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)

  for (let col = 0; col < COLS; col++) {
    drawFace(ctx, col * CELL, 0, col, false)
    drawFace(ctx, col * CELL, CELL, col, true)
    drawTorsoFront(ctx, col * CELL, CELL * 2, col)
    drawTorsoBack(ctx, col * CELL, CELL * 3, col)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  // Cells are addressed by offset/repeat, so clamping stops a face bleeding
  // into its neighbour at the edges.
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.anisotropy = 4
  texture.needsUpdate = true

  cached = texture
  return texture
}

/** Row 4 is never drawn: the cell every non-front box face maps to. */
export const BLANK_CELL = cellAt(0, 4)

export const FACE_ROW = 0
export const OLD_FACE_ROW = 1
export const TORSO_FRONT_ROW = 2
export const TORSO_BACK_ROW = 3

/**
 * A box whose front face shows one atlas cell and whose other faces are blank.
 *
 * BoxGeometry gives every one of its six faces the same 0..1 UV square, so
 * setting offset/repeat on the material would stamp the face onto all six sides
 * of the head. Rewriting the UVs per face is what confines it to the front.
 *
 * Face groups are ordered +X, -X, +Y, -Y, +Z, -Z — and models face local -Z, so
 * the front is the last group.
 */
export function facedBox(cell: AtlasCell): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(1, 1, 1)
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute

  // 4 vertices per face, 6 faces, in the order above.
  const FRONT_FACE = 5

  for (let face = 0; face < 6; face++) {
    const target = face === FRONT_FACE ? cell : BLANK_CELL
    for (let v = 0; v < 4; v++) {
      const i = face * 4 + v
      // The original UV is the unit square; remap it into the cell's rect.
      const u0 = uv.getX(i)
      const v0 = uv.getY(i)
      uv.setXY(
        i,
        target.offset[0] + u0 * target.repeat[0],
        target.offset[1] + v0 * target.repeat[1],
      )
    }
  }

  uv.needsUpdate = true
  return geometry
}

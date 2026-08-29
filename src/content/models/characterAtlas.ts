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
export const ROWS = 7
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
  // Large, high-contrast eyes. The reference art draws faces graphically —
  // bold shapes that survive being 30 pixels tall on screen — not subtly.
  // Realistic eye scale simply disappears at the distance people are
  // photographed from.
  const eyeY = y + CELL * 0.42
  const eyeGap = CELL * range(rng, 0.19, 0.24)
  const eyeW = CELL * range(rng, 0.13, 0.17)
  const eyeH = CELL * range(rng, 0.11, 0.15)

  const sunglasses = !older && rng() < 0.28

  if (sunglasses) {
    ctx.fillStyle = '#15171c'
    ctx.fillRect(cx - eyeGap - eyeW * 1.2, eyeY - eyeH * 1.1, eyeGap * 2 + eyeW * 2.4, eyeH * 2.2)
    // A bright rake across the lens: the graphic shorthand for glass.
    ctx.fillStyle = 'rgba(255,255,255,0.22)'
    ctx.beginPath()
    ctx.moveTo(cx - eyeGap - eyeW * 0.9, eyeY + eyeH * 0.9)
    ctx.lineTo(cx - eyeGap + eyeW * 0.1, eyeY - eyeH * 1.0)
    ctx.lineTo(cx - eyeGap + eyeW * 0.7, eyeY - eyeH * 1.0)
    ctx.lineTo(cx - eyeGap - eyeW * 0.3, eyeY + eyeH * 0.9)
    ctx.closePath()
    ctx.fill()
  } else {
    // Brows first, then eyes over them.
    ctx.fillStyle = older ? 'rgba(150,150,150,0.9)' : 'rgba(28,22,18,0.92)'
    const browY = eyeY - eyeH * range(rng, 1.15, 1.5)
    const browTilt = range(rng, -0.14, 0.14)
    for (const side of [-1, 1]) {
      ctx.save()
      ctx.translate(cx + side * eyeGap, browY)
      ctx.rotate(browTilt * side)
      // Heavy brows: they carry expression at a distance where eyes alone read
      // as two dots.
      ctx.fillRect(-eyeW * 0.7, -CELL * 0.022, eyeW * 1.4, CELL * 0.044)
      ctx.restore()
    }

    ctx.fillStyle = '#ffffff'
    for (const side of [-1, 1]) {
      ctx.beginPath()
      ctx.ellipse(cx + side * eyeGap, eyeY, eyeW * 0.62, eyeH * 0.62, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    // Large dark iris filling most of the eye, the way stylised faces are drawn.
    ctx.fillStyle = '#16151a'
    for (const side of [-1, 1]) {
      ctx.beginPath()
      ctx.ellipse(cx + side * eyeGap, eyeY, eyeW * 0.42, eyeH * 0.62, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    // A single catchlight. Cheap, and it stops the eyes reading as holes.
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    for (const side of [-1, 1]) {
      ctx.beginPath()
      ctx.arc(cx + side * eyeGap - eyeW * 0.15, eyeY - eyeH * 0.2, eyeW * 0.14, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // Mouth.
  const mouthY = y + CELL * 0.66
  const mouthW = CELL * range(rng, 0.17, 0.25)
  ctx.strokeStyle = 'rgba(72,38,34,0.85)'
  ctx.lineWidth = CELL * 0.032
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
    // A printed graphic across the chest. This is what the reference art
    // actually puts on a torso — a bold mark, not tailoring — and it is the
    // single most recognisable thing about those characters' clothes.
    ctx.beginPath()
    ctx.moveTo(x + CELL * 0.32, y + CELL * 0.02)
    ctx.lineTo(cx, y + CELL * 0.18)
    ctx.lineTo(x + CELL * 0.68, y + CELL * 0.02)
    ctx.stroke()

    ctx.save()
    ctx.translate(cx, y + CELL * 0.5)
    ctx.strokeStyle = 'rgba(255,240,180,0.85)'
    ctx.lineWidth = CELL * 0.045
    ctx.lineJoin = 'round'
    // A blocky glyph: reads as a logo without pretending to be a brand.
    const u = CELL * 0.1
    ctx.beginPath()
    ctx.moveTo(-u * 1.4, -u * 1.4)
    ctx.lineTo(u * 1.4, -u * 1.4)
    ctx.lineTo(u * 1.4, 0)
    ctx.lineTo(-u * 0.4, 0)
    ctx.lineTo(-u * 0.4, u * 1.4)
    ctx.lineTo(u * 1.6, u * 1.4)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'
    ctx.lineWidth = CELL * 0.012
    ctx.strokeRect(-u * 2.1, -u * 2.1, u * 4.2, u * 4.2)
    ctx.restore()
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

/**
 * Trousers.
 *
 * Wraps every face of the leg box, so the pattern is continuous rather than
 * being a decal on the front. Camo especially has to wrap — a camouflage panel
 * that stops at the seam looks like a sticker.
 */
function drawLeg(ctx: CanvasRenderingContext2D, x: number, y: number, variant: number) {
  const rng = makeRng(variant * 104729 + 11)

  if (variant === 0) {
    // Camo: soft irregular blobs, the baggy-trouser staple.
    for (let i = 0; i < 22; i++) {
      const bx = x + range(rng, 0, CELL)
      const by = y + range(rng, 0, CELL)
      const r = CELL * range(rng, 0.06, 0.17)
      ctx.fillStyle = i % 2 === 0 ? 'rgba(0,0,0,0.24)' : 'rgba(255,255,255,0.16)'
      ctx.beginPath()
      ctx.ellipse(bx, by, r, r * range(rng, 0.6, 1.3), range(rng, 0, Math.PI), 0, Math.PI * 2)
      ctx.fill()
    }
  } else if (variant === 1) {
    // Side stripe down the outseam.
    ctx.fillStyle = 'rgba(255,255,255,0.28)'
    ctx.fillRect(x + CELL * 0.06, y, CELL * 0.09, CELL)
    ctx.fillStyle = 'rgba(0,0,0,0.2)'
    ctx.fillRect(x + CELL * 0.5, y, CELL * 0.02, CELL)
  } else if (variant === 2) {
    // Cargo pocket and a knee seam.
    ctx.fillStyle = 'rgba(0,0,0,0.2)'
    ctx.fillRect(x + CELL * 0.24, y + CELL * 0.34, CELL * 0.5, CELL * 0.26)
    ctx.strokeStyle = 'rgba(0,0,0,0.24)'
    ctx.lineWidth = CELL * 0.02
    ctx.beginPath()
    ctx.moveTo(x, y + CELL * 0.66)
    ctx.lineTo(x + CELL, y + CELL * 0.66)
    ctx.stroke()
  } else {
    // Plain, with a turn-up at the hem.
    ctx.fillStyle = 'rgba(0,0,0,0.18)'
    ctx.fillRect(x, y + CELL * 0.86, CELL, CELL * 0.14)
  }
}

/** Sleeves: a cuff and, on some, a contrast band at the bicep. */
function drawSleeve(ctx: CanvasRenderingContext2D, x: number, y: number, variant: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.22)'
  ctx.fillRect(x, y + CELL * 0.84, CELL, CELL * 0.16)

  if (variant % 2 === 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.22)'
    ctx.fillRect(x, y + CELL * 0.2, CELL, CELL * 0.12)
  }
  if (variant === 3) {
    // Rolled to the elbow: bare forearm below the roll.
    ctx.fillStyle = 'rgba(255,255,255,0.1)'
    ctx.fillRect(x, y + CELL * 0.5, CELL, CELL * 0.34)
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
    drawLeg(ctx, col * CELL, CELL * 4, col)
    drawSleeve(ctx, col * CELL, CELL * 5, col)
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
export const BLANK_CELL = cellAt(0, 6)

export const FACE_ROW = 0
export const OLD_FACE_ROW = 1
export const TORSO_FRONT_ROW = 2
export const TORSO_BACK_ROW = 3
export const LEG_ROW = 4
export const SLEEVE_ROW = 5

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

/**
 * A tapered torso whose front and back quads carry atlas cells.
 *
 * The torso is a four-sided cylinder frustum rotated a quarter-turn so its faces
 * align with the axes. Which quad ends up facing front isn't obvious, so it was
 * measured rather than guessed: after that rotation the −Z (front) quad occupies
 * u ∈ [0.25, 0.5] and the +Z (back) quad u ∈ [0.75, 1.0]. The two side quads and
 * both caps get the blank cell.
 *
 * Converted to non-indexed first. A cylinder shares the vertices on each quad
 * boundary, and a shared vertex can't hold two different UVs — so remapping an
 * indexed cylinder smears one cell into its neighbour. Non-indexed also gives
 * the flat shading the rest of the look uses.
 */
export function facedFrustum(
  radiusTop: number,
  front: AtlasCell,
  back: AtlasCell,
): THREE.BufferGeometry {
  const geometry = new THREE.CylinderGeometry(radiusTop, 1, 1, 4, 1).toNonIndexed()
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute

  const remap = (i0: number, cell: AtlasCell, uLo: number) => {
    for (let v = 0; v < 3; v++) {
      const i = i0 + v
      // Local coordinate within this quad, 0..1 across and 0..1 up.
      const local = (uv.getX(i) - uLo) / 0.25
      const up = uv.getY(i)
      uv.setXY(
        i,
        cell.offset[0] + local * cell.repeat[0],
        cell.offset[1] + up * cell.repeat[1],
      )
    }
  }

  for (let tri = 0; tri < uv.count / 3; tri++) {
    const i0 = tri * 3
    const meanU = (uv.getX(i0) + uv.getX(i0 + 1) + uv.getX(i0 + 2)) / 3

    // Caps come after the eight side triangles.
    if (tri >= 8) {
      remap(i0, BLANK_CELL, 0)
      continue
    }

    if (meanU > 0.25 && meanU < 0.5) remap(i0, front, 0.25)
    else if (meanU > 0.75) remap(i0, back, 0.75)
    else remap(i0, BLANK_CELL, meanU < 0.25 ? 0 : 0.5)
  }

  uv.needsUpdate = true
  return geometry
}

/**
 * A box with the same cell on every face.
 *
 * Trousers and sleeves need their pattern to continue around the limb — camo
 * that stops at a seam reads as a sticker rather than as cloth. `facedBox` puts
 * a cell on the front only, which is right for a face and wrong for a leg.
 */
export function wrappedBox(cell: AtlasCell): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(1, 1, 1)
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute

  for (let i = 0; i < uv.count; i++) {
    uv.setXY(
      i,
      cell.offset[0] + uv.getX(i) * cell.repeat[0],
      cell.offset[1] + uv.getY(i) * cell.repeat[1],
    )
  }
  uv.needsUpdate = true
  return geometry
}

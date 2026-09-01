import * as THREE from 'three'

/**
 * Letters built from boxes, because nothing else in this game draws text.
 *
 * There are no textures here and no font loader, and adding either for one
 * rooftop sign would be a lot of machinery for eight characters. Every other
 * piece of detail in this world is a rectangle, so the letters are too — which
 * also means they take an outline from the cel pass like everything else, and
 * a sign whose letters are outlined is exactly what a painted rooftop sign
 * looks like from the street.
 *
 * Each glyph is a list of rectangles in a unit box: x and y from 0 at the
 * bottom left, width and height as fractions. Strokes are heavy and the
 * proportions condensed, which is what reads as a hotel sign of the period
 * rather than as a typeface — at the distance these are seen the weight is the
 * only thing that survives, so it is the thing that is exaggerated.
 *
 * Diagonals are stepped rather than rotated. A rotated box in a glyph would
 * have to be composed with the sign's own rotation, and the letters would come
 * out sheared on any face that is not square to the world.
 */
export type Rect = readonly [x: number, y: number, w: number, h: number]

const STEM = 0.24

/** Steps a diagonal across a box, as a stack of small rectangles. */
function diagonal(
  x0: number, y0: number, x1: number, y1: number, steps: number, thickness: number,
): Rect[] {
  return Array.from({ length: steps }, (_, i) => {
    const t = i / (steps - 1)
    return [
      x0 + (x1 - x0) * t - thickness / 2,
      y0 + (y1 - y0) * t - thickness / 2,
      thickness,
      thickness * 1.5,
    ] as Rect
  })
}

export const GLYPHS: Record<string, readonly Rect[]> = {
  T: [[0.0, 0.82, 1.0, 0.18], [0.38, 0.0, STEM, 0.84]],
  H: [[0.04, 0.0, STEM, 1.0], [0.72, 0.0, STEM, 1.0], [0.04, 0.42, 0.92, 0.17]],
  E: [[0.08, 0.0, STEM, 1.0], [0.08, 0.82, 0.78, 0.18], [0.08, 0.42, 0.6, 0.16], [0.08, 0.0, 0.78, 0.18]],
  D: [[0.08, 0.0, STEM, 1.0], [0.08, 0.82, 0.6, 0.18], [0.08, 0.0, 0.6, 0.18], [0.64, 0.14, STEM, 0.72]],
  O: [[0.06, 0.14, STEM, 0.72], [0.7, 0.14, STEM, 0.72], [0.06, 0.82, 0.88, 0.18], [0.06, 0.0, 0.88, 0.18]],
  R: [
    [0.08, 0.0, STEM, 1.0], [0.08, 0.82, 0.62, 0.18], [0.66, 0.5, STEM, 0.34],
    [0.08, 0.44, 0.62, 0.16],
    ...diagonal(0.5, 0.42, 0.78, 0.06, 5, 0.2),
  ],
  K: [
    [0.08, 0.0, STEM, 1.0],
    ...diagonal(0.34, 0.5, 0.84, 0.94, 5, 0.2),
    ...diagonal(0.34, 0.48, 0.86, 0.04, 5, 0.2),
  ],
  A: [[0.02, 0.0, STEM, 0.78], [0.74, 0.0, STEM, 0.78], [0.02, 0.8, 0.96, 0.2], [0.02, 0.4, 0.96, 0.16]],
  L: [[0.1, 0.0, STEM, 1.0], [0.1, 0.0, 0.8, 0.18]],
  ' ': [],

  /**
   * Lower case, because the sign it is for is not shouting.
   *
   * The Drake's roof sign reads "The Drake" with two capitals and the rest
   * lower case, in a serif — set in block capitals it reads as a motel. The
   * x-height is 0.62 and the ascenders run to the cap line, which is the
   * proportion that makes the two sit together.
   */
  h: [[0.08, 0.0, STEM, 1.0], [0.08, 0.46, 0.56, 0.16], [0.58, 0.0, STEM, 0.58]],
  e: [
    [0.06, 0.06, 0.2, 0.42], [0.06, 0.46, 0.76, 0.16], [0.06, 0.0, 0.76, 0.16],
    [0.06, 0.26, 0.66, 0.13], [0.64, 0.3, 0.2, 0.18],
  ],
  o: [[0.06, 0.06, 0.2, 0.42], [0.66, 0.06, 0.2, 0.42], [0.06, 0.46, 0.8, 0.16], [0.06, 0.0, 0.8, 0.16]],
  r: [[0.1, 0.0, STEM, 0.62], [0.1, 0.46, 0.46, 0.16], [0.52, 0.32, 0.2, 0.16]],
  k: [
    [0.08, 0.0, STEM, 1.0],
    ...diagonal(0.32, 0.3, 0.76, 0.58, 4, 0.19),
    ...diagonal(0.32, 0.28, 0.78, 0.02, 4, 0.19),
  ],
  a: [[0.08, 0.0, 0.2, 0.48], [0.68, 0.0, 0.2, 0.62], [0.08, 0.46, 0.7, 0.16], [0.08, 0.0, 0.7, 0.16], [0.08, 0.22, 0.7, 0.13]],
  t: [[0.3, 0.0, STEM, 0.86], [0.06, 0.5, 0.7, 0.14], [0.3, 0.0, 0.5, 0.15]],
  l: [[0.34, 0.0, STEM, 1.0]],
}

/**
 * Slab serifs, added to the feet and heads of a glyph's vertical stems.
 *
 * The one thing that separates a hotel sign of the 1920s from a modern one at
 * any distance where the letterform itself is three pixels wide. Applied by
 * widening the ends of anything tall and narrow, rather than by drawing each
 * serif by hand into forty glyph definitions.
 */
export function serifed(glyph: readonly Rect[], amount = 0.12): Rect[] {
  const out: Rect[] = [...glyph]
  for (const [x, y, w, h] of glyph) {
    if (w > 0.3 || h < 0.45) continue
    out.push([x - amount / 2, y, w + amount, 0.08])
    if (h > 0.8) out.push([x - amount / 2, y + h - 0.08, w + amount, 0.08])
  }
  return out
}

/**
 * A word as one group of boxes, laid out left to right and centred on x = 0.
 *
 * The whole word is built in the XY plane facing −Z, which is the direction
 * everything else in this codebase calls forward, so a sign can be placed with
 * the same rules as any other part of a facade.
 */
export function buildWord(
  text: string,
  size: number,
  depth: number,
  material: THREE.Material,
  tracking = 0.16,
  serif = false,
): THREE.Group {
  const group = new THREE.Group()
  const advance = 1 + tracking
  const width = (text.length * advance - tracking) * size

  text.split('').forEach((character, index) => {
    // Case-sensitive: the lower-case forms are their own glyphs, and falling
    // back to the capital would silently set the whole word in caps.
    const raw = GLYPHS[character] ?? GLYPHS[character.toUpperCase()]
    if (!raw) return
    const glyph = serif ? serifed(raw) : raw
    const left = index * advance * size - width / 2
    for (const [x, y, w, h] of glyph) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w * size, h * size, depth), material)
      mesh.position.set(left + (x + w / 2) * size, (y + h / 2) * size, 0)
      mesh.castShadow = true
      group.add(mesh)
    }
  })
  return group
}

/** How wide `buildWord` will come out, for sizing the board behind it. */
export function wordWidth(text: string, size: number, tracking = 0.16): number {
  return (text.length * (1 + tracking) - tracking) * size
}

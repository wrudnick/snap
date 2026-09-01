/**
 * Camera bodies.
 *
 * A body decides what a photograph *looks like* and how you see it: the film it
 * carries, the frame that film is, the viewfinder you compose through, and how
 * many exposures you get. A lens decides what you can reach. They are separate
 * because they answer different complaints — see `docs/PROGRESSION.md`.
 */

/**
 * Film formats, in millimetres.
 *
 * The format is doing more work than it looks. It sets the frame's aspect *and*
 * what any focal length means: a 45mm is a normal-to-long lens on 35mm film and
 * a wide one on medium format, because the film behind it is half again as tall.
 * So the format is chosen first and everything else follows from it, rather than
 * a field of view being picked by eye — which is how the first pass ended up
 * with a "45mm" that was really behaving like a 29.
 */
export const FORMATS = {
  /** 35mm film. 3:2, and the reason a postcard is 3:2. */
  film35: { width: 36, height: 24 },
  /** 6x4.5. 4:3, and a 45mm on it is wide. */
  medium645: { width: 56, height: 42 },
} as const

export interface Format {
  width: number
  height: number
}

export interface CameraBody {
  id: string
  displayName: string
  format: Format
  /**
   * Focal length in millimetres, of the fixed lens or the one fitted.
   *
   * The honest unit. A field of view in degrees is a derived number that means
   * nothing without knowing the film behind it, and expressing lenses this way
   * means the shop can say "28mm" and have it be true rather than decorative.
   */
  focalLength: number
  /** Vertical field of view held at your side. What you take in, not what it does. */
  fovHeld: number
  /**
   * How much of the view the frame lines occupy, 0..1.
   *
   * A bright-line finder shows the frame *inside* a slightly larger view, so you
   * can see what is about to walk into the picture. Below 1 there is surround;
   * at 1 the frame is the whole view and the finder stops being a finder.
   */
  coverage: number
  /** Null on a body with a fixed lens. */
  zoom: { min: number; max: number } | null
  finder: 'brightline'
  film: {
    /** 0..1. Grain is the tell that says film rather than sensor. */
    grain: number
    /** 0..1 warm shift. Consumer colour negative runs warm. */
    warmth: number
    /** 0..1 corner falloff. A cheap lens does this and it flatters a postcard. */
    vignette: number
  }
  exposures: number
  /**
   * Supporting subjects contribute `points / (sceneDivisor × rank)`.
   *
   * A property of the glass rather than a global constant. Wide is for scenes
   * and scores the supporting cast generously; long is for subjects and barely
   * scores it at all.
   */
  sceneDivisor: number
  /** What it costs. Zero for the one you start with. */
  price: number
}

/** The frame's aspect, width over height. */
export const formatAspect = (f: Format): number => f.width / f.height

/** Vertical angle of view, in degrees, of `focal` mm on `format`. */
export function verticalFov(format: Format, focal: number): number {
  return (2 * Math.atan(format.height / (2 * focal) ) * 180) / Math.PI
}

/**
 * The field of view the *camera* needs so that the *frame* sees the lens's own.
 *
 * The frame covers only part of the view, so pointing the camera at the lens's
 * angle would make the frame tighter than the lens really is. Widened by the
 * coverage, which keeps the photograph honest to the focal length printed on
 * the barrel.
 */
export function raisedFov(body: CameraBody): number {
  const lens = (verticalFov(body.format, body.focalLength) * Math.PI) / 360
  return (2 * Math.atan(Math.tan(lens) / body.coverage) * 180) / Math.PI
}

/**
 * The one you start with: a fixed-lens compact.
 *
 * 45mm on 35mm film — slightly longer than normal, which is what makes a street
 * feel like it is closing in. No zoom, no choice of frame, and a bright-line
 * finder that shows a little more than it takes. Everything the shop sells later
 * answers something this camera cannot do, so it has to be genuinely good at one
 * thing and honestly limited at the rest.
 */
export const COMPACT: CameraBody = {
  id: 'compact',
  displayName: 'Compact 45',
  format: FORMATS.film35,
  focalLength: 45,
  // Roughly what you take in without a camera at your eye.
  fovHeld: 65,
  coverage: 0.86,
  zoom: null,
  finder: 'brightline',
  film: { grain: 0.35, warmth: 0.22, vignette: 0.3 },
  exposures: 80,
  sceneDivisor: 5,
  price: 0,
}

/**
 * A wider lens, and the first thing worth buying.
 *
 * 28mm on the same film: 65 degrees across instead of 44. It exists to answer a
 * complaint the 45mm creates — you cannot get far enough back on a thirty-metre
 * street — and it buys height without tilt, which is the Level penalty the
 * rubric spends all its time punishing.
 *
 * And it scores scenes differently, which is the part that matters. A wide lens
 * is an instrument for scenes, so its supporting cast counts for more; a long
 * lens is an instrument for subjects and would count for less. That is what
 * makes buying glass change *what kind of photograph you are taking* rather
 * than making the same photograph worth more — the difference between a shop
 * worth visiting and a list of stat upgrades.
 */
export const WIDE: CameraBody = {
  ...COMPACT,
  id: 'wide',
  displayName: 'Wide 28',
  focalLength: 28,
  fovHeld: 78,
  // Cheap wide glass vignettes harder, which flatters a postcard.
  film: { grain: 0.35, warmth: 0.22, vignette: 0.42 },
  sceneDivisor: 3,
  price: 240,
}

export const BODIES: Record<string, CameraBody> = {
  [COMPACT.id]: COMPACT,
  [WIDE.id]: WIDE,
}

/**
 * The largest frame of `aspect` that fits inside a view, as fractions of it.
 *
 * Used for two different fits and they must not drift: the whole game is
 * letterboxed to the film's aspect by this, and the finder's frame is placed
 * inside that by it again.
 */
export function fitAspect(
  viewAspect: number,
  frameAspect: number,
): { width: number; height: number; x: number; y: number } {
  const width = viewAspect > frameAspect ? frameAspect / viewAspect : 1
  const height = viewAspect > frameAspect ? 1 : viewAspect / frameAspect
  return { width, height, x: (1 - width) / 2, y: (1 - height) / 2 }
}

/**
 * The finder's frame within the rendered view, as fractions.
 *
 * The rectangle three places have to agree on exactly: the bright lines drawn on
 * screen, the region the capture reads back, and the aspect handed to scoring.
 * Any two disagreeing means the player composes against one frame and is judged
 * on another, and nothing on screen would ever say so.
 */
export function finderCrop(
  viewAspect: number,
  body: CameraBody,
): { width: number; height: number; x: number; y: number } {
  const fit = fitAspect(viewAspect, formatAspect(body.format))
  const width = fit.width * body.coverage
  const height = fit.height * body.coverage
  return { width, height, x: (1 - width) / 2, y: (1 - height) / 2 }
}

/**
 * Camera bodies.
 *
 * A body decides what a photograph *looks like* and how you see it: the frame it
 * shoots, the viewfinder you compose through, the film in it, and how many
 * exposures you get. A lens decides what you can reach. They are separate
 * because they answer different complaints — see `docs/PROGRESSION.md`.
 */
export interface CameraBody {
  id: string
  displayName: string
  /**
   * Frame aspect, width over height. 35mm film is 3:2, and this is not the
   * viewport — the photograph is the finder's crop of what is on screen.
   */
  aspect: number
  /** Vertical field of view held at your side. What you take in, not what it does. */
  fovHeld: number
  /** Vertical field of view through the finder: the lens's own framing. */
  fovRaised: number
  /**
   * Null on a body with a fixed lens.
   *
   * Raising the camera is not zooming. The view narrows because your eye and a
   * forty-millimetre lens do not take in the same amount, and the player never
   * chose the number. Zoom arrives with glass that has one.
   */
  zoom: { min: number; max: number } | null
  /** Which furniture the viewfinder draws. */
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
}

/**
 * The one you start with: a fixed-lens compact.
 *
 * No zoom, no choice of frame, and a bright-line finder that shows a little more
 * than it takes. Everything the shop sells later is an answer to something this
 * camera cannot do, so it has to be *good* at what it does and honestly limited
 * at the rest — a bad starting camera makes the first hour bad, and a versatile
 * one leaves the shop with nothing to sell.
 */
export const COMPACT: CameraBody = {
  id: 'compact',
  displayName: 'Compact 40',
  // 3:2. The postcard is not a widescreen frame and never was.
  aspect: 3 / 2,
  fovHeld: 68,
  fovRaised: 44,
  zoom: null,
  finder: 'brightline',
  film: { grain: 0.35, warmth: 0.22, vignette: 0.3 },
  exposures: 80,
}

export const BODIES: Record<string, CameraBody> = { [COMPACT.id]: COMPACT }

/**
 * The largest frame of `aspect` that fits inside a viewport, as fractions.
 *
 * The photograph is a crop of what is rendered, so this is needed in three
 * places that must agree exactly: the mask the finder draws, the region the
 * capture reads back, and the aspect the snapshot reports to scoring. Any two of
 * them disagreeing means the player is composing against one rectangle and being
 * judged on another.
 */
export function frameCrop(
  viewportAspect: number,
  frameAspect: number,
): { width: number; height: number; x: number; y: number } {
  const width = viewportAspect > frameAspect ? frameAspect / viewportAspect : 1
  const height = viewportAspect > frameAspect ? 1 : viewportAspect / frameAspect
  return { width, height, x: (1 - width) / 2, y: (1 - height) / 2 }
}

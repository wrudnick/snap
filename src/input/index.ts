import { NorthReference, wrapPi } from '@/lib/deviceOrientation'

/**
 * Input abstraction.
 *
 * Game code only ever reads `InputState`. Adapters write to it. Mouse+keyboard
 * ships now; a GamepadAdapter reading `navigator.getGamepads()` slots in later
 * without a single line of game code changing — which is the whole reason this
 * layer exists on day one rather than being retrofitted.
 */

export interface InputState {
  /** Accumulated look delta in pixels since the last frame. Consumed each frame. */
  aimX: number
  aimY: number
  /**
   * True while the camera is up at your eye.
   *
   * Was `zoom`, and the rename is the point rather than tidying. The starting
   * body has a fixed lens: raising it narrows the view because your eye and a
   * forty-millimetre lens do not take in the same amount, not because the player
   * asked for magnification. Zoom arrives later, with glass that has some.
   */
  raise: boolean
  /** Set on a shutter press; the game loop clears it after handling. */
  shutter: boolean
  /** Set on a throw; the game loop clears it after handling. */
  toss: boolean
  /** Edge-triggered speed changes; the loop clears them after handling. */
  speedUp: boolean
  speedDown: boolean
  /**
   * Absolute look attitude from a device sensor, or null when there is none.
   *
   * `absoluteYaw` is a world heading in three's convention — the same frame as
   * the camera's own rotation.y. The rig does not use it as a heading, though:
   * it takes the *difference* from a stored reference bearing, so what reaches
   * the camera is how far the phone has turned from forward. See the rig.
   *
   * When these are set they replace the accumulated `aim` deltas rather than
   * adding to them: the whole point of absolute is that the phone's attitude
   * *is* the answer, so anything else contributing would make it drift again.
   */
  absoluteYaw: number | null
  absolutePitch: number | null
  /** Re-align "forward" with the way the phone is currently pointing. */
  recentre: boolean
  /** Jump to the next checkpoint. */
  nextCheckpoint: boolean
  /** Jump back to the previous checkpoint. */
  prevCheckpoint: boolean
  /** Toggle travel. */
  togglePause: boolean
  /** Seek straight to a route position, set by clicking the minimap. */
  seekTo: number | null
}

export const input: InputState = {
  aimX: 0,
  aimY: 0,
  raise: false,
  shutter: false,
  toss: false,
  speedUp: false,
  speedDown: false,
  absoluteYaw: null,
  absolutePitch: null,
  recentre: false,
  nextCheckpoint: false,
  prevCheckpoint: false,
  togglePause: false,
  seekTo: null,
}

/** Called by the game loop once per frame, after reading the look delta. */
export function consumeAim(): void {
  input.aimX = 0
  input.aimY = 0
}

export interface InputAdapter {
  attach(element: HTMLElement): void
  detach(): void
  /** Polled adapters (gamepad) do their work here. Event-driven ones no-op. */
  poll?(): void
}

/**
 * Mouse + keyboard.
 *
 * Uses Pointer Lock so the player can keep panning past the edge of the screen,
 * which matters when tracking a subject across a wide look cone. Falls back to
 * drag-to-look if pointer lock is refused.
 */
export class PointerKeyboardAdapter implements InputAdapter {
  private element: HTMLElement | null = null
  private dragging = false
  private locked = false

  attach(element: HTMLElement): void {
    this.element = element
    element.addEventListener('pointerdown', this.onPointerDown)
    element.addEventListener('pointermove', this.onPointerMove)
    window.addEventListener('pointerup', this.onPointerUp)
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('contextmenu', this.onContextMenu)
    document.addEventListener('pointerlockchange', this.onLockChange)
  }

  detach(): void {
    const element = this.element
    if (element) {
      element.removeEventListener('pointerdown', this.onPointerDown)
      element.removeEventListener('pointermove', this.onPointerMove)
    }
    window.removeEventListener('pointerup', this.onPointerUp)
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('contextmenu', this.onContextMenu)
    document.removeEventListener('pointerlockchange', this.onLockChange)
    if (document.pointerLockElement) document.exitPointerLock()
    this.element = null
  }

  private onLockChange = (): void => {
    this.locked = document.pointerLockElement === this.element
  }

  private onContextMenu = (e: Event): void => {
    // Right-drag raises the camera; the menu would interrupt it.
    e.preventDefault()
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (e.button === 2) {
      input.raise = true
      return
    }
    if (e.button !== 0) return

    if (this.locked) {
      input.shutter = true
      return
    }
    // First click grabs the pointer rather than firing the shutter, so the
    // player doesn't burn a frame of film just entering the game.
    this.dragging = true
    void this.element?.requestPointerLock?.()
  }

  private onPointerMove = (e: PointerEvent): void => {
    if (this.locked) {
      input.aimX += e.movementX
      input.aimY += e.movementY
    } else if (this.dragging) {
      input.aimX += e.movementX
      input.aimY += e.movementY
    }
  }

  private onPointerUp = (e: PointerEvent): void => {
    if (e.button === 2) input.raise = false
    if (e.button === 0) this.dragging = false
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'Space') {
      e.preventDefault()
      input.shutter = true
    }
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.raise = true

    // Review controls.
    if (e.code === 'BracketRight') input.speedUp = true
    if (e.code === 'BracketLeft') input.speedDown = true
    if (e.code === 'Period') input.nextCheckpoint = true
    if (e.code === 'Comma') input.prevCheckpoint = true
    if (e.code === 'KeyP') input.togglePause = true
    // Next to the shutter on the left hand, so you can throw and shoot without
    // moving off the aim.
    if (e.code === 'KeyE' || e.code === 'KeyF') input.toss = true
  }

  private onKeyUp = (e: KeyboardEvent): void => {
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.raise = false
  }
}

/**
 * Touch.
 *
 * The pointer/keyboard adapter is unusable on a phone and not in an obvious
 * way: `pointerdown` fires for a finger, so look *almost* works, but the
 * shutter is gated on `this.locked` and Pointer Lock does not exist on iOS — so
 * the game runs, pans, and can never take a photograph. Everything else (raise,
 * pause, checkpoints) is on keys that no phone has.
 *
 * So this is a whole adapter rather than a branch in that one. The split is
 * along a real seam: one finger dragging anywhere is look, and every discrete
 * action is a button the HUD draws. Buttons write straight into `input`, which
 * is why they need no adapter of their own.
 *
 * Two-finger pinch raises the camera, because on a phone the alternative — holding a
 * button with one thumb while framing with the other — is how you get a blurry
 * photograph of your own hand.
 */
export class TouchAdapter implements InputAdapter {
  private element: HTMLElement | null = null
  /** Pointer id → last position, so a second finger doesn't yank the camera. */
  private readonly points = new Map<number, { x: number; y: number }>()
  private pinchDistance = 0
  /**
   * Whether the camera was raised by a pinch.
   *
   * Releasing a pinch used to clear the flag on any pointerup at all, which was
   * invisible while the control was press-and-hold — the button set it again on
   * the very next frame. Once the button became a toggle, tapping it armed the
   * camera and the tap's own pointerup immediately disarmed it, so the control
   * did nothing. A pinch may only take back what a pinch gave.
   */
  private pinchOwnsRaise = false

  /** Last accepted absolute yaw, and how many readings have been thrown away. */
  private lastYaw: number | null = null
  private rejected = 0
  /** Where the device's alpha zero sits relative to north. See NorthReference. */
  private readonly north = new NorthReference()

  attach(element: HTMLElement): void {
    this.element = element
    element.addEventListener('pointerdown', this.onDown)
    element.addEventListener('pointermove', this.onMove)
    window.addEventListener('pointerup', this.onUp)
    window.addEventListener('pointercancel', this.onUp)
    // `deviceorientationabsolute` is the north-referenced one where it exists;
    // both are attached because iOS has only the plain event and puts its
    // compass reading on that.
    window.addEventListener('deviceorientationabsolute', this.onOrientation)
    window.addEventListener('deviceorientation', this.onOrientation)
    // Stops the page rubber-banding and the double-tap zoom while framing.
    element.style.touchAction = 'none'
  }

  detach(): void {
    const element = this.element
    if (element) {
      element.removeEventListener('pointerdown', this.onDown)
      element.removeEventListener('pointermove', this.onMove)
      element.style.touchAction = ''
    }
    window.removeEventListener('pointerup', this.onUp)
    window.removeEventListener('pointercancel', this.onUp)
    window.removeEventListener('deviceorientationabsolute', this.onOrientation)
    window.removeEventListener('deviceorientation', this.onOrientation)
    this.points.clear()
    this.lastYaw = null
    this.rejected = 0
    this.north.reset()
    this.pinchOwnsRaise = false
    input.raise = false
    input.absoluteYaw = null
    input.absolutePitch = null
    this.element = null
  }

  /**
   * The phone's own orientation, as look input.
   *
   * Emitted as *deltas* rather than an absolute heading, for two reasons. It
   * composes: a thumb drag and a turn of the wrist add up instead of fighting,
   * so you can point roughly with the phone and trim with a finger. And it
   * needs no recentring — the look cone is an offset on the rail's frame, and
   * an absolute mapping would have to be re-zeroed every time the route turned
   * a corner, or the view would swing away as you walked round it.
   *
   * `alpha` is rotation about the vertical axis and `beta` the front-to-back
   * tilt, which for a phone held up like a camera are exactly yaw and pitch.
   * Roll (`gamma`) is deliberately ignored: tilting the phone sideways should
   * not tilt the horizon in a game whose whole subject is framing.
   */
  private onOrientation = (e: DeviceOrientationEvent): void => {
    const attitude = this.north.update(e)

    if (attitude === null) {
      /**
       * No north, no gyro look.
       *
       * There used to be a relative fallback here that integrated changes in
       * the angles. It is deliberately gone: relative look is the thing that
       * was wrong in the first place, and letting it take over silently on
       * whichever devices lack a compass means the control behaves differently
       * in someone's hand for reasons neither of us can see. Drag still works
       * everywhere.
       */
      input.absoluteYaw = null
      input.absolutePitch = null
      return
    }

    /**
     * Bearing counts clockwise from north; three's yaw counts anticlockwise
     * from −Z, and the world is laid out with −Z as north. So the two are the
     * same angle with opposite signs.
     */
    const yaw = -attitude.bearing

    /**
     * Reject a jump no wrist can make.
     *
     * Belt and braces on top of the fix in `attitudeFromEvent`: at sixty
     * readings a second a bearing cannot move a hundred degrees between two of
     * them, so anything that does is the sensor and not the player. Given up on
     * after a dozen, because a genuine fast turn has to be able to re-sync —
     * otherwise one bad reading would lock the view for the rest of the run.
     */
    const previous = this.lastYaw
    if (previous !== null && Math.abs(wrapPi(yaw - previous)) > 1.75) {
      this.rejected += 1
      if (this.rejected < 12) return
    }
    this.rejected = 0
    this.lastYaw = yaw

    input.absoluteYaw = yaw
    input.absolutePitch = attitude.elevation
  }


  private spread(): number {
    const [a, b] = [...this.points.values()]
    if (!a || !b) return 0
    return Math.hypot(a.x - b.x, a.y - b.y)
  }

  private onDown = (e: PointerEvent): void => {
    this.points.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (this.points.size === 2) this.pinchDistance = this.spread()
  }

  private onMove = (e: PointerEvent): void => {
    const last = this.points.get(e.pointerId)
    if (!last) return
    const dx = e.clientX - last.x
    const dy = e.clientY - last.y
    last.x = e.clientX
    last.y = e.clientY

    if (this.points.size >= 2) {
      /**
       * Pinch to bring the camera up, because people will try it.
       *
       * Held rather than proportional: `input.raise` is a boolean the rig lerps
       * toward, matching the Shift key it mirrors. Spreading raises the camera
       * and it stays up until the fingers come back together. There is nothing
       * proportional to control on a fixed lens, and when a zoom lens exists it
       * wants its own continuous value rather than this.
       */
      const now = this.spread()
      if (this.pinchDistance > 0) {
        if (now - this.pinchDistance > 24) {
          input.raise = true
          this.pinchOwnsRaise = true
        }
        if (this.pinchDistance - now > 24) {
          input.raise = false
          this.pinchOwnsRaise = false
        }
      }
      return
    }

    /**
     * `movementX` is unreliable on touch — Safari reports 0 for it — so the
     * delta is tracked here. Scaled down: a phone screen is small enough that
     * raw pixels of drag make the look cone unusably twitchy.
     */
    input.aimX += dx * 0.9
    input.aimY += dy * 0.9
  }

  private onUp = (e: PointerEvent): void => {
    this.points.delete(e.pointerId)
    if (this.points.size < 2) {
      this.pinchDistance = 0
      if (this.pinchOwnsRaise) {
        input.raise = false
        this.pinchOwnsRaise = false
      }
    }
  }
}

/**
 * Does this device want the touch adapter?
 *
 * Coarse pointer *and* no hover: a laptop with a touchscreen has both a fine
 * pointer and hover, and should keep the keyboard controls. Checked once at
 * attach rather than watched, because swapping input schemes mid-run would be
 * more surprising than being wrong on a hybrid device.
 */
export function prefersTouch(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(hover: none) and (pointer: coarse)').matches
}

/**
 * How far the screen is rotated from its natural orientation, in degrees.
 *
 * `screen.orientation` is the modern answer and `window.orientation` the one
 * older iOS gives; normalised to 0/90/180/270 so callers can switch on it.
 */
export function screenAngle(): number {
  if (typeof window === 'undefined') return 0
  const modern = window.screen?.orientation?.angle
  if (typeof modern === 'number') return ((modern % 360) + 360) % 360
  const legacy = (window as { orientation?: number }).orientation
  if (typeof legacy === 'number') return ((legacy % 360) + 360) % 360
  return 0
}

/** True when the device is being held upright rather than on its side. */
export function isPortrait(): boolean {
  if (typeof window === 'undefined') return false
  const angle = screenAngle()
  if (angle === 90 || angle === 270) return false
  // Falls back to the viewport when there is no orientation API at all.
  return window.innerHeight >= window.innerWidth
}

/**
 * Ask iOS for the motion sensors.
 *
 * iOS 13 and later will not deliver `deviceorientation` at all until this is
 * called, and it must be called from inside a user gesture — so it hangs off
 * the button that starts the run rather than off page load, where it would be
 * silently refused.
 *
 * It also requires a secure context: over plain http on a LAN address the
 * prompt never appears and the sensors stay dark, which is why the phone build
 * has to be served over https.
 *
 * Resolves either way. A phone that declines still has drag-to-look, so this is
 * never worth blocking the game on.
 */
export async function requestMotionAccess(): Promise<boolean> {
  const ctor = (globalThis as { DeviceOrientationEvent?: unknown }).DeviceOrientationEvent as
    | { requestPermission?: () => Promise<'granted' | 'denied'> }
    | undefined
  if (!ctor?.requestPermission) return true
  try {
    return (await ctor.requestPermission()) === 'granted'
  } catch {
    return false
  }
}

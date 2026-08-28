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
  /** True while the zoom control is held. */
  zoom: boolean
  /** Set on a shutter press; the game loop clears it after handling. */
  shutter: boolean
  /** Edge-triggered speed changes; the loop clears them after handling. */
  speedUp: boolean
  speedDown: boolean
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
  zoom: false,
  shutter: false,
  speedUp: false,
  speedDown: false,
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
    // Right-drag is zoom; the menu would interrupt it.
    e.preventDefault()
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (e.button === 2) {
      input.zoom = true
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
    if (e.button === 2) input.zoom = false
    if (e.button === 0) this.dragging = false
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'Space') {
      e.preventDefault()
      input.shutter = true
    }
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.zoom = true

    // Review controls.
    if (e.code === 'BracketRight') input.speedUp = true
    if (e.code === 'BracketLeft') input.speedDown = true
    if (e.code === 'Period') input.nextCheckpoint = true
    if (e.code === 'Comma') input.prevCheckpoint = true
    if (e.code === 'KeyP') input.togglePause = true
  }

  private onKeyUp = (e: KeyboardEvent): void => {
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') input.zoom = false
  }
}

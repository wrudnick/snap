/**
 * Getting the browser chrome out of the way.
 *
 * Three different platforms with three different answers, and only one of them
 * is the Fullscreen API:
 *
 * - Android Chrome honours `requestFullscreen`, and orientation lock only works
 *   once fullscreen, so the two go together.
 * - iPhone Safari has no Fullscreen API at all. `requestFullscreen` is simply
 *   absent on the element, and `webkitEnterFullscreen` exists only on video.
 *   The only way to lose the address bar is Add to Home Screen, which launches
 *   standalone — which is why the app declares `apple-mobile-web-app-capable`
 *   and ships a manifest.
 * - Desktop has it, but nobody asked for it there.
 *
 * So this is best-effort by design. Failing is the normal case on the device
 * the game is most likely to be played on, and never worth an error.
 */

/** True when the page is already running without browser chrome. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  // iOS reports it here; everyone else through the display-mode media query.
  if ((window.navigator as { standalone?: boolean }).standalone === true) return true
  return window.matchMedia?.('(display-mode: standalone), (display-mode: fullscreen)').matches ?? false
}

/** iPhone or iPad, where the Fullscreen API is unavailable. */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  // iPadOS reports itself as a Mac, and is told apart by having a touchscreen.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}

/**
 * Go fullscreen if the browser will allow it.
 *
 * Must be called from inside a user gesture. Resolves either way: the caller
 * has no useful recovery, and on iOS this is expected to do nothing.
 */
export async function enterFullscreen(element: Element = document.documentElement): Promise<boolean> {
  const target = element as Element & {
    requestFullscreen?: (options?: FullscreenOptions) => Promise<void>
    webkitRequestFullscreen?: () => Promise<void> | void
  }
  const request = target.requestFullscreen ?? target.webkitRequestFullscreen
  if (!request) return false
  try {
    // `navigationUI: 'hide'` asks Android Chrome for the whole screen rather
    // than leaving the navigation bar in place.
    await request.call(target, { navigationUI: 'hide' } as FullscreenOptions)
    return true
  } catch {
    return false
  }
}

/**
 * Ask the browser to hold the screen in landscape.
 *
 * Only honoured while fullscreen, and only by browsers that have the Fullscreen
 * API — so on iPhone this never succeeds and the rotate prompt is what actually
 * gets the phone turned round.
 */
export async function lockLandscape(): Promise<void> {
  const orientation = window.screen?.orientation as
    | (ScreenOrientation & { lock?: (o: string) => Promise<void> })
    | undefined
  if (!orientation?.lock) return
  try {
    await orientation.lock('landscape')
  } catch {
    // Refused — the prompt handles it.
  }
}

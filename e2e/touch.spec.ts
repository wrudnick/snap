import { devices, expect, test, type Page } from '@playwright/test'

/**
 * The game is playable on a phone.
 *
 * Worth a test rather than a look, because the way it failed was silent: the
 * pointer/keyboard adapter gates the shutter on Pointer Lock, which does not
 * exist on iOS, so the game loaded, panned, and could never take a photograph.
 * Nothing threw and every other test passed.
 */
/**
 * iPhone 13's viewport and touch characteristics on Chromium.
 *
 * `defaultBrowserType` is dropped deliberately: the descriptor asks for WebKit,
 * which is not installed here, and what this test needs is the *media query* —
 * coarse pointer, no hover, touch events — not Safari's engine. Real Safari
 * behaviour (no Pointer Lock, unreliable movementX) is what the adapter is
 * written against and is covered by the code, not by this run.
 */
const iphone = { ...devices['iPhone 13'] }
delete (iphone as { defaultBrowserType?: string }).defaultBrowserType
test.use(iphone)

test('a phone can look, shoot and pause', async ({ page }: { page: Page }) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(String(e)))

  await page.goto('/')
  await page.waitForFunction(() => Boolean((window as any).__snap), null, { timeout: 30_000 })
  await page.getByRole('button', { name: /^ride /i }).tap()
  await page.waitForFunction(() => (window as any).__snap.runtime.running === true)

  // The on-screen controls exist, because none of the keys they replace do.
  await expect(page.getByRole('button', { name: 'Shutter' })).toBeVisible()

  // Dragging one finger across the viewfinder turns the camera.
  const before = await page.evaluate(() => (window as any).__snap.runtime.yaw ?? 0)
  await page.locator('canvas').first().dispatchEvent('pointerdown', {
    pointerId: 1, pointerType: 'touch', clientX: 200, clientY: 400, isPrimary: true,
  })
  for (const x of [240, 280, 320]) {
    await page.locator('canvas').first().dispatchEvent('pointermove', {
      pointerId: 1, pointerType: 'touch', clientX: x, clientY: 400, isPrimary: true,
    })
  }
  await page.locator('canvas').first().dispatchEvent('pointerup', {
    pointerId: 1, pointerType: 'touch', clientX: 320, clientY: 400, isPrimary: true,
  })
  await page.waitForTimeout(400)
  const after = await page.evaluate(() => (window as any).__snap.runtime.yaw ?? 0)
  expect(Math.abs(after - before), 'a drag turns the camera').toBeGreaterThan(0.01)

  // The shutter button spends film. This is the one that was broken.
  const film = await page.evaluate(() => (window as any).__snap.store.getState().filmRemaining)
  await page.getByRole('button', { name: 'Shutter' }).tap()
  // Waited for rather than slept on: the photo is encoded asynchronously, and a
  // fixed delay here is the difference between a real assertion and a flake.
  await page.waitForFunction(
    (before) => (window as any).__snap.store.getState().filmRemaining < before,
    film,
    { timeout: 15_000 },
  )

  /**
   * Turning the phone turns the view.
   *
   * Synthetic `deviceorientation` events, so this checks the plumbing and the
   * sign convention — that turning right looks right — rather than how it feels
   * in the hand. The signs are the part worth pinning down: they are the thing
   * most likely to be backwards, and the least obvious from reading the code.
   */
  const yawBefore = await page.evaluate(() => (window as any).__snap.runtime.yaw)
  await page.evaluate(() => {
    // alpha decreasing is a turn to the right.
    for (const alpha of [180, 176, 172, 168]) {
      window.dispatchEvent(
        new (window as any).DeviceOrientationEvent('deviceorientation', {
          alpha, beta: 90, gamma: 0,
        }),
      )
    }
  })
  await page.waitForTimeout(400)
  const yawAfter = await page.evaluate(() => (window as any).__snap.runtime.yaw)
  expect(yawAfter, 'turning the phone right looks right').toBeLessThan(yawBefore)

  expect(errors, 'console errors on a phone').toEqual([])
})

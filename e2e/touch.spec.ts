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
const iphone = { ...devices['iPhone 13 landscape'] }
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
  const point = async (alpha: number, beta: number) => {
    await page.evaluate(
      ([a, b]) => {
        // `absolute: true` is what makes the adapter treat alpha as a true
        // heading rather than integrating changes in it.
        window.dispatchEvent(
          new (window as any).DeviceOrientationEvent('deviceorientationabsolute', {
            alpha: a, beta: b, gamma: 0, absolute: true,
          }),
        )
      },
      [alpha, beta],
    )
    await page.waitForTimeout(250)
  }

  /**
   * Absolute, not relative: the same reading always gives the same view.
   *
   * The relative version integrated changes, so where the camera ended up
   * depended on how the phone happened to be held when the run started. Holding
   * a pose, moving away and coming back is the test that tells the two apart —
   * under integration the second reading would land somewhere else.
   */
  await point(0, 90)
  const first = await page.evaluate(() => (window as any).__snap.runtime.yaw)
  await point(-40, 90)
  const turned = await page.evaluate(() => (window as any).__snap.runtime.yaw)
  expect(turned, 'turning the phone right looks right').toBeLessThan(first)

  await point(0, 90)
  const returned = await page.evaluate(() => (window as any).__snap.runtime.yaw)
  expect(returned, 'the same attitude gives the same view').toBeCloseTo(first, 3)

  /** Tilting the phone up looks up, by the angle it was tilted. */
  await point(0, 110)
  const raised = await page.evaluate(() => (window as any).__snap.runtime.pitch)
  expect(raised, 'tilting the phone up looks up').toBeGreaterThan(0.25)

  /**
   * Zoom is held, and — the part worth pinning down — released.
   *
   * `input.zoom` is a level rather than an edge, so a missing release leaves
   * the camera zoomed for the rest of the run. Pointer capture is what makes
   * that survive a finger sliding off the button, and neither the hold nor the
   * release is visible from reading the markup.
   */
  const wide = await page.evaluate(() => (window as any).__snap.runtime.targetFov)
  await page.getByRole('button', { name: 'Zoom' }).dispatchEvent('pointerdown', {
    pointerId: 7, pointerType: 'touch', isPrimary: true,
  })
  await page.waitForTimeout(300)
  const zoomed = await page.evaluate(() => (window as any).__snap.runtime.targetFov)
  expect(zoomed, 'holding zoom narrows the lens').toBeLessThan(wide)

  await page.getByRole('button', { name: 'Zoom' }).dispatchEvent('pointerup', {
    pointerId: 7, pointerType: 'touch', isPrimary: true,
  })
  await page.waitForTimeout(300)
  const released = await page.evaluate(() => (window as any).__snap.runtime.targetFov)
  expect(released, 'letting go returns to the wide lens').toBe(wide)

  expect(errors, 'console errors on a phone').toEqual([])
})

/**
 * Portrait is covered rather than supported.
 *
 * The look cone is wide and shallow — you pan across a street far more than you
 * tilt up a building — so held upright the viewfinder is a letterbox with the
 * subject outside it. iOS has no orientation lock, so the only thing that
 * actually gets the phone turned round is saying so.
 */
test('portrait asks you to turn the phone', async ({ browser }) => {
  test.setTimeout(120_000)
  const portrait = { ...devices['iPhone 13'] }
  delete (portrait as { defaultBrowserType?: string }).defaultBrowserType
  const context = await browser.newContext(portrait)
  const page = await context.newPage()

  await page.goto('/')
  await page.waitForFunction(() => Boolean((window as any).__snap), null, { timeout: 30_000 })
  await page.getByRole('button', { name: /^ride /i }).tap()
  await expect(page.locator('.rotate')).toBeVisible()
  await context.close()
})

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
  /**
   * Waited for rather than slept on.
   *
   * A fixed pause here failed about two runs in three: the drag is applied on
   * the next frame the rig runs, and how soon that is depends on when the
   * browser next schedules one. Polling for the effect keeps the assertion
   * exactly as strict — if the drag never turns the camera this still fails —
   * while removing the part that was a coin toss.
   */
  await page
    .waitForFunction(
      (start) => Math.abs(((window as any).__snap.runtime.yaw ?? 0) - start) > 0.01,
      before,
      { timeout: 5000 },
    )
    .catch(() => {})
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
  /**
   * Angles for a phone held sideways, which is how this game is played.
   *
   * Not `beta: 90`. That is the phone upright in portrait, and it is the exact
   * pose where the Z-X'-Y'' decomposition loses a degree of freedom and cannot
   * express a heading at all — the tracker deliberately holds its last bearing
   * there rather than emit noise, so a test driving it from that pose is
   * testing nothing. Landscape and level is `beta 0, gamma -90`; tilting up
   * folds gamma past its limit and lands on `beta 180`.
   */
  const point = async (alpha: number, beta: number, gamma: number) => {
    await page.evaluate(
      ([a, b, g]) => {
        // `absolute: true` is what makes the adapter treat alpha as a true
        // heading rather than integrating changes in it.
        window.dispatchEvent(
          new (window as any).DeviceOrientationEvent('deviceorientationabsolute', {
            alpha: a, beta: b, gamma: g, absolute: true,
          }),
        )
      },
      [alpha, beta, gamma],
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
  /**
   * Travel paused for the attitude checks.
   *
   * `runtime.yaw` is an offset from the *rail's* heading, not a world bearing,
   * so while the route is moving the same physical attitude legitimately maps
   * to a slightly different yaw each frame. Pausing removes that from the
   * measurement without mocking anything.
   */
  await page.evaluate(() => { (window as any).__snap.runtime.paused = true })

  /**
   * Warm the compass first.
   *
   * The north tracker needs several readings before it will report a bearing at
   * all — until then there is no absolute look and `runtime.yaw` sits at zero,
   * so both ends of the comparison below were zero and the assertion was
   * measuring nothing. It only surfaced once the shutter stopped blocking for a
   * second, which had been giving the tracker time to settle by accident.
   */
  for (const a of [0, -6, 0, -6, 0]) await point(a, 0, -90)
  await page.waitForFunction(
    () => (window as any).__snap.runtime.yawReference !== null,
    null,
    { timeout: 10_000 },
  )

  await point(0, 0, -90)
  const first = await page.evaluate(() => (window as any).__snap.runtime.yaw)
  await point(-40, 0, -90)
  const turned = await page.evaluate(() => (window as any).__snap.runtime.yaw)
  expect(turned, 'turning the phone right looks right').toBeLessThan(first)

  await point(0, 0, -90)
  const returned = await page.evaluate(() => (window as any).__snap.runtime.yaw)
  expect(returned, 'the same attitude gives the same view').toBeCloseTo(first, 3)

  /**
   * Tilting up in landscape looks up — and does not flip.
   *
   * This is the motion that was broken: gamma runs out of range at -90 and the
   * phone re-expresses the same orientation with beta at 180 and alpha half a
   * turn round. The view used to spin 180 degrees at exactly this point.
   */
  const levelYaw = await page.evaluate(() => (window as any).__snap.runtime.yaw)
  await point(180, 180, 70)
  const raised = await page.evaluate(() => (window as any).__snap.runtime)
  expect(raised.pitch, 'tilting the phone up looks up').toBeGreaterThan(0.25)
  expect(
    Math.abs(raised.yaw - levelYaw),
    'tilting up does not swing the view sideways',
  ).toBeLessThan(0.2)

  /**
   * Turning right round keeps working.
   *
   * The look cone was 1.75 rad, so the view stopped dead about a hundred
   * degrees out while your body kept turning. Nothing about a phone justifies a
   * wall there — the picture has to keep up with the person holding it.
   */
  await point(0, 0, -90)
  await page.getByRole('button', { name: 'Face forward' }).tap()
  await page.waitForTimeout(250)
  expect(
    await page.evaluate(() => (window as any).__snap.runtime.yaw),
    'facing forward zeroes the offset',
  ).toBeCloseTo(0, 2)

  /**
   * Turned in steps, because the adapter rejects a bearing jump no wrist could
   * make — a hundred degrees between two readings is a sensor glitch, not a
   * player. Teleporting the phone in one event tests the noise filter, not the
   * look.
   */
  for (let a = -20; a >= -140; a -= 20) await point(a, 0, -90)
  const wayRound = await page.evaluate(() => (window as any).__snap.runtime.yaw)
  expect(Math.abs(wayRound), 'the view turns past the old cone').toBeGreaterThan(1.9)

  /**
   * And forward is wherever you say it is.
   *
   * After following something round you are left holding the phone off to one
   * side. Recentring from there has to make *that* forward, not snap back to
   * some remembered pose.
   */
  await page.getByRole('button', { name: 'Face forward' }).tap()
  await page.waitForTimeout(250)
  expect(
    await page.evaluate(() => (window as any).__snap.runtime.yaw),
    'recentring adopts the pose you are holding',
  ).toBeCloseTo(0, 2)

  /**
   * The camera latches up and down.
   *
   * Was a zoom toggle. The starting body has a fixed lens, so this raises the
   * camera to your eye rather than magnifying — the view still narrows, because
   * an eye and a forty-millimetre lens do not take in the same amount, but the
   * player never chose a number.
   */
  const wide = await page.evaluate(() => (window as any).__snap.runtime.targetFov)
  const zoom = page.getByRole('button', { name: 'Raise camera' })

  await zoom.tap()
  await page.waitForTimeout(300)
  expect(
    await page.evaluate(() => (window as any).__snap.runtime.targetFov),
    'raising the camera narrows the view',
  ).toBeLessThan(wide)
  await expect(zoom).toHaveAttribute('aria-pressed', 'true')

  // A toggle has to toggle back, and has to stay on in between — a held
  // control that lost its release left the camera zoomed for the whole run.
  await zoom.tap()
  await page.waitForTimeout(300)
  expect(
    await page.evaluate(() => (window as any).__snap.runtime.targetFov),
    'lowering it opens back up',
  ).toBe(wide)
  await expect(zoom).toHaveAttribute('aria-pressed', 'false')

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

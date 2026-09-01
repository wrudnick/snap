import { expect, test, type Page } from '@playwright/test'

/**
 * The photograph is the frame you composed in.
 *
 * Three places have to agree on one rectangle: the bright lines the finder
 * draws, the region the capture reads back, and the aspect the snapshot hands
 * to scoring. If any two disagree the player composes against one frame and is
 * judged on another, and nothing on screen would ever say so — the photo would
 * simply be a slightly different picture from the one they took.
 *
 * The body shoots 3:2 and the viewport is not 3:2, which is the whole point:
 * a test on a 3:2 viewport would pass no matter how badly this were wired.
 */
test('what you compose is what you get', async ({ page }: { page: Page }) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 1280, height: 720 }) // 16:9, deliberately
  await page.goto('/')
  await page.waitForFunction(() => Boolean((window as any).__snap), null, { timeout: 20_000 })
  await page.getByRole('button', { name: /^ride /i }).click()
  await page.waitForFunction(() => (window as any).__snap.runtime.running === true)

  // 35mm film. The format sets the frame and gives the focal length meaning.
  const BODY_ASPECT = 36 / 24

  // The finder draws the frame it will shoot.
  const geometry = await page.evaluate(() => {
    const stage = document.querySelector('.stage__view')!.getBoundingClientRect()
    const frame = document.querySelector('.finder__frame')!.getBoundingClientRect()
    return {
      stage: { width: stage.width, height: stage.height },
      frame: { width: frame.width, height: frame.height },
    }
  })

  /**
   * The whole game is letterboxed to the film, not just the photograph.
   *
   * Framing is the mechanic, so how much you can see must not depend on the
   * monitor — otherwise every building is a different difficulty for different
   * players.
   */
  expect(geometry.stage.width / geometry.stage.height, 'the stage is the film\'s aspect')
    .toBeCloseTo(BODY_ASPECT, 2)
  expect(geometry.stage.width, 'pillarboxed inside a 16:9 window').toBeLessThan(1280)

  // And the finder shows the frame inside a little surround, as one does.
  expect(geometry.frame.width / geometry.frame.height, 'the finder draws the film\'s frame')
    .toBeCloseTo(BODY_ASPECT, 2)
  expect(geometry.frame.width, 'with room to see what is about to walk in')
    .toBeLessThan(geometry.stage.width)

  /**
   * Raising narrows the view without the player asking for a number.
   *
   * The starting body has a fixed lens, so this is not zoom: it is the
   * difference between what an eye takes in and what a forty-millimetre lens
   * does.
   */
  const held = await page.evaluate(() => (window as any).__snap.runtime.targetFov)
  await page.evaluate(() => { (window as any).__snap.input.raise = true })
  await page.waitForFunction(() => (window as any).__snap.runtime.raised === true, null, { timeout: 5000 })
  const raised = await page.evaluate(() => (window as any).__snap.runtime.targetFov)
  expect(raised, 'raising the camera narrows the view').toBeLessThan(held)

  /**
   * And it narrows to the focal length on the barrel.
   *
   * 45mm on 35mm film is 29.9 degrees vertically. The camera is widened by the
   * finder's coverage so the *frame* sees that, not the view — which is the
   * difference between a focal length that is true and one that is decorative.
   * Picked by eye, the first pass was 44 degrees: a 29mm lens wearing a 45mm
   * label.
   */
  const lensFov = 2 * (Math.atan(24 / (2 * 45)) * 180) / Math.PI
  const throughFrame = 2 * (Math.atan(Math.tan((raised * Math.PI) / 360) * 0.86) * 180) / Math.PI
  expect(throughFrame, 'the frame sees a real 45mm').toBeCloseTo(lensFov, 0)

  // And the photograph that comes out is that frame.
  await page.evaluate(() => (window as any).__snap.shoot())
  await page.waitForFunction(
    () => (window as any).__snap.store.getState().photos.at(-1)?.url != null,
    null,
    { timeout: 25_000 },
  )

  const photo = await page.evaluate(async () => {
    const p = (window as any).__snap.store.getState().photos.at(-1)
    const size = await new Promise<{ w: number; h: number }>((res, rej) => {
      const img = new Image()
      img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight })
      img.onerror = rej
      img.src = p.url
    })
    return { size, snapshotAspect: p.snapshot.aspect }
  })

  expect(photo.size.w / photo.size.h, 'the saved image is the body\'s frame').toBeCloseTo(BODY_ASPECT, 2)
  expect(photo.snapshotAspect, 'and scoring is told the same frame').toBeCloseTo(BODY_ASPECT, 3)
})

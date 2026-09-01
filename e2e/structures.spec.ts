import { expect, test, type Page } from '@playwright/test'

/**
 * Buildings are things you can photograph.
 *
 * Fifty-two landmarks are modelled from photographs and, until this, were worth
 * nothing — the largest investment in the repository was scenery. This checks
 * the measurements that turn them into subjects, and in particular the one the
 * whole equipment tree is built to answer.
 */
test('a street of buildings can be measured', async ({ page }: { page: Page }) => {
  test.setTimeout(180_000)
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('/')
  await page.waitForFunction(() => Boolean((window as any).__snap), null, { timeout: 20_000 })
  await page.getByRole('button', { name: /^ride /i }).click()
  await page.waitForFunction(() => (window as any).__snap.runtime.running === true)

  /** Shoot from a place on the route, looking level unless told otherwise. */
  const shootAt = async (t: number, pitch = 0) => {
    await page.evaluate(async ([seekTo, p]: number[]) => {
      const h = (window as any).__snap
      h.seek(seekTo!)
      h.runtime.paused = true
      h.input.raise = true
      await new Promise((r) => setTimeout(r, 700))
      h.aim(0, p!)
      await new Promise((r) => setTimeout(r, 400))
      h.shoot()
    }, [t, pitch])
    await page.waitForFunction(
      (n) => (window as any).__snap.store.getState().photos.length > n,
      await page.evaluate(() => (window as any).__snap.store.getState().photos.length),
      { timeout: 20_000 },
    ).catch(() => {})
    await page.waitForTimeout(1200)
    return page.evaluate(() => {
      const p = (window as any).__snap.store.getState().photos.at(-1)
      return p?.snapshot?.structures ?? []
    })
  }

  // Michigan Avenue, level.
  const level = await shootAt(0.4, 0)
  expect(level.length, 'a street of named buildings is in frame').toBeGreaterThan(0)

  for (const s of level) {
    /**
     * Fill is silhouette area over frame area, so it goes past 1 for anything
     * you are standing under — measured at 2.3 for 900 North Michigan from Lake
     * Shore Drive. That is not an error, it is the reading that tells the
     * scoring the building is far too big in frame, and an earlier bound of 1.5
     * here only passed because this shot happened not to contain one.
     */
    expect(s.fill, `${s.name} covers a sane share of frame`).toBeGreaterThan(0)
    expect(s.fill).toBeLessThan(20)
    expect(s.inFrame, `${s.name} is at least partly in frame`).toBeGreaterThan(0)
    expect(s.inFrame).toBeLessThanOrEqual(1.0001)
    expect(s.angularHeight, `${s.name} stands through some of the view`).toBeGreaterThan(0)
    expect(s.faceAngle).toBeGreaterThanOrEqual(0)
    expect(s.faceAngle).toBeLessThanOrEqual(Math.PI / 2 + 0.01)
    expect(s.visibility).toBeGreaterThanOrEqual(0)
    expect(s.visibility).toBeLessThanOrEqual(1)
  }

  /**
   * The shot the game is meant to withhold.
   *
   * Tilting up from the pavement to fit a tower is the move the keystone rule
   * exists to punish, and it is the entire argument for buying the Playpen.
   * Convergence is tilt times angular height, so this asserts the two together
   * rather than either alone.
   */
  const tilted = await shootAt(0.4, 0.5)
  const tall = tilted
    .filter((s: any) => s.angularHeight > 0.4)
    .sort((a: any, b: any) => b.angularHeight - a.angularHeight)

  expect(tall.length, 'something tall is overhead on Michigan Avenue').toBeGreaterThan(0)
  const worst = tall[0]
  expect(Math.abs(worst.pitch), 'the camera really was tilted up').toBeGreaterThan(0.3)
  expect(
    Math.abs(worst.pitch) * worst.angularHeight,
    `${worst.name} keystones badly from the pavement`,
  ).toBeGreaterThan(0.2)
})

import { test, type Page } from '@playwright/test'

const OUT = 'test-results/walk'

// A playthrough at eye level — what the player actually sees, not a survey of
// the ground. Yaw turns the head where there is something to look at.
const STOPS: Array<{ n: string; t: number; yaw?: number; pitch?: number }> = [
  { n: '01-beach', t: 0.02, yaw: 0.9 },
  { n: '02-beach-dog', t: 0.05, yaw: 0.35 },
  { n: '03-underpass', t: 0.10 },
  { n: '04-lake-shore', t: 0.17 },
  { n: '05-lake-shore-crowd', t: 0.20, yaw: -0.5 },
  { n: '06-michigan-top', t: 0.37 },
  { n: '07-michigan-tourists', t: 0.43, yaw: 0.45 },
  { n: '08-michigan-hancock', t: 0.47, yaw: -0.7, pitch: 0.28 },
  { n: '09-michigan-south', t: 0.50 },
  { n: '10-delaware', t: 0.56 },
  { n: '11-delaware-quiet', t: 0.65, yaw: -0.4 },
  { n: '12-rush-join', t: 0.72 },
  { n: '13-rush-patios', t: 0.80, yaw: 0.5 },
  { n: '14-rush-strip', t: 0.86 },
  { n: '15-triangle', t: 0.92, yaw: -0.6 },
  { n: '16-alley', t: 0.965 },
  { n: '17-kitchen', t: 0.985 },
  { n: '18-bar', t: 0.999, yaw: 0.4 },
]

/**
 * A playthrough, as images, for looking at.
 *
 * Not a test — it asserts nothing, and `shots.spec.ts` already covers the route
 * for runtime errors. This exists because the only way to review how the game
 * *looks* is to look at it, and reviewing happens away from the machine it runs
 * on. Run it with WALK=1 to produce a set in test-results/walk.
 */
test('walkthrough', async ({ page }: { page: Page }) => {
  test.skip(!process.env.WALK, 'set WALK=1 to capture review images')
  test.setTimeout(240_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/?perf=0')
  await page.waitForFunction(() => Boolean((window as any).__snap), null, { timeout: 20_000 })
  await page.getByRole('button', { name: /^ride /i }).click()
  await page.waitForFunction(() => (window as any).__snap.runtime.running === true)

  for (const s of STOPS) {
    await page.evaluate(async (stop) => {
      const h = (window as any).__snap
      h.seek(stop.t)
      h.runtime.paused = true
      h.aim(stop.yaw ?? 0, stop.pitch ?? -0.06)
      await new Promise((r) => setTimeout(r, 1100))
    }, s)
    await page.screenshot({ path: `${OUT}/${s.n}.png` })
  }
})

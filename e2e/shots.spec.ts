import { expect, test, type Page } from '@playwright/test'

/**
 * Walks the whole route and saves one screenshot per section.
 *
 * Two jobs. The obvious one is producing images to look at, because a lot of
 * this game's problems are only visible and not testable — a beach whose ripple
 * pattern runs away to the vanishing point looks fine in every assertion.
 *
 * The second is the assertion at the bottom, which earns the run time on its
 * own: a shader that fails to compile does not throw. three.js logs the error
 * and silently stops drawing the mesh, so the ground simply vanishes and every
 * other test still passes. That is exactly how it failed the first time (a
 * variable named `patch`, which is a reserved word in GLSL ES 3.0), and walking
 * the route touches every material in the game.
 */
const OUT = 'test-results/shots'

test('every section renders without a shader or runtime error', async ({ page }: { page: Page }) => {
  test.setTimeout(600_000)
  const errors: string[] = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(String(e)))

  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')
  await page.waitForFunction(() => Boolean((window as any).__snap), null, { timeout: 20_000 })
  await page.getByRole('button', { name: /^ride /i }).click()
  await page.waitForFunction(() => (window as any).__snap.runtime.running === true)

  const seen = new Map<string, number>()

  // Dense enough for five to ten frames in every section, which is what it
  // takes to spot a model floating or a wall through the path — one frame per
  // section only tells you the section exists.
  const STEPS = 90
  for (let i = 0; i < STEPS; i++) {
    const t = 0.01 + (i / (STEPS - 1)) * 0.98
    const label = await page.evaluate(async (seekTo) => {
      const h = (window as any).__snap
      h.seek(seekTo)
      h.runtime.paused = true
      h.aim(0, -0.26)
      await new Promise((r) => setTimeout(r, 450))
      const el = document.querySelector('.hud__section, .hud h2, .hud [class*="section"]')
      return (el?.textContent ?? 'unknown').trim().toLowerCase().replace(/[^a-z]+/g, '-')
    }, t)

    const n = (seen.get(label) ?? 0) + 1
    seen.set(label, n)
    if (n <= 10) {
      await page.screenshot({ path: `${OUT}/${label}-${String(n).padStart(2, '0')}.png` })
    }
  }

  expect(errors, 'console errors while walking the route').toEqual([])
})

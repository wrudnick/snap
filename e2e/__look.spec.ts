import { test, type Page } from '@playwright/test'

/**
 * A look at the map, as opposed to a test that it did not crash.
 *
 * `shots.spec.ts` aims down at the pavement, which is right for spotting a
 * subject floating or a kerb in the wrong place and useless for judging
 * buildings — they are cropped off the top of every frame. This aims level and
 * turns to both sides of the street, because the question here is whether the
 * facades hold up.
 */
const OUT = '/private/tmp/claude-501/-Users-williamrudnick-repos-baskin/209e6df3-bf9f-46a8-bffd-0aee7c9da561/scratchpad/look'

test('look at both sides of the street', async ({ page }: { page: Page }) => {
  test.setTimeout(900_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/?perf=0')
  await page.waitForFunction(() => Boolean((window as any).__snap), null, { timeout: 20_000 })
  await page.getByRole('button', { name: /^ride /i }).click()
  await page.waitForFunction(() => (window as any).__snap.runtime.running === true)

  const STOPS = 22
  for (let i = 0; i < STOPS; i++) {
    const t = 0.02 + (i / (STOPS - 1)) * 0.96
    for (const [tag, yaw, pitch] of [['L', -1.15, 0.16], ['R', 1.15, 0.16]] as const) {
      const label = await page.evaluate(async ([seekTo, y, p]: number[]) => {
        const h = (window as any).__snap
        h.seek(seekTo!)
        h.runtime.paused = true
        h.aim(y!, p!)
        await new Promise((r) => setTimeout(r, 420))
        const el = document.querySelector('.hud__section, .hud h2, .hud [class*="section"]')
        return (el?.textContent ?? 'x').trim().toLowerCase().replace(/[^a-z]+/g, '-')
      }, [t, yaw, pitch])
      await page.screenshot({ path: `${OUT}/${String(i).padStart(2, '0')}-${label}-${tag}.png` })
    }
  }
})

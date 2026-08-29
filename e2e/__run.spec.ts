import { test, type Page } from '@playwright/test'

const OUT = '/private/tmp/claude-501/-Users-williamrudnick-repos-baskin/209e6df3-bf9f-46a8-bffd-0aee7c9da561/scratchpad/run'

test('ride the whole route', async ({ page }: { page: Page }) => {
  test.setTimeout(600_000)
  const errors: string[] = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(String(e)))

  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/?perf=0')
  await page.waitForFunction(() => Boolean((window as any).__snap), null, { timeout: 20_000 })
  await page.getByRole('button', { name: /^ride /i }).click()
  await page.waitForFunction(() => (window as any).__snap.runtime.running === true)

  const SHOTS = 26
  for (let i = 0; i < SHOTS; i++) {
    const t = (i + 0.5) / SHOTS
    // Seek, then let it RUN for a beat so animations and behaviours advance —
    // a paused frame hides everything that only looks wrong in motion.
    const label = await page.evaluate(async (seekTo) => {
      const h = (window as any).__snap
      h.seek(seekTo)
      h.runtime.paused = false
      await new Promise((r) => setTimeout(r, 1400))
      const el = document.querySelector('.hud__section, .hud h2, .hud [class*="section"]')
      return (el?.textContent ?? '?').trim().toLowerCase().replace(/[^a-z]+/g, '-')
    }, t)
    await page.screenshot({ path: `${OUT}/${String(i).padStart(2, '0')}-${label}.png` })
  }

  if (errors.length) console.log(`CONSOLE ERRORS:\n${errors.slice(0, 10).join('\n')}`)
})

import { test, type Page } from '@playwright/test'
const OUT = '/private/tmp/claude-501/-Users-williamrudnick-repos-baskin/209e6df3-bf9f-46a8-bffd-0aee7c9da561/scratchpad/seq'
test('underpass sequence', async ({ page }: { page: Page }) => {
  test.setTimeout(300_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/?perf=0&scrub=0')
  await page.waitForFunction(() => Boolean((window as any).__snap), null, { timeout: 20_000 })
  await page.getByRole('button', { name: /^ride /i }).click()
  await page.waitForFunction(() => (window as any).__snap.runtime.running === true)

  const FROM = 0.028
  const TO = 0.262
  const SHOTS = 20
  for (let i = 0; i < SHOTS; i++) {
    const t = FROM + ((TO - FROM) * i) / (SHOTS - 1)
    const label = await page.evaluate(async (seekTo) => {
      const h = (window as any).__snap
      h.seek(seekTo)
      h.runtime.paused = false
      h.aim(0, -0.04)
      await new Promise((r) => setTimeout(r, 900))
      const cam = h.cameraPosition()
      return `${(cam[1] - 1.7).toFixed(1)}m`
    }, t)
    await page.screenshot({ path: `${OUT}/${String(i).padStart(2, '0')}-floor${label}.png` })
  }
})

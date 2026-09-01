import { test, type Page } from '@playwright/test'
const OUT = '/private/tmp/claude-501/-Users-williamrudnick-repos-baskin/209e6df3-bf9f-46a8-bffd-0aee7c9da561/scratchpad/anim'
test('shot', async ({ page }: { page: Page }) => {
  test.setTimeout(300_000)
  await page.setViewportSize({ width: 1400, height: 950 })
  for (const m of (process.env.MODELS ?? '').split(',').filter(Boolean)) {
    const [model, clip, t] = m.split(':')
    const q = [`debug=models`, `model=${model}`, `view=${clip ? 'animation' : 'angles'}`]
    if (clip) q.push(`clip=${clip}`)
    if (t) q.push(`t=${t}`)
    await page.goto(`/?${q.join('&')}`)
    await page.waitForTimeout(1500)
    await page.screenshot({ path: `${OUT}/${model}${clip ? `-${clip}` : ''}.png` })
  }
})

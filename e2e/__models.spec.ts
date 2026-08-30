import { test, type Page } from '@playwright/test'
const OUT = '/private/tmp/claude-501/-Users-williamrudnick-repos-baskin/209e6df3-bf9f-46a8-bffd-0aee7c9da561/scratchpad/models'
test('inspect', async ({ page }: { page: Page }) => {
  test.setTimeout(300_000)
  await page.setViewportSize({ width: 1300, height: 900 })
  await page.goto('/?debug=models')
  await page.waitForTimeout(2500)
  for (const [name, clip] of [['Beachgoer', 'lounge'], ['Beachgoer', 'sunbathe'], ['Beach Club', 'party']] as const) {
    const b = page.getByRole('button', { name, exact: true }).first()
    if (!(await b.count())) { console.log('MISSING ' + name); continue }
    await b.click()
    await page.getByRole('button', { name: /All angles/ }).click()
    if (clip) {
      const c = page.getByRole('button', { name: clip, exact: true }).first()
      if (await c.count()) await c.click()
    }
    await page.waitForTimeout(1300)
    const slug = `${name}-${clip ?? 'idle'}`.replace(/ /g, '-').toLowerCase()
    await page.screenshot({ path: `${OUT}/${slug}.png` })
  }
})

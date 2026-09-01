import { test, type Page } from '@playwright/test'
const OUT = '/private/tmp/claude-501/-Users-williamrudnick-repos-baskin/209e6df3-bf9f-46a8-bffd-0aee7c9da561/scratchpad/models'
test('inspect', async ({ page }: { page: Page }) => {
  test.setTimeout(300_000)
  await page.setViewportSize({ width: 1300, height: 900 })
  await page.goto('/?debug=models')
  await page.waitForTimeout(2500)
  for (const name of [
    'Quigley Seminary', 'Oak Street Beach Cafe', 'The Carlyle',
    'Millennium Knickerbocker', 'Esquire Theater', 'Drake Tower',
    '1000 Lake Shore Plaza', 'Fortnightly of Chicago', 'Newberry Plaza',
  ]) {
    const b = page.getByRole('button', { name, exact: true }).first()
    if (!(await b.count())) { console.log('MISSING ' + name); continue }
    await b.click()
    await page.getByRole('button', { name: /All angles/ }).click()
    await page.waitForTimeout(1300)
    await page.screenshot({ path: `${OUT}/${name.replace(/ /g, '-').toLowerCase()}.png` })
  }
})

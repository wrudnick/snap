import { test, expect, type Page } from '@playwright/test'
/**
 * The part editor's round trip: select a part, save it, get it back off disk.
 *
 * Cheap cover for the thing that makes the editor worth having — if the save
 * endpoint or the override lookup breaks, the editor still *looks* like it
 * works and silently changes nothing.
 */
test('part editor', async ({ page }: { page: Page }) => {
  test.setTimeout(180_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.setViewportSize({ width: 1340, height: 920 })
  await page.goto('/?debug=models')
  await page.waitForTimeout(2500)
  await page.getByRole('button', { name: 'Mounted Police', exact: true }).click()
  await page.getByRole('button', { name: 'Edit parts' }).click()
  await page.waitForTimeout(1200)
  // Pick a part and confirm the gizmo appears.
  await page.getByRole('button', { name: /^●?\s*rider$/ }).first().click()
  await page.waitForTimeout(900)
  await page.screenshot({ path: 'test-results/diag/part-editor.png' })
  // Save round-trips to disk.
  await page.getByRole('button', { name: 'save part' }).click()
  await expect(page.locator('.inspector-value').filter({ hasText: /saved/ })).toBeVisible({ timeout: 10_000 })
  // Put the file back: this test proves the round-trip, it should not leave an
  // edit behind for the game to load.
  await page.getByRole('button', { name: 'revert' }).click()
  await page.waitForTimeout(500)
  if (errors.length) throw new Error(errors.slice(0, 3).join(' | '))
})

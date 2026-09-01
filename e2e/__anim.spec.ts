import { test, type Page } from '@playwright/test'

import { SUBJECTS } from '../src/content/subjects'

/**
 * A contact sheet per animation, six angles at once.
 *
 * Driven entirely by the address bar. The first version clicked through the
 * inspector's panel and read clip names back out of the rendered DOM, which
 * picked the wrong control the moment a reactions panel appeared above the one
 * it wanted — a review harness that silently reviews the wrong thing is worse
 * than none. Now each frame is one navigate to a URL that fully describes it.
 *
 * Held at the pose's peak where it has one, because the peak is the slice the
 * score pays for and therefore the slice that has to look right.
 */
const OUT = '/private/tmp/claude-501/-Users-williamrudnick-repos-baskin/209e6df3-bf9f-46a8-bffd-0aee7c9da561/scratchpad/anim'

const SPECIES = (process.env.SPECIES ?? 'pigeon').split(',').filter(Boolean)

test('animation sheets', async ({ page }: { page: Page }) => {
  test.setTimeout(900_000)
  await page.setViewportSize({ width: 1400, height: 950 })

  for (const species of SPECIES) {
    const def = SUBJECTS[species]
    if (!def) {
      console.log(`UNKNOWN ${species}`)
      continue
    }
    for (const clip of Object.keys(def.poses)) {
      const peak = def.poses[clip]?.peak
      const override = process.env.T ? Number(process.env.T) : null
      const t = override ?? (peak ? (peak[0] + peak[1]) / 2 : 0.45)
      await page.goto(
        `/?debug=models&model=${species}&clip=${clip}&view=animation&t=${t.toFixed(3)}`,
      )
      // The model builds, the mixer binds, and the grid draws its six cameras.
      await page.waitForTimeout(1400)
      await page.screenshot({ path: `${OUT}/${species}-${clip}.png` })
    }
  }
})

import { expect, test, type Page } from '@playwright/test'

/**
 * End-to-end coverage of the gameplay loop.
 *
 * The scoring *math* is unit-tested in `tests/scoring.test.ts` against hand-built
 * snapshots — that's where curve shapes and edge cases belong. These tests cover
 * what only a real browser can prove: that the renderer, the capture pipeline,
 * the store, and the screens actually connect to each other.
 *
 * Aiming goes through `window.__snap` rather than synthetic mouse movement, so a
 * test asserting "a well-framed dog scores well" doesn't fail because a pointer
 * drag landed two pixels off.
 */

type Shot = {
  subject: string | null
  total: number
  quality: number
  grade: string
  inFrame: number
}

/** Wait for the harness and the first rendered frame. */
async function boot(page: Page): Promise<void> {
  await page.goto('/')
  await page.waitForFunction(() => Boolean((window as any).__snap), null, { timeout: 20_000 })
  await expect(page.getByRole('button', { name: /^ride /i })).toBeVisible()
}

async function startRun(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^ride /i }).click()
  await expect(page.locator('.hud')).toBeVisible()
  await page.waitForFunction(() => (window as any).__snap.runtime.running === true)
}

/** Seek to `t`, aim at the nearest subject ahead, and fire. */
async function shootNearestAhead(page: Page, t: number): Promise<Shot | null> {
  return page.evaluate(async (seekTo) => {
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
    const h = (window as any).__snap

    h.seek(seekTo)
    // Generous settle: seeking remounts a segment's worth of subjects, and the
    // scene got heavier with landmarks. Too short and the scan finds nothing.
    await wait(600)

    const cam = h.cameraPosition()
    if (!cam) return null

    // "Ahead" has to come from the rail's actual heading. A Z-axis test only
    // worked while the route ran in a straight line down -Z; the real route
    // turns west and then north, so a hardcoded axis aims behind the camera.
    const heading = h.runtime.railHeading
    const fx = -Math.sin(heading)
    const fz = -Math.cos(heading)

    const candidates = h
      .subjects()
      .map((s: any) => {
        const dx = s.position[0] - cam[0]
        const dz = s.position[2] - cam[2]
        return { ...s, dist: Math.hypot(dx, dz), forward: dx * fx + dz * fz }
      })
      .filter((s: any) => s.forward > 2 && s.dist > 3 && s.dist < 45)
      .sort((a: any, b: any) => a.dist - b.dist)

    if (candidates.length === 0) return null

    const target = candidates[0]
    h.lookAt(...target.position)
    h.input.zoom = true
    await wait(500)
    h.lookAt(...target.position)
    await wait(150)

    const before = h.store.getState().photos.length
    h.shoot()

    // The image encode is async; wait for the photo to land in the store.
    for (let i = 0; i < 100; i++) {
      if (h.store.getState().photos.length > before) break
      await wait(50)
    }
    h.input.zoom = false

    const photos = h.store.getState().photos
    if (photos.length === before) return null

    const p = photos[photos.length - 1]
    return {
      subject: p.score.primary ? p.score.primary.species : null,
      total: p.score.total,
      quality: p.score.quality,
      grade: p.score.grade,
      inFrame: p.score.subjects.length,
    }
  }, t)
}

/**
 * Try several points along the route until one yields a photo.
 *
 * Pinning a test to a single `t` couples it to wherever subjects happen to sit
 * today, and the route is going to keep being retuned as real buildings land.
 * Scanning asserts the thing that actually matters — that aiming at a subject
 * anywhere on the route produces a scored photo.
 */
async function shootAnywhere(
  page: Page,
  candidates = [0.30, 0.85, 0.76, 0.50, 0.04, 0.92, 0.67, 0.95],
): Promise<Shot | null> {
  let lastAttempt: Shot | null = null
  for (const t of candidates) {
    const shot = await shootNearestAhead(page, t)
    if (shot) lastAttempt = shot
    // A shot with no subject means the shutter fired at empty air — the aim
    // missed, or the subject wandered between lookAt and capture. Keep going;
    // returning it would assert against a photo of nothing.
    if (shot?.subject) return shot
  }
  return lastAttempt
}

test.describe('gameplay loop', () => {
  test.beforeEach(async ({ page }) => {
    // A stale album from a previous test would change the results screen.
    //
    // Guarded by sessionStorage because addInitScript runs on *every*
    // navigation — including the in-test reload that exists specifically to
    // prove the album persists. Without the guard it would wipe the thing under
    // test.
    await page.addInitScript(() => {
      if (!window.sessionStorage.getItem('__e2e_cleared')) {
        window.localStorage.clear()
        window.sessionStorage.setItem('__e2e_cleared', '1')
      }
    })
  })

  test('boots to the menu with an empty album', async ({ page }) => {
    await boot(page)
    await expect(page.getByText(/0 of 4 subjects photographed/i)).toBeVisible()
    await expect(page.getByText(/nothing yet/i)).toBeVisible()
  })

  test('starts a run with a full roll of film', async ({ page }) => {
    await boot(page)
    await startRun(page)

    // Read from the route rather than hardcoding: film size is content, and a
    // literal here breaks every time the route is retuned.
    const film = await page.evaluate(
      () => (window as any).__snap.store.getState().filmRemaining,
    )
    expect(film).toBeGreaterThan(0)
    await expect(page.locator('.film .count')).toHaveText(String(film))
  })

  test('the camera advances along the rail on its own', async ({ page }) => {
    await boot(page)
    await startRun(page)

    const start = await page.evaluate(() => (window as any).__snap.runtime.t)
    await page.waitForTimeout(1200)
    const later = await page.evaluate(() => (window as any).__snap.runtime.t)

    expect(later).toBeGreaterThan(start)
  })

  test('taking a photo consumes film and produces a scored image', async ({ page }) => {
    await boot(page)
    await startRun(page)

    const startingFilm = await page.evaluate(
      () => (window as any).__snap.store.getState().filmRemaining,
    )
    const shot = await shootAnywhere(page)
    expect(shot).not.toBeNull()

    // One frame of film per shot fired, and the scan may have fired more than
    // once before something scored.
    const taken = await page.evaluate(
      () => (window as any).__snap.store.getState().photos.length,
    )
    await expect(page.locator('.film .count')).toHaveText(String(startingFilm - taken))
    expect(shot!.subject).not.toBeNull()
    expect(shot!.total).toBeGreaterThan(0)

    // The captured image must be a real frame, not a black or empty one.
    const image = await page.evaluate(async () => {
      const photo = (window as any).__snap.store.getState().photos[0]
      const img = new Image()
      await new Promise((res, rej) => {
        img.onload = res
        img.onerror = rej
        img.src = photo.url
      })
      const canvas = document.createElement('canvas')
      canvas.width = 32
      canvas.height = 20
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, 32, 20)
      const data = ctx.getImageData(0, 0, 32, 20).data
      const colors = new Set<string>()
      let luma = 0
      for (let i = 0; i < data.length; i += 4) {
        luma += (data[i]! + data[i + 1]! + data[i + 2]!) / 3
        colors.add(`${data[i]! >> 4},${data[i + 1]! >> 4},${data[i + 2]! >> 4}`)
      }
      return {
        width: img.width,
        height: img.height,
        avgLuma: luma / (data.length / 4),
        distinctColors: colors.size,
      }
    })

    expect(image.width).toBe(960)
    expect(image.avgLuma).toBeGreaterThan(10)
    expect(image.distinctColors).toBeGreaterThan(3)
  })

  test('a subject facing the camera outscores the same subject facing away', async ({
    page,
  }) => {
    await boot(page)
    await startRun(page)

    // The dog patrols, so its facing changes; sample repeatedly and compare the
    // best facing-camera shot against the best facing-away shot.
    const samples = await page.evaluate(async () => {
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
      const h = (window as any).__snap
      h.seek(0.86)
      await wait(400)

      const out: Array<{ band: string; direction: number }> = []
      for (let i = 0; i < 14; i++) {
        const cam = h.cameraPosition()
        const dog = h.subjects().find((s: any) => s.species === 'dog')
        // The dog patrols and can wander out of the active segment window.
        // Re-seek and keep sampling rather than abandoning the run.
        if (!dog || !cam) {
          h.seek(0.86)
          await wait(400)
          continue
        }
        h.lookAt(...dog.position)
        await wait(60)

        const before = h.store.getState().photos.length
        h.shoot()
        for (let k = 0; k < 60; k++) {
          if (h.store.getState().photos.length > before) break
          await wait(50)
        }
        const p = h.store.getState().photos.slice(-1)[0]
        if (p?.score.primary) {
          out.push({ band: p.score.primary.directionBand, direction: p.score.primary.direction })
        }
        await wait(500)
      }
      return out
    })

    expect(samples.length).toBeGreaterThanOrEqual(3)

    const facing = samples.filter((s) => s.band === 'facing')
    const away = samples.filter((s) => s.band === 'away')

    // Every facing sample must beat every away sample on the direction term.
    if (facing.length > 0 && away.length > 0) {
      const worstFacing = Math.min(...facing.map((s) => s.direction))
      const bestAway = Math.max(...away.map((s) => s.direction))
      expect(worstFacing).toBeGreaterThan(bestAway)
    }

    // Regardless of what the dog did, bands must agree with their scores.
    for (const s of samples) {
      if (s.band === 'facing') expect(s.direction).toBeGreaterThan(0.75)
      if (s.band === 'away') expect(s.direction).toBeLessThan(0.4)
    }
  })

  test('finishing the route opens the contact sheet', async ({ page }) => {
    await boot(page)
    await startRun(page)
    await shootAnywhere(page)

    await page.evaluate(() => (window as any).__snap.finish())

    await expect(page.getByRole('heading', { name: /contact sheet/i })).toBeVisible()

    // shootAnywhere may fire more than once while scanning for a subject, so
    // assert the sheet matches the store rather than a hardcoded count.
    const taken = await page.evaluate(
      () => (window as any).__snap.store.getState().photos.length,
    )
    expect(taken).toBeGreaterThan(0)
    await expect(page.locator('.shot')).toHaveCount(taken)
  })

  test('developing puts the best shot of each subject into the album', async ({ page }) => {
    await boot(page)
    await startRun(page)

    for (const t of [0.04, 0.38, 0.85]) {
      await shootNearestAhead(page, t)
    }

    await page.evaluate(() => (window as any).__snap.finish())
    await expect(page.getByRole('heading', { name: /contact sheet/i })).toBeVisible()

    await page.getByRole('button', { name: /develop/i }).click()
    await expect(page.getByRole('heading', { name: /developed/i })).toBeVisible()

    const album = await page.evaluate(() =>
      Object.keys((window as any).__snap.store.getState().album),
    )
    expect(album.length).toBeGreaterThan(0)

    // The album must survive a reload — it's the only persistent progress.
    await page.reload()
    await page.waitForFunction(() => Boolean((window as any).__snap))
    const persisted = await page.evaluate(() =>
      Object.keys((window as any).__snap.store.getState().album),
    )
    expect(persisted.sort()).toEqual(album.sort())
  })

  test('discarding a photo removes it from the run total', async ({ page }) => {
    await boot(page)
    await startRun(page)
    await shootAnywhere(page)
    await page.evaluate(() => (window as any).__snap.finish())

    const taken = await page.evaluate(
      () => (window as any).__snap.store.getState().photos.length,
    )
    expect(taken).toBeGreaterThan(0)
    await expect(page.locator('.shot.kept')).toHaveCount(taken)

    await page.locator('.shot').first().click()
    await expect(page.locator('.shot.dropped')).toHaveCount(1)
    await expect(page.locator('.shot.kept')).toHaveCount(taken - 1)
    await expect(page.getByText(new RegExp(`${taken - 1} keeping`, 'i'))).toBeVisible()
  })

  test('the run is capped by the film roll', async ({ page }) => {
    await boot(page)
    await startRun(page)

    const startingFilm = await page.evaluate(
      () => (window as any).__snap.store.getState().filmRemaining,
    )

    // Burn the whole roll without aiming at anything in particular.
    //
    // Waits for each photo to land rather than spraying on a fixed interval: the
    // shutter deliberately ignores presses while the previous capture is still
    // encoding, which on a software renderer is far slower than on real hardware.
    await page.evaluate(async () => {
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
      const h = (window as any).__snap

      for (let attempt = 0; attempt < 200; attempt++) {
        const state = h.store.getState()
        if (state.filmRemaining === 0) break

        const before = state.photos.length
        h.shoot()
        for (let k = 0; k < 40; k++) {
          if (h.store.getState().photos.length > before) break
          await wait(25)
        }
      }
    })

    await expect(page.locator('.film .count')).toHaveText('0')
    const count = await page.evaluate(
      () => (window as any).__snap.store.getState().photos.length,
    )
    expect(count).toBe(startingFilm)
  })
})

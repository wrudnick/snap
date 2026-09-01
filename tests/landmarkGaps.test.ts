import { expect, test } from 'vitest'
import * as THREE from 'three'
import { LANDMARK_BUILDINGS, heightOf } from '../src/content/models/landmarkBuildings'
import { siteById } from '../src/content/models/landmarkSites'

/**
 * Nothing hangs in the air.
 *
 * A horizontal slice with nothing in it, and something above it, is a crown
 * floating over the shaft meant to carry it. Eight buildings did exactly that:
 * the shaft stopped six metres below the parapet whatever the crown was, and a
 * cornice starts three metres below it, so the top three metres stood on
 * nothing. It is the default crown, so it was the default bug — and it was
 * reported one building at a time, by eye, which is no way to find the eighth.
 *
 * Sampled every half metre, which is finer than any real gap and coarse enough
 * to ignore the seam between two flush boxes.
 */
test('no landmark has geometry hanging over a gap', () => {
  const rows: string[] = []
  for (const [key, entry] of Object.entries(LANDMARK_BUILDINGS)) {
    const site = siteById(Number(key))
    if (!site) continue
    const built = entry.build({ ...site, height: heightOf(entry, site) })
    built.updateMatrixWorld(true)
    const boxes: THREE.Box3[] = []
    built.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      const b = new THREE.Box3().setFromObject(m)
      if (!b.isEmpty()) boxes.push(b)
    })
    if (!boxes.length) continue
    const top = Math.max(...boxes.map((b) => b.max.y))
    const STEP = 0.5
    let gapStart: number | null = null
    let worst = 0
    let worstAt = 0
    for (let y = 0; y <= top; y += STEP) {
      const filled = boxes.some((b) => b.min.y <= y && b.max.y >= y)
      if (!filled && gapStart === null) gapStart = y
      if (filled && gapStart !== null) {
        const size = y - gapStart
        if (size > worst) { worst = size; worstAt = gapStart }
        gapStart = null
      }
    }
    if (worst >= 1.0) rows.push(`${entry.name}: ${worst.toFixed(1)}m of nothing at y=${worstAt.toFixed(0)}`)
  }
  expect(rows).toEqual([])
})

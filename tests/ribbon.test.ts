import { describe, expect, it } from 'vitest'
import * as THREE from 'three'

import { generateEnvironment, laneProfile } from '../src/content/models/environment'
import { curveLimits, type Frame } from '../src/content/models/ribbon'
import { ROUTES } from '../src/content/routes/goldcoast'
import { Rail } from '../src/game/rail'
import { resolveRoute } from '../src/game/sections'

/**
 * A ribbon offset sideways along a path folds over itself wherever the path
 * turns tighter than the ribbon is wide: past that point the outer lanes stop
 * advancing and start running backwards, and the surface doubles back into a
 * flap lying on top of the road.
 *
 * The route has five corners and every one of them was doing it — those wedges
 * of pavement lying across each junction were not a texture problem or a
 * z-fighting problem, they were the ground folded in half. This reads the real
 * built geometry rather than re-deriving it, so it fails if the clamp is ever
 * dropped from the builder.
 */

const route = ROUTES.goldcoast!
const rail = new Rail(route)
const resolved = resolveRoute(route, rail)
const STEP = 4

describe('ground ribbon', () => {
  it('never folds back on itself', () => {
    const { ground } = generateEnvironment(route, rail, resolved.sections)
    const pos = ground.getAttribute('position')

    const steps = Math.max(2, Math.ceil(rail.length / STEP))
    const sectionFor = (t: number) =>
      resolved.sections.find((s) => t >= s.tStart && t < s.tEnd) ??
      resolved.sections[resolved.sections.length - 1]!

    // Rows are emitted in order, one vertex per lane, so a running total of
    // lane counts recovers where each row starts.
    const rows: Array<{ start: number; count: number; t: number }> = []
    let cursor = 0
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const count = laneProfile(sectionFor(t).kind).length
      rows.push({ start: cursor, count, t })
      cursor += count
    }
    expect(cursor).toBe(pos.count)

    const folds: string[] = []
    const centre = new THREE.Vector3()
    const nextCentre = new THREE.Vector3()

    for (let i = 0; i < rows.length - 1; i++) {
      const a = rows[i]!
      const b = rows[i + 1]!
      if (a.count !== b.count) continue // section boundary; not stitched anyway

      rail.positionAt(a.t, centre)
      rail.positionAt(b.t, nextCentre)
      const fx = nextCentre.x - centre.x
      const fz = nextCentre.z - centre.z

      for (let l = 0; l < a.count; l++) {
        const dx = pos.getX(b.start + l) - pos.getX(a.start + l)
        const dz = pos.getZ(b.start + l) - pos.getZ(a.start + l)
        if (dx * fx + dz * fz < 0) folds.push(`t=${a.t.toFixed(3)} lane ${l}`)
      }
    }

    expect(folds, 'lane edges running backwards along the route').toEqual([])
  })
})

describe('curve limits', () => {
  /** A straight run east, right-hand vectors constant. */
  const straight: Frame[] = [0, 4, 8, 12].map((x) => ({ x, z: 0, rx: 0, rz: 1 }))

  it('leaves a straight run unbounded', () => {
    const limits = curveLimits(straight)
    expect(limits.right.every((v) => v === Infinity)).toBe(true)
    expect(limits.left.every((v) => v === Infinity)).toBe(true)
  })

  it('bounds one side of a turn and leaves the other alone', () => {
    // Heading east with the right-hand vector swinging toward +x, so
    // k = (r1 − r0)·f is positive and it is the *left* offsets that are bounded.
    const turning: Frame[] = [
      { x: 0, z: 0, rx: 0, rz: 1 },
      { x: 4, z: 0, rx: 0.3, rz: 0.95 },
      { x: 8, z: 1, rx: 0.6, rz: 0.8 },
    ]
    const limits = curveLimits(turning)
    expect(Math.min(...limits.left)).toBeLessThan(20)
    expect(limits.right.every((v) => v === Infinity)).toBe(true)
  })

  it('bounds the other side when the turn reverses', () => {
    const turning: Frame[] = [
      { x: 0, z: 0, rx: 0, rz: 1 },
      { x: 4, z: 0, rx: -0.3, rz: 0.95 },
      { x: 8, z: -1, rx: -0.6, rz: 0.8 },
    ]
    const limits = curveLimits(turning)
    expect(Math.min(...limits.right)).toBeLessThan(20)
    expect(limits.left.every((v) => v === Infinity)).toBe(true)
  })

  it('tapers the limit rather than stepping it', () => {
    // A single sharp row surrounded by straight ones must not leave its
    // neighbours unbounded: an edge that jumps inward between two rows folds on
    // the way in, which is how the first version of this reintroduced the bug.
    const frames: Frame[] = [
      { x: 0, z: 0, rx: 0, rz: 1 },
      { x: 4, z: 0, rx: 0, rz: 1 },
      { x: 8, z: 0, rx: 0.5, rz: 0.87 },
      { x: 12, z: 0, rx: 0.5, rz: 0.87 },
      { x: 16, z: 0, rx: 0.5, rz: 0.87 },
    ]
    const limits = curveLimits(frames)
    for (let i = 1; i < limits.right.length; i++) {
      const a = limits.right[i - 1]!
      const b = limits.right[i]!
      if (a === Infinity || b === Infinity) continue
      expect(Math.abs(b - a)).toBeLessThanOrEqual(4 * 0.3 + 1e-9)
    }
  })
})

import { describe, expect, it } from 'vitest'

import { buildCityGround } from '../src/content/models/cityGround'
import { curveLimits, type Frame } from '../src/content/models/ribbon'

/**
 * Every triangle of ground must face up.
 *
 * This is the invariant that replaced a pile of specific ones. The ground used
 * to be extruded sideways along the camera rail, and a rail that turns tighter
 * than the ribbon is wide folds it into a flap lying across the road — that was
 * the wedge of pavement at every junction. It also meant the world's surfaces
 * depended on where the camera went, so dragging a waypoint in the editor could
 * unpave a block.
 *
 * Now streets pave themselves from OSM and everything else is a polygon fixed
 * in the world, and a single check covers all of it: a fold turns a triangle
 * over, and so does a polygon wound the wrong way. Both render as a black hole
 * in the floor, and both are caught here.
 */

describe('city ground', () => {
  const built = buildCityGround()

  it('builds a mesh', () => {
    expect(built.streetCount).toBeGreaterThan(20)
    expect(built.fillCells).toBeGreaterThan(100)
  })

  it('has no triangle facing downwards', () => {
    const geometry = built.geometry
    const position = geometry.getAttribute('position')
    const index = geometry.getIndex()!

    let down = 0
    let total = 0
    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i)
      const b = index.getX(i + 1)
      const c = index.getX(i + 2)

      const ux = position.getX(b) - position.getX(a)
      const uy = position.getY(b) - position.getY(a)
      const uz = position.getZ(b) - position.getZ(a)
      const vx = position.getX(c) - position.getX(a)
      const vy = position.getY(c) - position.getY(a)
      const vz = position.getZ(c) - position.getZ(a)

      // Y component of u × v.
      const normalY = uz * vx - ux * vz
      const area = Math.hypot(uy * vz - uz * vy, normalY, ux * vy - uy * vx)
      if (area < 1e-6) continue
      total++
      if (normalY < 0) down++
    }

    expect(total).toBeGreaterThan(1000)
    expect(down, `${down} of ${total} ground triangles face downwards`).toBe(0)
  })
})

describe('curve limits', () => {
  const straight: Frame[] = [0, 4, 8, 12].map((x) => ({ x, z: 0, rx: 0, rz: 1 }))

  it('leaves a straight run unbounded', () => {
    const limits = curveLimits(straight)
    expect(limits.right.every((v) => v === Infinity)).toBe(true)
    expect(limits.left.every((v) => v === Infinity)).toBe(true)
  })

  it('bounds one side of a turn and leaves the other alone', () => {
    const turning: Frame[] = [
      { x: 0, z: 0, rx: 0, rz: 1 },
      { x: 4, z: 0, rx: 0.3, rz: 0.95 },
      { x: 8, z: 1, rx: 0.6, rz: 0.8 },
    ]
    const limits = curveLimits(turning)
    expect(Math.min(...limits.left)).toBeLessThan(20)
    expect(limits.right.every((v) => v === Infinity)).toBe(true)
  })

  it('tapers the limit rather than stepping it', () => {
    // A limit that drops between two rows moves the edge sideways faster than
    // the ribbon advances forwards, which folds on the way in — the clamp
    // reintroducing the defect it exists to remove.
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

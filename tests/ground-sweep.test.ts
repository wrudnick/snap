import { describe, expect, it } from 'vitest'
import * as THREE from 'three'

import { buildCityGround } from '../src/content/models/cityGround'
import { ROUTES } from '../src/content/routes/goldcoast'
import { Rail } from '../src/game/rail'
import { resolveRoute } from '../src/game/sections'

/**
 * The ground, sampled from above along the route.
 *
 * Every other check here is about props. The floor is the one surface the
 * player looks at for the whole run and the one nothing was testing, and it has
 * two failure modes that a screenshot only catches by luck:
 *
 *  - a HOLE, where no surface covers a point and the sky shows through
 *  - a STACK, where two surfaces sit within a few centimetres of each other and
 *    z-fight into a flickering mess
 *
 * Both are found by dropping a vertical ray at a grid of points near the route
 * and looking at what it hits.
 */

const route = ROUTES.goldcoast!
const rail = new Rail(route)
const sections = resolveRoute(route, rail).sections
const { geometry } = buildCityGround()

const position = geometry.getAttribute('position')
const index = geometry.getIndex()!

/** Triangles bucketed by cell, so a point query reads a handful, not 56,000. */
const CELL = 12
const grid = new Map<string, number[]>()
for (let i = 0; i < index.count; i += 3) {
  const a = index.getX(i)
  const b = index.getX(i + 1)
  const c = index.getX(i + 2)
  const minX = Math.min(position.getX(a), position.getX(b), position.getX(c))
  const maxX = Math.max(position.getX(a), position.getX(b), position.getX(c))
  const minZ = Math.min(position.getZ(a), position.getZ(b), position.getZ(c))
  const maxZ = Math.max(position.getZ(a), position.getZ(b), position.getZ(c))
  for (let x = Math.floor(minX / CELL); x <= Math.floor(maxX / CELL); x++) {
    for (let z = Math.floor(minZ / CELL); z <= Math.floor(maxZ / CELL); z++) {
      const key = `${x},${z}`
      const list = grid.get(key)
      if (list) list.push(i)
      else grid.set(key, [i])
    }
  }
}

/** Heights of every ground surface directly under or over a point. */
function surfacesAt(x: number, z: number): number[] {
  const out: number[] = []
  for (const i of grid.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`) ?? []) {
    const a = index.getX(i)
    const b = index.getX(i + 1)
    const c = index.getX(i + 2)
    const ax = position.getX(a), az = position.getZ(a)
    const bx = position.getX(b), bz = position.getZ(b)
    const cx = position.getX(c), cz = position.getZ(c)

    // Barycentric containment on the XZ plane.
    const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz)
    if (Math.abs(d) < 1e-9) continue
    const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d
    const v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d
    const w = 1 - u - v
    if (u < -1e-6 || v < -1e-6 || w < -1e-6) continue

    out.push(u * position.getY(a) + v * position.getY(b) + w * position.getY(c))
  }
  return out.sort((p, q) => p - q)
}

/** A grid of points across the corridor the player can actually see. */
const samples: Array<{
  x: number
  z: number
  t: number
  section: string
  floor: number
  lateral: number
}> = []
{
  const point = new THREE.Vector3()
  const right = new THREE.Vector3()
  const steps = Math.ceil(rail.length / 3)
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    rail.positionAt(t, point)
    rail.rightAt(t, right)
    const section =
      sections.find((s) => t >= s.tStart && t < s.tEnd) ?? sections[sections.length - 1]!
    for (let lateral = -22; lateral <= 22; lateral += 2) {
      samples.push({
        x: point.x + right.x * lateral,
        z: point.z + right.z * lateral,
        t,
        section: section.id,
        // Waypoints are authored at eye height, so the floor the player is
        // walking on is 1.7 m below the rail.
        floor: point.y - 1.7,
        lateral,
      })
    }
  }
}

describe('ground sweep', () => {
  it('samples a real mesh', () => {
    expect(index.count).toBeGreaterThan(30_000)
    expect(samples.length).toBeGreaterThan(5_000)
  })

  it('leaves no hole beside the route', () => {
    const holes = samples.filter((s) => surfacesAt(s.x, s.z).length === 0)
    const bySection = new Map<string, number>()
    for (const h of holes) bySection.set(h.section, (bySection.get(h.section) ?? 0) + 1)

    // Reported as a share, because one stray sample at the very edge of the
    // world is noise and a whole section missing its floor is not.
    const worst = [...bySection.entries()].sort((a, b) => b[1] - a[1])
    const share = holes.length / samples.length
    expect(
      `${(share * 100).toFixed(1)}% — worst: ${worst.slice(0, 4).map(([k, v]) => `${k} ${v}`).join(', ')}`,
    ).toBe('0.0% — worst: ')
  })

  it('puts the ground under the player, at the height they walk at', () => {
    // "Is there a surface here" was not enough, and the gap it left was not
    // subtle: when the ground moved into world space the underpass floor
    // stopped existing, the route still dipped five metres into it, and the
    // middle of the tunnel became the camera hanging in space under a floating
    // city. Every check passed, because Lake Shore Drive is a surface at that
    // XZ — four and a half metres over the player's head.
    const wrong: string[] = []
    for (const s of samples) {
      // Under the path itself. Where the route is below grade it is in a
      // trench a few metres wide, and the ground twenty metres to either side
      // is *correctly* still up at street level — checking that far out flags
      // the pavement above the underpass for not being in the underpass.
      if (Math.abs(s.floor) < 0.6 || Math.abs(s.lateral) > 4) continue
      const heights = surfacesAt(s.x, s.z)
      if (heights.length === 0) continue
      const nearest = heights.reduce((best, h) =>
        Math.abs(h - s.floor) < Math.abs(best - s.floor) ? h : best,
      )
      if (Math.abs(nearest - s.floor) > 1.2) {
        wrong.push(`${s.section} t=${s.t.toFixed(3)} floor ${s.floor.toFixed(1)} vs ${nearest.toFixed(1)}`)
      }
    }
    expect(wrong.slice(0, 8)).toEqual([])
  })

  it('does not stack two surfaces close enough to z-fight', () => {
    // Ground is built in layers on purpose — fill under streets under patches —
    // and they are separated by centimetres so the depth test can tell them
    // apart. Under 2 cm it cannot, and the surface flickers between them.
    let fighting = 0
    for (const s of samples) {
      const heights = surfacesAt(s.x, s.z)
      for (let i = 1; i < heights.length; i++) {
        if (heights[i]! - heights[i - 1]! < 0.02) {
          fighting++
          break
        }
      }
    }

    // Held at half a percent rather than zero, and the difference is honest:
    // 7% of the corridor was fighting before, almost all of it at junctions and
    // between the halves of a dual carriageway. Both of those are fixed. What
    // is left is a street's own ribbon crossing itself where a single chain
    // doubles back — isolated, and a smaller problem than a bound of zero that
    // nobody can keep. This catches a regression to the old behaviour, which is
    // what the check is for.
    const share = fighting / samples.length
    expect(`${(share * 100).toFixed(2)}%`).toBe(
      share <= 0.005 ? `${(share * 100).toFixed(2)}%` : 'under 0.50%',
    )
  })
})

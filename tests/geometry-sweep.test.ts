import { describe, expect, it } from 'vitest'
import * as THREE from 'three'

import { CITY, buildCityGeometry } from '../src/content/models/city'
import { generateEnvironment, type Prop } from '../src/content/models/environment'
import { buildingAt } from '../src/content/models/footprints'
import { GROUND_PATCHES } from '../src/content/models/patches'
import { ROUTES } from '../src/content/routes/goldcoast'
import { Rail } from '../src/game/rail'
import { resolveRoute } from '../src/game/sections'

/**
 * A sweep of the whole route for things the camera runs into.
 *
 * Screenshots catch these one at a time and only from the angle they happen to
 * be taken at; a wall the camera clips through for four metres of a 1,300 m
 * route is a coin flip whether any frame lands on it. So it is walked here at
 * half-metre resolution instead.
 */

const route = ROUTES.goldcoast!
const rail = new Rail(route)
const sections = resolveRoute(route, rail).sections
const { buildings, poles, heads, clutter } = generateEnvironment(route, rail, sections)

/** Everything solid the player could hit, as world-space boxes. */
const props: Prop[] = [...buildings, ...poles, ...heads, ...clutter]

interface Box {
  cx: number
  cy: number
  cz: number
  hx: number
  hy: number
  hz: number
  rotationY: number
}

const boxes: Box[] = props.map((p) => ({
  cx: p.position[0],
  cy: p.position[1],
  cz: p.position[2],
  hx: p.scale[0] / 2,
  hy: p.scale[1] / 2,
  hz: p.scale[2] / 2,
  rotationY: p.rotationY,
}))

/** Is a world point inside this box? */
function insideBox(b: Box, x: number, y: number, z: number, margin = 0): boolean {
  if (y < b.cy - b.hy - margin || y > b.cy + b.hy + margin) return false
  const cos = Math.cos(-b.rotationY)
  const sin = Math.sin(-b.rotationY)
  const dx = x - b.cx
  const dz = z - b.cz
  const lx = dx * cos - dz * sin
  const lz = dx * sin + dz * cos
  return Math.abs(lx) <= b.hx + margin && Math.abs(lz) <= b.hz + margin
}

/** The camera path, sampled every half metre with its eye height. */
const path: Array<{ t: number; x: number; y: number; z: number; section: string }> = []
{
  const point = new THREE.Vector3()
  const steps = Math.ceil(rail.length * 2)
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    rail.positionAt(t, point)
    const section =
      sections.find((s) => t >= s.tStart && t < s.tEnd) ?? sections[sections.length - 1]!
    path.push({ t, x: point.x, y: point.y, z: point.z, section: section.id })
  }
}

describe('route sweep', () => {
  it('never puts the camera inside a prop', () => {
    // Half a metre of margin: the near plane is 0.1 m, but a wall passing
    // within half a metre of your eye reads as clipping even when it misses.
    const hits = new Set<string>()
    for (const p of path) {
      for (const b of boxes) {
        if (insideBox(b, p.x, p.y, p.z, 0.5)) {
          hits.add(`${p.section} at t=${p.t.toFixed(3)} — prop at ${b.cx.toFixed(0)},${b.cz.toFixed(0)}`)
        }
      }
    }
    expect([...hits].slice(0, 12)).toEqual([])
  })

  it('never puts the camera inside a building', () => {
    const hits = new Set<string>()
    for (const p of path) {
      if (p.section === 'inside') continue
      const b = buildingAt(p.x, p.z)
      if (b) hits.add(`${p.section} at t=${p.t.toFixed(3)} — ${b.n ?? `footprint ${b.i}`}`)
    }
    expect([...hits].slice(0, 12)).toEqual([])
  })

  /** The deepest floor anywhere on the route — the underpass, by a long way. */
  const lowestFloor = Math.min(...path.map((p) => p.y - 1.7))

  it('stands every prop on the ground, not floating or sunk', () => {
    // Props are authored as a box centred on its own middle, so the bottom is
    // position.y − scale.y/2. Anything well below grade is buried; anything far
    // above it with nothing under it is hanging in the air. Awnings, canopies
    // and the tunnel deck are meant to be up there, so only the ones that sit
    // on the floor are checked.
    const floorProps = [...buildings, ...clutter].filter((p) => p.scale[1] < 6)
    const bad = floorProps
      .map((p) => ({ p, bottom: p.position[1] - p.scale[1] / 2 }))
      // Measured against the route's own lowest floor rather than an absolute
      // number: the underpass legitimately sits five metres down, and its walls
      // stand on that floor.
      .filter(({ bottom }) => bottom < lowestFloor - 0.6 || bottom > 2.5)
      .map(({ p, bottom }) => `${p.position.map(Math.round).join(',')} bottom=${bottom.toFixed(1)}`)

    expect(bad.slice(0, 12)).toEqual([])
  })

  it('does not stack props on top of each other', () => {
    // One object inside another reads as one broken object; abutting is normal
    // and a wall is *built* out of boxes that touch.
    //
    // Compared against each box's inscribed radius — its smallest half-extent —
    // rather than an axis-aligned overlap. Long boxes here are rotated to the
    // street, so an axis-aligned test calls two consecutive tunnel wall
    // segments a collision purely because the wall runs diagonally.
    // Only things standing on the ground. Two of those occupying one volume is
    // a bin inside a planter and reads as broken; overlap up in the air is how
    // the decorative pieces are built — a tree's canopy is three boxes pushed
    // into each other on purpose, and a support passing through the thing it
    // supports is what a support is.
    const bulky = [...buildings, ...clutter]
      .map((p, index) => ({
        cx: p.position[0],
        cy: p.position[1],
        cz: p.position[2],
        hx: p.scale[0] / 2,
        hy: p.scale[1] / 2,
        hz: p.scale[2] / 2,
        rotationY: p.rotationY,
        // Parts of one composite object — a bin's band inside its body — are
        // meant to intersect. Everything unmarked gets a unique id so it can
        // never accidentally match another prop.
        composite: p.composite ?? -(index + 1),
      }))
      .filter((b) => Math.min(b.hx, b.hz) > 0.15)

    const overlaps: string[] = []
    for (let i = 0; i < bulky.length && overlaps.length < 12; i++) {
      for (let j = i + 1; j < bulky.length; j++) {
        const a = bulky[i]!
        const b = bulky[j]!
        if (a.composite === b.composite) continue
        if (Math.abs(a.cy - b.cy) > (a.hy + b.hy) * 0.8) continue
        const inscribed = Math.min(a.hx, a.hz) + Math.min(b.hx, b.hz)
        if (Math.hypot(a.cx - b.cx, a.cz - b.cz) < inscribed * 0.6) {
          overlaps.push(
            `(${a.cx.toFixed(1)},${a.cy.toFixed(1)},${a.cz.toFixed(1)} ${(a.hx * 2).toFixed(2)}x${(a.hy * 2).toFixed(2)}x${(a.hz * 2).toFixed(2)}) and ` +
              `(${b.cx.toFixed(1)},${b.cy.toFixed(1)},${b.cz.toFixed(1)} ${(b.hx * 2).toFixed(2)}x${(b.hy * 2).toFixed(2)}x${(b.hz * 2).toFixed(2)})`,
          )
          break
        }
      }
    }
    expect(overlaps).toEqual([])
  })

  /** Inside the restaurant, being inside a building is the point. */
  const indoorRings = GROUND_PATCHES.filter((p) => p.kind === 5).map((p) => p.ring)
  const indoors = (x: number, z: number) =>
    indoorRings.some((ring) => {
      let inside = false
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, zi] = ring[i]!
        const [xj, zj] = ring[j]!
        if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
      }
      return inside
    })

  it('does not bury a prop inside a real building', () => {
    const buried = [...poles, ...clutter]
      .filter((p) => !indoors(p.position[0], p.position[2]))
      .filter((p) => buildingAt(p.position[0], p.position[2]))
      .map((p) => p.position.map(Math.round).join(','))

    expect(buried.slice(0, 12)).toEqual([])
  })

  it('keeps the extruded city out of the camera', () => {
    // The OSM city is one merged mesh, so a wall clipping the camera cannot be
    // found by walking props. Checked against the footprints instead, with the
    // margin the near plane needs.
    const geometry = buildCityGeometry().geometry
    expect(geometry.getAttribute('position').count).toBeGreaterThan(1000)

    const hits = new Set<string>()
    for (const p of path) {
      if (p.section === 'inside' || p.section === 'alley') continue
      for (const b of CITY.buildings) {
        // Cheap reject before the ray cast.
        if (Math.abs(b.r[0]![0] - p.x) > 60 || Math.abs(b.r[0]![1] - p.z) > 60) continue
        for (let i = 0; i < b.r.length; i++) {
          const [ax, az] = b.r[i]!
          const [bx, bz] = b.r[(i + 1) % b.r.length]!
          const vx = bx - ax
          const vz = bz - az
          const len2 = vx * vx + vz * vz || 1
          const u = Math.max(0, Math.min(1, ((p.x - ax) * vx + (p.z - az) * vz) / len2))
          if (Math.hypot(p.x - (ax + vx * u), p.z - (az + vz * u)) < 0.45) {
            hits.add(`${p.section} at t=${p.t.toFixed(3)} — ${b.n ?? `footprint ${b.i}`}`)
          }
        }
      }
    }
    expect([...hits].slice(0, 12)).toEqual([])
  })
})

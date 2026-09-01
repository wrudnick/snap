import { describe, expect, it } from 'vitest'
import * as THREE from 'three'

import { CITY } from '../src/content/models/city'
import { inCarriageway } from '../src/content/models/footprints'
import { LANDMARK_BUILDINGS, heightOf } from '../src/content/models/landmarkBuildings'
import { siteById } from '../src/content/models/landmarkSites'
import { GOLD_COAST } from '../src/content/routes/goldcoast'

/**
 * Hand-authored buildings stand where the real ones stand.
 *
 * They are modelled out of boxes sized from their OSM footprint, and the box
 * they were first given was the footprint's *bounding* box — which for anything
 * that is not a rectangle is larger than the building. Six of the fifty-two put
 * a fifth of their bulk in the carriageway and nothing caught it, because every
 * existing sweep tests props and the extruded city, and a landmark is neither.
 */

const byId = new Map(CITY.buildings.map((b) => [b.i, b]))

function inRing(ring: Array<[number, number]>, x: number, z: number): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i]!
    const [xj, zj] = ring[j]!
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}

/** Sample the plan a landmark's boxes occupy. */
function planSamples(id: number): Array<[number, number]> {
  const site = siteById(id)!
  const cos = Math.cos(site.heading)
  const sin = Math.sin(site.heading)
  // [width, depth]: width across the heading, depth along it — the same frame
  // `rotation.y = heading` puts the model in.
  const [width, depth] = site.size
  const out: Array<[number, number]> = []
  for (let i = 0; i <= 16; i++) {
    for (let j = 0; j <= 16; j++) {
      const w = -width / 2 + (width * i) / 16
      const d = -depth / 2 + (depth * j) / 16
      out.push([
        site.center[0] + w * cos + d * sin,
        site.center[1] + -w * sin + d * cos,
      ])
    }
  }
  return out
}

describe('landmarks', () => {
  it('every one of them sites and builds', () => {
    const broken: string[] = []
    for (const [key, entry] of Object.entries(LANDMARK_BUILDINGS)) {
      const site = siteById(Number(key))
      if (!site) {
        broken.push(`${entry.name}: no footprint for OSM id ${key}`)
        continue
      }
      const height = heightOf(entry, site)
      if (!(height > 2)) broken.push(`${entry.name}: height ${height}`)
      if (!(site.size[0] > 1 && site.size[1] > 1)) {
        broken.push(`${entry.name}: degenerate plan ${site.size.join('x')}`)
      }
    }
    expect(broken).toEqual([])
  })

  it('none of them stands in the road', () => {
    const inRoad: string[] = []
    for (const [key, entry] of Object.entries(LANDMARK_BUILDINGS)) {
      if (!siteById(Number(key))) continue
      const samples = planSamples(Number(key))
      const hits = samples.filter(([x, z]) => inCarriageway(x, z)).length
      if (hits > 0) {
        inRoad.push(`${entry.name}: ${Math.round((100 * hits) / samples.length)}% of its plan`)
      }
    }
    expect(inRoad).toEqual([])
  })

  it('stays inside its own footprint', () => {
    /**
     * A few per cent is the sampling grid touching the outline, not the model
     * leaving it. Anything above that means the boxes are bigger than the
     * building again.
     */
    const spilling: string[] = []
    for (const [key, entry] of Object.entries(LANDMARK_BUILDINGS)) {
      const building = byId.get(Number(key))
      if (!building || !siteById(Number(key))) continue
      const samples = planSamples(Number(key))
      const outside = samples.filter(([x, z]) => !inRing(building.r, x, z)).length
      const percent = (100 * outside) / samples.length
      if (percent > 8) spilling.push(`${entry.name}: ${percent.toFixed(0)}% outside its outline`)
    }
    expect(spilling).toEqual([])
  })
})

/**
 * Geometry that cannot be seen.
 *
 * Three separate builders have shipped a part sealed inside a solid box: the
 * Drake's thirteen storeys of floor banding built a third of a metre *smaller*
 * than the wall they banded, the Carlyle's dark glass core hidden inside the
 * white shaft wrapped around it, and the Esquire's marquee measured off the
 * inscribed rectangle while the mass came from the real footprint. Each one
 * cost draw calls and drew nothing, and each was found by eye, late.
 *
 * A part fully contained in another part with clearance on all six sides is
 * always a mistake — there is no reason to build something a renderer can
 * never show.
 *
 * Only unrotated boxes are allowed to be the *container*, because a box is
 * exactly its own bounding volume and containment is therefore certain. A
 * tapered shaft is a cylinder whose box is the widest section, and an extruded
 * footprint is an L or a wedge inside a much larger box; both would swallow
 * parts that in fact stand outside the solid, and a test that cries wolf gets
 * switched off. The narrower rule still catches the thing that keeps
 * happening — a box built smaller than the box it sits in.
 */
describe('landmark parts are visible', () => {
  const CLEARANCE = 0.25

  it('no part is sealed inside another', () => {
    const sealed: string[] = []
    for (const [key, entry] of Object.entries(LANDMARK_BUILDINGS)) {
      const site = siteById(Number(key))
      if (!site) continue

      const parts: Array<{ box: THREE.Box3; solid: boolean; label: string }> = []
      entry.build(site).traverse((o) => {
        const mesh = o as THREE.Mesh
        if (!mesh.isMesh || !mesh.geometry) return
        mesh.updateWorldMatrix(true, false)
        const box = new THREE.Box3().setFromObject(mesh)
        if (box.isEmpty()) return
        const at = mesh.position.toArray().map((n) => n.toFixed(1)).join(',')
        parts.push({
          box,
          solid: mesh.geometry.type === 'BoxGeometry' && mesh.rotation.x === 0 && mesh.rotation.y === 0 && mesh.rotation.z === 0,
          label: `${mesh.geometry.type}@${at}`,
        })
      })

      for (const inner of parts) {
        for (const outer of parts) {
          if (!outer.solid) continue
          if (inner === outer) continue
          const contains =
            inner.box.min.x > outer.box.min.x + CLEARANCE &&
            inner.box.min.y > outer.box.min.y + CLEARANCE &&
            inner.box.min.z > outer.box.min.z + CLEARANCE &&
            inner.box.max.x < outer.box.max.x - CLEARANCE &&
            inner.box.max.y < outer.box.max.y - CLEARANCE &&
            inner.box.max.z < outer.box.max.z - CLEARANCE
          if (contains) {
            sealed.push(`${entry.name}: ${inner.label} sealed inside ${outer.label}`)
            break
          }
        }
      }
    }
    expect(sealed).toEqual([])
  })
})

/**
 * The street face is a real axis pointing at the real route.
 *
 * `heading` follows the longest edge of the plot, which is the side lot line
 * about as often as it is the frontage, so local +Z is not the front and
 * cannot be assumed to be. This pins the frame down: if the sign of the
 * rotation into local coordinates were ever flipped, every marquee and
 * shopfront on the route would quietly move to the back of its building — the
 * exact failure this replaced, and one that is invisible from any angle the
 * model inspector shows by default.
 */
describe('street faces', () => {
  it('points at the nearest route point, in the building frame', () => {
    const wrong: string[] = []
    for (const [key, entry] of Object.entries(LANDMARK_BUILDINGS)) {
      const site = siteById(Number(key))
      if (!site) continue

      const [fx, fz] = site.streetFace
      // A unit axis, never a diagonal and never zero.
      if (Math.abs(fx) + Math.abs(fz) !== 1) {
        wrong.push(`${entry.name}: streetFace ${fx},${fz} is not a unit axis`)
        continue
      }
      // Rotated back out to the world, it must point into the route's half-plane.
      const c = Math.cos(site.heading)
      const s = Math.sin(site.heading)
      const wx = fx * c + fz * s
      const wz = -fx * s + fz * c

      let best = Infinity
      let toRoute: [number, number] = [0, 0]
      const w = GOLD_COAST.waypoints
      for (let i = 0; i + 1 < w.length; i++) {
        const ax = w[i]![0]
        const az = w[i]![2]
        const dx = w[i + 1]![0] - ax
        const dz = w[i + 1]![2] - az
        const len2 = dx * dx + dz * dz || 1
        const t = Math.max(0, Math.min(1, ((site.center[0] - ax) * dx + (site.center[1] - az) * dz) / len2))
        const qx = ax + dx * t - site.center[0]
        const qz = az + dz * t - site.center[1]
        const dd = qx * qx + qz * qz
        if (dd < best) {
          best = dd
          toRoute = [qx, qz]
        }
      }
      const len = Math.hypot(toRoute[0], toRoute[1]) || 1
      const agreement = (wx * toRoute[0] + wz * toRoute[1]) / len
      // Snapping to an axis costs at most a 45 degree error, so any correct
      // face still leans towards the route.
      if (agreement <= 0) {
        wrong.push(`${entry.name}: streetFace points away from the route (${agreement.toFixed(2)})`)
      }
    }
    expect(wrong).toEqual([])
  })
})

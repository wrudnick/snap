import { describe, expect, it } from 'vitest'

import { buildCityGeometry, type CityBuilding } from '../src/content/models/city'

/**
 * Winding regression cover.
 *
 * Inside-out walls are invisible in the worst way: backface culling silently
 * hides every facade, so the city renders as see-through rather than as
 * anything obviously broken. It shipped unnoticed. These assert orientation
 * directly instead of trusting it to look right.
 */

/** A 20 x 12 m rectangular block, wound positively like the converter emits. */
const BLOCK: CityBuilding = {
  i: 1,
  h: 30,
  t: 'generic',
  r: [
    [-10, -6],
    [10, -6],
    [10, 6],
    [-10, 6],
  ],
}

function faces(building: CityBuilding) {
  const { geometry } = buildCityGeometry([building])
  const pos = geometry.getAttribute('position')
  const out: Array<{ centroid: [number, number, number]; normal: [number, number, number] }> = []

  for (let i = 0; i < pos.count; i += 3) {
    const ax = pos.getX(i), ay = pos.getY(i), az = pos.getZ(i)
    const bx = pos.getX(i + 1), by = pos.getY(i + 1), bz = pos.getZ(i + 1)
    const cx = pos.getX(i + 2), cy = pos.getY(i + 2), cz = pos.getZ(i + 2)

    const e1 = [bx - ax, by - ay, bz - az]
    const e2 = [cx - ax, cy - ay, cz - az]
    out.push({
      centroid: [(ax + bx + cx) / 3, (ay + by + cy) / 3, (az + bz + cz) / 3],
      normal: [
        e1[1]! * e2[2]! - e1[2]! * e2[1]!,
        e1[2]! * e2[0]! - e1[0]! * e2[2]!,
        e1[0]! * e2[1]! - e1[1]! * e2[0]!,
      ],
    })
  }
  return out
}

describe('city geometry winding', () => {
  it('points every wall normal away from the building centre', () => {
    // Walls are the faces with no vertical component to their normal.
    const walls = faces(BLOCK).filter((f) => Math.abs(f.normal[1]) < 1e-6)
    expect(walls.length).toBeGreaterThan(0)

    for (const wall of walls) {
      // Building centre is the origin for BLOCK, so the centroid doubles as the
      // outward direction.
      const dot = wall.normal[0] * wall.centroid[0] + wall.normal[2] * wall.centroid[2]
      expect(dot).toBeGreaterThan(0)
    }
  })

  it('points roof normals upward', () => {
    const roofs = faces(BLOCK).filter((f) => Math.abs(f.normal[1]) > 1e-6)
    expect(roofs.length).toBeGreaterThan(0)
    for (const roof of roofs) expect(roof.normal[1]).toBeGreaterThan(0)
  })

  it('carries facade attributes measured in metres along each wall', () => {
    const { geometry } = buildCityGeometry([BLOCK])
    const facade = geometry.getAttribute('aFacade')
    const meta = geometry.getAttribute('aMeta')

    expect(facade).toBeDefined()
    expect(meta).toBeDefined()

    // The block's longest wall is 20 m, so some vertex must reach that far
    // along. Normalised UVs would cap at 1 and give every building the same
    // window count regardless of frontage.
    let maxU = 0
    for (let i = 0; i < facade.count; i++) maxU = Math.max(maxU, facade.getX(i))
    expect(maxU).toBeCloseTo(20, 3)

    // And wall height must reach the building height.
    let maxV = 0
    for (let i = 0; i < facade.count; i++) maxV = Math.max(maxV, facade.getY(i))
    expect(maxV).toBeCloseTo(30, 3)
  })

  it('flags roof vertices so the facade shader skips them', () => {
    const { geometry } = buildCityGeometry([BLOCK])
    const meta = geometry.getAttribute('aMeta')
    let roofVerts = 0
    for (let i = 0; i < meta.count; i++) if (meta.getZ(i) > 0.5) roofVerts++
    // A 4-sided ring fans into 2 roof triangles = 6 vertices.
    expect(roofVerts).toBe(6)
  })
})

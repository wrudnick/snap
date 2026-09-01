import { describe, expect, it } from 'vitest'
import * as THREE from 'three'

import { carve, slab } from '../src/content/models/landmarkKit'

/**
 * Is a point inside a closed mesh?
 *
 * Ray parity: fire in any direction and count crossings, odd means inside. The
 * question a recess has to answer is exactly this one — "is there still solid
 * here?" — and counting triangles or comparing bounding boxes cannot answer it.
 * A cut that removed nothing has the same bounds as one that removed
 * everything.
 */
function encloses(mesh: THREE.Mesh, point: THREE.Vector3): boolean {
  /**
   * Double-sided, deliberately.
   *
   * `Raycaster` honours `material.side`, and every material here is front-side,
   * so a ray fired from inside a solid meets nothing but back faces and reports
   * a clean miss. The first version of this test therefore said a solid wall
   * was hollow before anything had been cut out of it.
   */
  const probe = new THREE.Mesh(mesh.geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
  probe.position.copy(mesh.position)
  probe.quaternion.copy(mesh.quaternion)
  probe.scale.copy(mesh.scale)
  probe.updateMatrixWorld(true)
  const ray = new THREE.Raycaster(point, new THREE.Vector3(0.371, 0.729, 0.577).normalize())
  return ray.intersectObject(probe, false).length % 2 === 1
}

describe('carve', () => {
  it('removes the solid where the tool was', () => {
    const wall = slab(20, 12, 2, 0, 0xffffff)
    const opening = slab(6, 7, 4, 2, 0xffffff)
    wall.updateMatrixWorld(true)
    opening.updateMatrixWorld(true)

    const inTheOpening = new THREE.Vector3(0, 4, 0)
    expect(encloses(wall, inTheOpening), 'solid before the cut').toBe(true)

    const cut = carve(wall, opening)
    cut.updateMatrixWorld(true)
    expect(encloses(cut, inTheOpening), 'hollow after the cut').toBe(false)
  })

  it('leaves the wall around the opening alone', () => {
    const wall = slab(20, 12, 2, 0, 0xffffff)
    const cut = carve(wall, slab(6, 7, 4, 2, 0xffffff))
    cut.updateMatrixWorld(true)

    // Beside the opening, above it, and below it.
    for (const p of [new THREE.Vector3(8, 4, 0), new THREE.Vector3(0, 11, 0), new THREE.Vector3(0, 1, 0)]) {
      expect(encloses(cut, p), `solid at ${p.toArray().join(',')}`).toBe(true)
    }
  })

  it('honours the tool\'s own placement', () => {
    const wall = slab(20, 12, 2, 0, 0xffffff)
    // Offset along the wall, so the hole is off-centre and the middle stays solid.
    const cut = carve(wall, slab(4, 6, 4, 3, 0xffffff, [7, 0]))
    cut.updateMatrixWorld(true)
    expect(encloses(cut, new THREE.Vector3(7, 5, 0)), 'hollow where the tool was').toBe(false)
    expect(encloses(cut, new THREE.Vector3(0, 5, 0)), 'solid where it was not').toBe(true)
  })
})

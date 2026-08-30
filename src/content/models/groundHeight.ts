import * as THREE from 'three'

import { buildCityGround } from './cityGround'

/**
 * How high the ground is at a point.
 *
 * Subjects were placed at the *rail's* height: `point.y - EYE_HEIGHT` at the
 * anchor, whatever their lateral offset. That is right on flat ground and wrong
 * everywhere the route changes level — a car parked eight metres out in Michigan
 * Avenue while the route was climbing out of the underpass hung a metre in the
 * air above it.
 *
 * The ground is authored geometry, so the honest answer is to ask the geometry.
 * Triangles are bucketed into 12 m cells once, and a query reads a handful
 * rather than fifty thousand.
 *
 * The same sampler the ground sweep test uses, promoted out of it so the game
 * and its tests agree on where the floor is by construction.
 */

interface Sampler {
  position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute
  index: THREE.BufferAttribute
  grid: Map<string, number[]>
}

const CELL = 12
let sampler: Sampler | null = null

function build(): Sampler {
  const { geometry } = buildCityGround()
  const position = geometry.getAttribute('position')
  const index = geometry.getIndex()!
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

  return { position, index, grid }
}

/** Every ground surface directly under or over a point, low to high. */
export function surfacesAt(x: number, z: number): number[] {
  sampler ??= build()
  const { position, index, grid } = sampler
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

/**
 * The surface a subject stands on at this point.
 *
 * `hint` is where the caller believes the ground is — the rail's height. Of the
 * surfaces here, the one nearest that guess wins, which is what keeps a person
 * in the underpass on the tunnel floor rather than on Lake Shore Drive's deck
 * four and a half metres above their head.
 *
 * A surface more than three metres from the hint is not this subject's floor at
 * all; if none is closer, the hint stands.
 */
export function groundHeightAt(x: number, z: number, hint: number): number {
  let best = hint
  let bestGap = 3
  for (const y of surfacesAt(x, z)) {
    const gap = Math.abs(y - hint)
    if (gap < bestGap) {
      bestGap = gap
      best = y
    }
  }
  return best
}

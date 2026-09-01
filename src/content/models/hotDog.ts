import * as THREE from 'three'

import { makeRng } from '@/lib/rng'
import { toonRamp } from '@/render/palette'
import { toonMaterial } from '@/render/toonPatch'

/**
 * A Chicago dog: a bun, a sausage, poppy seeds, a line of mustard.
 *
 * Four boxes and some specks, and that is the whole thing. The first attempt
 * had a cylindrical sausage in a grooved bun with a tube of mustard following a
 * sine curve, and it was worse — at the twenty centimetres this is actually
 * seen at, the extra geometry only muddied a silhouette that reads fine as two
 * boxes. Poppy seeds want to be black pixels on the bun and mustard wants to be
 * a yellow line, because that is all either of them can be at this size.
 *
 * Built once and shared across the pool: every thrown item is the same object.
 *
 * The full canon adds relish, sport peppers, a pickle spear, tomato and celery
 * salt. The one thing everyone agrees on is that there is no ketchup.
 */

const BUN = 0xd6a25a
const SEED = 0x241d16
const SAUSAGE = 0xb4442f
const MUSTARD = 0xf2c318

export interface HotDogParts {
  geometry: THREE.BufferGeometry
  material: THREE.Material
}

let parts: HotDogParts[] | null = null

/** Merge transformed boxes into one geometry, position and normal only. */
function merge(shapes: Array<{ geometry: THREE.BufferGeometry; matrix: THREE.Matrix4 }>) {
  const positions: number[] = []
  const normals: number[] = []
  for (const { geometry, matrix } of shapes) {
    const copy = geometry.clone().applyMatrix4(matrix).toNonIndexed()
    positions.push(...(copy.attributes.position!.array as Float32Array))
    normals.push(...(copy.attributes.normal!.array as Float32Array))
    copy.dispose()
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  out.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  return out
}

export function hotDogParts(): HotDogParts[] {
  if (parts) return parts

  const bun = new THREE.BoxGeometry(0.22, 0.07, 0.09)
  bun.translate(0, 0.035, 0)
  const sausage = new THREE.BoxGeometry(0.2, 0.05, 0.05)
  sausage.translate(0, 0.085, 0)
  // The yellow line, straight down the sausage and proud of it.
  const mustard = new THREE.BoxGeometry(0.19, 0.012, 0.014)
  mustard.translate(0, 0.112, 0)

  /**
   * Poppy seeds, as black specks over the outside of the bun.
   *
   * On the sides and the ends as much as the top. The first pass scattered them
   * across the top face starting nineteen millimetres out from the middle,
   * which put a third of them underneath the sausage — seeds nobody can see are
   * geometry for its own sake, and the bun reads as plain from every angle you
   * actually look at it from, which is the side.
   *
   * Seeded, so every hot dog in the game is the same hot dog: they share one
   * geometry, and a scatter that varied per call would make the shared copy
   * depend on which throw happened to build it first.
   *
   * Each speck is flattened against the face it sits on and stands a couple of
   * millimetres off it — flush with the crust is where a real seed sits and is
   * also invisible, and worse, two coplanar surfaces flicker against each other.
   */
  const rng = makeRng(7)
  const seeds: Array<{ geometry: THREE.BufferGeometry; matrix: THREE.Matrix4 }> = []
  const spread = (n: number) => (rng() - 0.5) * n

  // The bun spans ±0.11 along, ±0.045 across, and 0 to 0.07 up.
  const flatOnTop = new THREE.BoxGeometry(0.011, 0.005, 0.008)
  const flatOnSide = new THREE.BoxGeometry(0.011, 0.008, 0.005)
  const flatOnEnd = new THREE.BoxGeometry(0.005, 0.008, 0.011)

  // Top, but only the strip outboard of the sausage.
  for (let i = 0; i < 8; i++) {
    seeds.push({
      geometry: flatOnTop,
      matrix: new THREE.Matrix4().makeTranslation(
        spread(0.2),
        0.0715,
        (rng() < 0.5 ? 1 : -1) * (0.03 + rng() * 0.012),
      ),
    })
  }
  // The long sides, which is what you see from the pavement.
  for (let i = 0; i < 22; i++) {
    seeds.push({
      geometry: flatOnSide,
      matrix: new THREE.Matrix4().makeTranslation(
        spread(0.2),
        0.014 + rng() * 0.044,
        (rng() < 0.5 ? 1 : -1) * 0.0465,
      ),
    })
  }
  // And the ends.
  for (let i = 0; i < 6; i++) {
    seeds.push({
      geometry: flatOnEnd,
      matrix: new THREE.Matrix4().makeTranslation(
        (rng() < 0.5 ? 1 : -1) * 0.1125,
        0.016 + rng() * 0.04,
        spread(0.06),
      ),
    })
  }
  const seedGeometry = merge(seeds)
  flatOnTop.dispose()
  flatOnSide.dispose()
  flatOnEnd.dispose()

  parts = [
    { geometry: bun, material: toonMaterial(BUN, toonRamp()) },
    { geometry: seedGeometry, material: toonMaterial(SEED, toonRamp()) },
    { geometry: sausage, material: toonMaterial(SAUSAGE, toonRamp()) },
    { geometry: mustard, material: toonMaterial(MUSTARD, toonRamp()) },
  ]
  return parts
}

/** The whole thing as one object, for the model inspector. */
export function buildHotDog(): THREE.Group {
  const group = new THREE.Group()
  for (const { geometry, material } of hotDogParts()) {
    group.add(new THREE.Mesh(geometry, material))
  }
  return group
}

import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { toonRamp } from '@/render/palette'
import { toonMaterial } from '@/render/toonPatch'

/**
 * Hand-authored buildings.
 *
 * The procedural generator makes convincing *filler* — massing, palette and
 * rhythm — but nothing seeded produces the Hancock's taper or the Palmolive's
 * setbacks, and those are the reason to set a game in Chicago at all. Landmarks
 * are therefore built individually and placed by address.
 *
 * Each builder returns a Group of primitives sharing the cached toon materials,
 * so a landmark costs a handful of draw calls rather than one. They are few, and
 * they are the thing the player is looking at.
 */

export type LandmarkKind = 'hancock' | 'tower' | 'slab'

export interface LandmarkDef {
  id: string
  /** In-game name. Real architecture, invented signage. */
  name: string
  kind: LandmarkKind
  /** World position of the building's base centre. */
  position: [number, number, number]
  rotationY: number
  height: number
  /** Base footprint, metres. */
  footprint: [number, number]
  /** Fraction of the footprint remaining at the top. 1 = no taper. */
  taper?: number
  color: number
  accent: number
  /** Number of setback tiers for `tower`. */
  tiers?: number
}

const mat = (c: number) => toonMaterial(c, toonRamp())

/**
 * A square frustum.
 *
 * `CylinderGeometry` with 4 radial segments gives a diamond cross-section;
 * rotating a quarter-turn squares it up, and independent x/z scaling turns the
 * square into the rectangle a real floorplate is. The taper ratio survives the
 * scaling because it applies to the radius.
 */
function frustum(
  taper: number,
  width: number,
  height: number,
  depth: number,
  color: number,
): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(taper, 1, 1, 4, 1)
  const mesh = new THREE.Mesh(geo, mat(color))
  mesh.rotation.y = Math.PI / 4
  mesh.scale.set(width / Math.SQRT2, height, depth / Math.SQRT2)
  mesh.position.y = height / 2
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

function box(
  w: number,
  h: number,
  d: number,
  color: number,
  pos: [number, number, number],
  rotZ = 0,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color))
  mesh.position.set(...pos)
  if (rotZ) mesh.rotation.z = rotZ
  mesh.castShadow = true
  return mesh
}

/**
 * 875 North Michigan Avenue — the John Hancock Center.
 *
 * Three things make it recognisable at any distance, and it needs all three:
 * the taper (a 262×165 ft base narrowing to 100×56 ft), the exterior X-bracing,
 * and the twin antennas. Drop any one and it reads as a generic dark tower.
 *
 * The braces are the fiddly part: because the tower tapers, every level is a
 * different width, so each X is sized from the interpolated width at its own
 * height rather than stamped from a template.
 */
function buildHancock(def: LandmarkDef): THREE.Group {
  const g = new THREE.Group()
  const [baseW, baseD] = def.footprint
  const taper = def.taper ?? 0.38
  const h = def.height

  g.add(frustum(taper, baseW, h, baseD, def.color))

  // Width and depth at a given height fraction.
  const widthAt = (f: number) => baseW * (1 - f * (1 - taper))
  const depthAt = (f: number) => baseD * (1 - f * (1 - taper))

  const LEVELS = 5
  const belt = 2.2

  for (let i = 0; i <= LEVELS; i++) {
    const f = i / LEVELS
    const y = f * h
    const w = widthAt(f) + 0.6
    const d = depthAt(f) + 0.6
    // Horizontal belts at every brace intersection — as much of the building's
    // signature as the diagonals themselves.
    g.add(box(w, belt, d, def.accent, [0, y === 0 ? belt / 2 : Math.min(y, h - belt / 2), 0]))
  }

  // X-bracing on all four faces.
  for (let i = 0; i < LEVELS; i++) {
    const f0 = i / LEVELS
    const f1 = (i + 1) / LEVELS
    const y0 = f0 * h
    const y1 = f1 * h
    const midY = (y0 + y1) / 2
    const rise = y1 - y0

    for (const [axis, run, offset] of [
      ['x', (widthAt(f0) + widthAt(f1)) / 2, (depthAt(f0) + depthAt(f1)) / 2],
      ['z', (depthAt(f0) + depthAt(f1)) / 2, (widthAt(f0) + widthAt(f1)) / 2],
    ] as const) {
      const diagonal = Math.hypot(run, rise)
      const angle = Math.atan2(rise, run)

      for (const side of [-1, 1] as const) {
        for (const dir of [1, -1] as const) {
          const bar = new THREE.Mesh(
            new THREE.BoxGeometry(diagonal, 1.5, 0.9),
            mat(def.accent),
          )
          bar.rotation.z = angle * dir
          if (axis === 'z') bar.rotation.y = Math.PI / 2
          bar.position.set(
            axis === 'x' ? 0 : (side * offset) / 2,
            midY,
            axis === 'x' ? (side * offset) / 2 : 0,
          )
          bar.castShadow = true
          g.add(bar)
        }
      }
    }
  }

  // Twin antennas.
  for (const side of [-1, 1] as const) {
    const antenna = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.9, h * 0.33, 6),
      mat(def.accent),
    )
    antenna.position.set(side * widthAt(1) * 0.26, h + h * 0.165, 0)
    g.add(antenna)
  }

  return g
}

/**
 * Generic setback tower — the 1920s Chicago wedding cake.
 *
 * Not a specific building, but the massing rule most of the Magnificent Mile
 * follows: a heavy plinth, a shaft with vertical piers, and stepped setbacks
 * toward a capped crown. Reusable for anything that isn't worth hand-modelling.
 */
function buildTower(def: LandmarkDef): THREE.Group {
  const g = new THREE.Group()
  const [w, d] = def.footprint
  const tiers = def.tiers ?? 3
  const h = def.height

  // Plinth: two storeys of heavier stone, slightly proud of the shaft.
  const plinthH = Math.min(12, h * 0.12)
  g.add(box(w + 1.4, plinthH, d + 1.4, def.accent, [0, plinthH / 2, 0]))

  let y = plinthH
  let tw = w
  let td = d

  for (let i = 0; i < tiers; i++) {
    // Each tier is shorter and narrower than the one below it.
    const tierH = ((h - plinthH) / tiers) * (1 - i * 0.12)
    g.add(box(tw, tierH, td, def.color, [0, y + tierH / 2, 0]))

    // Cornice capping the tier — the shadow line that reads as stone.
    g.add(box(tw + 0.9, 1.1, td + 0.9, def.accent, [0, y + tierH, 0]))

    // Vertical piers on the two broad faces, which is what stops a tier
    // reading as a plain box at distance.
    const piers = Math.max(3, Math.round(tw / 5))
    for (let p = 0; p < piers; p++) {
      const px = -tw / 2 + (tw / piers) * (p + 0.5)
      for (const side of [-1, 1] as const) {
        g.add(box(0.7, tierH * 0.94, 0.5, def.accent, [px, y + tierH / 2, (side * td) / 2]))
      }
    }

    y += tierH
    tw *= 0.82
    td *= 0.82
  }

  // Crown.
  g.add(box(tw * 0.7, 3.5, td * 0.7, def.accent, [0, y + 1.75, 0]))
  return g
}

/** Plain modern slab — post-war infill, deliberately unornamented. */
function buildSlab(def: LandmarkDef): THREE.Group {
  const g = new THREE.Group()
  const [w, d] = def.footprint
  const h = def.height

  g.add(frustum(def.taper ?? 1, w, h, d, def.color))

  // Spandrel bands every few floors give scale without geometry cost.
  const bands = Math.max(2, Math.round(h / 26))
  for (let i = 1; i < bands; i++) {
    const y = (h / bands) * i
    g.add(box(w + 0.5, 1.0, d + 0.5, def.accent, [0, y, 0]))
  }
  return g
}

const BUILDERS: Record<LandmarkKind, (def: LandmarkDef) => THREE.Group> = {
  hancock: buildHancock,
  tower: buildTower,
  slab: buildSlab,
}

/**
 * Collapse a landmark to one mesh per colour.
 *
 * The Hancock alone is about forty primitives — frustum, belts, forty brace
 * bars, two antennas — and at one draw call each, eight landmarks cost more than
 * the rest of the city combined. None of them animate, so their geometry can be
 * baked into world space and merged per material, taking each building from ~40
 * draw calls to 2.
 */
function mergeByMaterial(source: THREE.Group): THREE.Group {
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>()

  source.updateMatrixWorld(true)
  source.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const material = child.material as THREE.Material
    // Bake the local transform in, since the merged mesh has none of its own.
    const geometry = child.geometry.clone().applyMatrix4(child.matrix)
    const bucket = buckets.get(material)
    if (bucket) bucket.push(geometry)
    else buckets.set(material, [geometry])
  })

  const merged = new THREE.Group()
  for (const [material, geometries] of buckets) {
    const geometry = mergeGeometries(geometries, false)
    geometries.forEach((g) => g.dispose())
    if (!geometry) continue
    const mesh = new THREE.Mesh(geometry, material)
    mesh.castShadow = true
    mesh.receiveShadow = true
    merged.add(mesh)
  }

  // The source primitives were only ever scaffolding.
  source.traverse((child) => {
    if (child instanceof THREE.Mesh) child.geometry.dispose()
  })

  return merged
}

export function buildLandmark(def: LandmarkDef): THREE.Group {
  const g = mergeByMaterial(BUILDERS[def.kind](def))
  g.position.set(...def.position)
  g.rotation.y = def.rotationY
  return g
}

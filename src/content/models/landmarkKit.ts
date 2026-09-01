import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { toonRamp } from '@/render/palette'
import { toonMaterial } from '@/render/toonPatch'

/**
 * Massing parts, shared by every hand-authored building.
 *
 * The point of a kit is that a landmark's file says what the building *looks
 * like* and nothing else. Every one of these takes sizes in metres and puts its
 * own base at y = 0, so a builder reads as a stack of storeys rather than as
 * arithmetic on half-heights — which is what the first landmark was, and why
 * adding a second one to it was unappealing.
 *
 * Everything is boxes and frusta on purpose. The art style is flat-shaded
 * blocks with ink outlines, and the outline pass keys off depth and normal
 * discontinuities — so a recess a few centimetres deep draws a line, and a
 * painted one never will. Detail here is geometry because geometry is what the
 * renderer can see.
 */

export const mat = (color: number) => toonMaterial(color, toonRamp())

/** A box with its base at `y`, centred on the origin in plan. */
export function slab(
  width: number,
  height: number,
  depth: number,
  y: number,
  color: number,
  offset: [number, number] = [0, 0],
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), mat(color))
  mesh.position.set(offset[0], y + height / 2, offset[1])
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

/**
 * A tapering block, for anything that narrows as it rises.
 *
 * A four-sided cylinder is a diamond in plan; the quarter-turn squares it up,
 * and scaling x and z independently makes it the rectangle a floorplate
 * actually is. The taper is a radius ratio, so it survives that scaling.
 */
export function taperedSlab(
  width: number,
  height: number,
  depth: number,
  y: number,
  taper: number,
  color: number,
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(taper, 1, 1, 4, 1),
    mat(color),
  )
  mesh.rotation.y = Math.PI / 4
  mesh.scale.set(width / Math.SQRT2, height, depth / Math.SQRT2)
  mesh.position.y = y + height / 2
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

/**
 * A projecting horizontal band — cornice, string course, sill line.
 *
 * The single most useful part in the kit. A tall box with nothing crossing it
 * reads as a chimney at any distance; one band at the right height turns it
 * into a building with a top.
 */
export function band(
  width: number,
  depth: number,
  y: number,
  thickness: number,
  overhang: number,
  color: number,
): THREE.Mesh {
  return slab(width + overhang * 2, thickness, depth + overhang * 2, y, color)
}

/**
 * Vertical piers up a face, the Art Deco tell.
 *
 * Modelled proud of the wall rather than drawn on it, so each one throws its
 * own outline and the facade reads as fluted from across the street. Placed on
 * both long faces; the short ends are usually party walls or lightwells and
 * getting piers on them is worse than having none.
 */
export function piers(
  width: number,
  height: number,
  depth: number,
  y: number,
  count: number,
  color: number,
  proud = 0.5,
): THREE.Group {
  const group = new THREE.Group()
  const pitch = width / count
  const thickness = Math.min(pitch * 0.34, 2.2)

  for (let i = 0; i < count; i++) {
    const x = -width / 2 + pitch * (i + 0.5)
    for (const z of [depth / 2, -depth / 2]) {
      const fin = slab(thickness, height, proud * 2, y, color, [x, z])
      group.add(fin)
    }
  }
  return group
}

/**
 * Horizontal floor banding — a string course every `spacing` metres.
 *
 * Proud of the wall, not inset. The first version made a box a third of a metre
 * *smaller* than the wall it was banding, so every one of them was sealed
 * invisibly inside the building: the Drake had thirteen storeys of banding and
 * showed none of it. A band has to break the surface to cast the line that
 * makes a wall read as floors.
 */
export function floorBands(
  width: number,
  height: number,
  depth: number,
  y: number,
  spacing: number,
  color: number,
): THREE.Group {
  const group = new THREE.Group()
  const rows = Math.floor(height / spacing)
  for (let i = 1; i <= rows; i++) {
    const at = y + i * spacing
    if (at > y + height - spacing * 0.5) break
    group.add(band(width, depth, at, 0.3, 0.16, color))
  }
  return group
}

/**
 * A pitched roof with a ridge running the long way.
 *
 * Two slanted planes, not a tapered block. A four-sided taper is a hipped
 * pyramid, and on a long narrow plan it spreads out past the walls and reads
 * as a tent thrown over the building — which is exactly what the church looked
 * like. A gable is the shape that says "nave".
 */
export function gable(
  width: number,
  depth: number,
  y: number,
  rise: number,
  color: number,
): THREE.Mesh {
  /**
   * Built as its own geometry rather than assembled from primitives.
   *
   * Two rotated boxes plus a pair of cone-ends was the first attempt, and the
   * ends came out as wings flying off both gables — composing a rotation about
   * one axis with a rotation about another is exactly the kind of thing that
   * looks right in the code and wrong on the screen. Six vertices spelled out
   * cannot be wrong in that way.
   *
   * Ridge runs along X, the long axis; eaves at ±depth/2.
   */
  const hw = width / 2
  const hd = depth / 2
  // Ridge ends, then the four eaves corners.
  const r0: [number, number, number] = [-hw, rise, 0]
  const r1: [number, number, number] = [hw, rise, 0]
  const a0: [number, number, number] = [-hw, 0, hd]
  const a1: [number, number, number] = [hw, 0, hd]
  const b0: [number, number, number] = [-hw, 0, -hd]
  const b1: [number, number, number] = [hw, 0, -hd]

  const tri = (...points: Array<[number, number, number]>) => points.flat()
  const positions = [
    // Front slope.
    ...tri(a0, a1, r1), ...tri(a0, r1, r0),
    // Back slope.
    ...tri(b1, b0, r0), ...tri(b1, r0, r1),
    // Gable ends.
    ...tri(a0, r0, b0), ...tri(b1, r1, a1),
  ]

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.computeVertexNormals()

  const mesh = new THREE.Mesh(geometry, mat(color))
  mesh.position.y = y
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

/**
 * A tapering spire, optionally on an open lantern stage.
 *
 * A Gothic tower ends in a point, and a flat crenellated top is a castle. The
 * lantern — a short open stage of piers below the spire — is what stops the
 * spire looking like a cone stuck on a box.
 */
export function spire(
  width: number,
  y: number,
  lanternHeight: number,
  spireHeight: number,
  color: number,
): THREE.Group {
  const group = new THREE.Group()

  group.add(slab(width, lanternHeight, width, y, color))
  // Open the lantern with corner posts standing proud of the recessed core.
  group.add(slab(width * 0.72, lanternHeight - 0.6, width * 0.72, y, shade(color, 0.72)))
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      group.add(
        slab(width * 0.2, lanternHeight, width * 0.2, y, color, [
          (sx * width) / 2 - sx * width * 0.1,
          (sz * width) / 2 - sz * width * 0.1,
        ]),
      )
    }
  }

  const cone = new THREE.Mesh(
    new THREE.CylinderGeometry(0.001, width * 0.62, spireHeight, 8, 1),
    mat(color),
  )
  cone.position.y = y + lanternHeight + spireHeight / 2
  cone.castShadow = true
  group.add(cone)
  return group
}

/** A darker or lighter version of a colour. */
export function shade(color: number, factor: number): number {
  const ch = (shift: number) =>
    Math.min(255, Math.round(((color >> shift) & 0xff) * factor))
  return (ch(16) << 16) | (ch(8) << 8) | ch(0)
}

/** A row of merlons round a parapet — the tell for a Gothic tower. */
export function crenellation(
  width: number,
  depth: number,
  y: number,
  color: number,
): THREE.Group {
  const group = new THREE.Group()
  const count = Math.max(3, Math.round(width / 1.6))
  const pitch = width / count
  for (let i = 0; i < count; i += 2) {
    const x = -width / 2 + pitch * (i + 0.5)
    group.add(slab(pitch * 0.8, 1.6, depth + 0.4, y, color, [x, 0]))
  }
  for (let i = 0; i < count; i += 2) {
    const z = -depth / 2 + (depth / count) * (i + 0.5)
    group.add(slab(width + 0.4, 1.6, (depth / count) * 0.8, y, color, [0, z]))
  }
  return group
}

/**
 * A stepped stack, the 1920s zoning wedding cake.
 *
 * Each tier is a fraction of the one below in plan and a fraction of the
 * remaining height, so the profile keeps narrowing however many tiers are
 * asked for — which is the shape the setback laws produced and the reason
 * Chicago's pre-war skyline looks the way it does.
 */
export function setbackStack(
  width: number,
  depth: number,
  y: number,
  height: number,
  tiers: number,
  shrink: number,
  color: number,
): THREE.Group {
  const group = new THREE.Group()
  let w = width
  let d = depth
  let base = y
  let remaining = height

  for (let i = 0; i < tiers; i++) {
    // Taller lower tiers: a stack of equal steps reads as a staircase.
    const share = i === tiers - 1 ? remaining : remaining * 0.45
    group.add(slab(w, share, d, base, color))
    group.add(band(w, d, base + share - 0.6, 0.7, 0.5, color))
    base += share
    remaining -= share
    w *= shrink
    d *= shrink
  }
  return group
}

/**
 * A prism of the building's real outline.
 *
 * The rectangle a landmark is otherwise built from is the largest that fits
 * *inside* the footprint, which keeps it out of the road but makes it smaller
 * than the building — the Palmolive's plan came out 34 by 27 where the real one
 * is nearer 70 by 32. At height nobody can tell. At the pavement, where the
 * player walks past at arm's length, the wall is simply in the wrong place.
 *
 * So the part that meets the ground follows the outline exactly and the mass
 * above it keeps the fitted rectangle. That is also how these buildings are
 * actually shaped: a podium filling its plot with a tower set back on top.
 */
export function extrudeRing(
  ring: Array<[number, number]>,
  y: number,
  height: number,
  color: number,
): THREE.Mesh {
  /**
   * The shape is laid out with z negated.
   *
   * `ExtrudeGeometry` builds in the XY plane and along +Z; standing it up with
   * a −90° rotation about X sends the shape's Y to world −Z, which mirrors the
   * footprint. Negating it here cancels that, so the prism has the outline the
   * building actually has rather than its reflection.
   */
  const shape = new THREE.Shape()
  ring.forEach(([x, z], i) => {
    if (i === 0) shape.moveTo(x, -z)
    else shape.lineTo(x, -z)
  })
  shape.closePath()

  const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false })
  // Standing it up already puts it in 0..height, so this only lifts it to `y`.
  // Translating by `y + height` — which is what this did — floats every base a
  // whole storey above the building it belongs to.
  geometry.rotateX(-Math.PI / 2)
  geometry.translate(0, y, 0)

  const mesh = new THREE.Mesh(geometry, mat(color))
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

/** Merge a scaffold of primitives down to one mesh per material. */
export function mergeByMaterial(source: THREE.Object3D): THREE.Group {
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>()

  source.updateMatrixWorld(true)
  source.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const material = child.material as THREE.Material
    /**
     * De-indexed first.
     *
     * `gable` is written out by hand and is non-indexed; every primitive from
     * three is indexed. `mergeGeometries` refuses a mixture, and the failure is
     * a console error rather than a throw — so the church simply had no roof
     * and nothing said why.
     */
    const source = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone()
    const geometry = source.applyMatrix4(child.matrixWorld)
    /**
     * Position and normal only.
     *
     * `mergeGeometries` needs every input to carry the same attributes, and the
     * hand-written parts have no `uv` while three's primitives all do. Nothing
     * downstream wants them either: landmarks are flat-shaded and their windows
     * come from `aFacade`, which is generated after the merge. Dropping them is
     * both the fix and a smaller buffer.
     */
    for (const name of Object.keys(geometry.attributes)) {
      if (name !== 'position' && name !== 'normal') geometry.deleteAttribute(name)
    }
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

  source.traverse((child) => {
    if (child instanceof THREE.Mesh) child.geometry.dispose()
  })

  return merged
}

/**
 * Give a merged landmark the attributes the facade shader reads.
 *
 * Landmarks are hand-modelled, so they arrive with none of the per-vertex data
 * the extruded city carries — which meant they rendered as blank slabs. Up
 * close that is *worse* than the box they replaced: the box at least had
 * painted windows, and a fifty-metre featureless wall beside the pavement is
 * the most conspicuous thing on the street.
 *
 * The attributes are derivable from the geometry itself. A triangle facing up
 * is a roof and gets no fenestration; anything else is a wall, and the
 * horizontal direction along that wall is the face normal turned a quarter
 * turn. Distance along that direction is the shader's `u`, height above grade
 * is its `v`.
 *
 * Deliberately world-space and not per-mesh: two walls of the same building
 * that meet at a corner then share a `u` origin, so their window grids line up
 * across the corner instead of restarting.
 */
export function addFacadeAttributes(geometry: THREE.BufferGeometry, seed: number): void {
  const source = geometry.index ? geometry.toNonIndexed() : geometry
  if (source !== geometry) {
    geometry.copy(source)
    source.dispose()
  }

  const position = geometry.getAttribute('position')
  const count = position.count
  const facade = new Float32Array(count * 2)
  const meta = new Float32Array(count * 3)

  // Wall height: the tallest vertex in the whole landmark, which is what the
  // shader wants for placing a cornice.
  let top = 0
  for (let i = 0; i < count; i++) top = Math.max(top, position.getY(i))

  const ax = new THREE.Vector3()
  const bx = new THREE.Vector3()
  const cx = new THREE.Vector3()
  const e1 = new THREE.Vector3()
  const e2 = new THREE.Vector3()
  const normal = new THREE.Vector3()

  for (let i = 0; i < count; i += 3) {
    ax.fromBufferAttribute(position, i)
    bx.fromBufferAttribute(position, i + 1)
    cx.fromBufferAttribute(position, i + 2)
    e1.subVectors(bx, ax)
    e2.subVectors(cx, ax)
    normal.crossVectors(e1, e2).normalize()

    // Near-horizontal faces are roofs and soffits.
    const isRoof = Math.abs(normal.y) > 0.6 ? 1 : 0
    // The wall's own left-to-right direction, in plan.
    const dx = -normal.z
    const dz = normal.x
    const length = Math.hypot(dx, dz) || 1

    for (let k = 0; k < 3; k++) {
      const v = i + k
      const px = position.getX(v)
      const py = position.getY(v)
      const pz = position.getZ(v)
      facade[v * 2] = (px * dx + pz * dz) / length
      facade[v * 2 + 1] = py
      meta[v * 3] = top
      meta[v * 3 + 1] = seed
      meta[v * 3 + 2] = isRoof
    }
  }

  geometry.setAttribute('aFacade', new THREE.BufferAttribute(facade, 2))
  geometry.setAttribute('aMeta', new THREE.BufferAttribute(meta, 3))
}

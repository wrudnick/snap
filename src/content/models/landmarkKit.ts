import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg'

import { toonRamp } from '@/render/palette'
import { toonMaterial } from '@/render/toonPatch'
import type { LandmarkSite } from './landmarkSites'

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
  /**
   * The quarter turn is baked into the geometry, not left on the mesh.
   *
   * A four-sided cylinder has its corners on the axes, so it needs turning
   * forty-five degrees to become a box. Doing that with `mesh.rotation` applies
   * it *after* the scale — three.js composes T·R·S — so a plan that is not
   * square comes out as a rhombus with its axes swapped into the diagonals.
   * On the Hancock, 72 by 46 metres, that put the body thirteen metres outside
   * its own footprint in z, and every brace measured against the intended
   * rectangle then looked like it was floating clear of the building.
   *
   * Baked first, the vertices are already a square in plan and the scale simply
   * stretches it to width and depth.
   */
  const geometry = new THREE.CylinderGeometry(taper, 1, 1, 4, 1)
  geometry.rotateY(Math.PI / 4)
  const mesh = new THREE.Mesh(geometry, mat(color))
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
  /**
   * How far each course stands out from the wall.
   *
   * A string course on a masonry building is a few centimetres. A balcony on a
   * post-war slab is well over a metre, and at that depth the course stops
   * being a line on the wall and becomes the building's whole relief — so it
   * has to be settable rather than fixed at the masonry value.
   */
  overhang = 0.16,
  thickness = 0.3,
): THREE.Group {
  const group = new THREE.Group()
  const rows = Math.floor(height / spacing)
  for (let i = 1; i <= rows; i++) {
    const at = y + i * spacing
    if (at > y + height - spacing * 0.5) break
    group.add(band(width, depth, at, thickness, overhang, color))
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
  /**
   * Which way the ridge runs.
   *
   * A nave is long, and its ridge runs down the length of it. With only the
   * one axis available the church got a roof turned across its nave and
   * covering a fifth of it, the other fifty metres left flat on top.
   */
  along: 'x' | 'z' = 'x',
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
  // Ridge ends, then the four eaves corners. Spelled out for both axes rather
  // than rotated, since a rotation is exactly what put wings on the first one.
  const ridged = along === 'x'
  const r0: [number, number, number] = ridged ? [-hw, rise, 0] : [0, rise, -hd]
  const r1: [number, number, number] = ridged ? [hw, rise, 0] : [0, rise, hd]
  const a0: [number, number, number] = ridged ? [-hw, 0, hd] : [hw, 0, -hd]
  const a1: [number, number, number] = ridged ? [hw, 0, hd] : [hw, 0, hd]
  const b0: [number, number, number] = ridged ? [-hw, 0, -hd] : [-hw, 0, -hd]
  const b1: [number, number, number] = ridged ? [hw, 0, -hd] : [-hw, 0, hd]

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

  /**
   * The core is the lantern. There is no box around it.
   *
   * There used to be: a solid full-width block, with the "recessed core" built
   * inside it and the corner posts standing on top of both. Nothing was
   * recessed and nothing was open — the core drew nothing at all and the
   * lantern was a plain box with the posts buried in its corners. The whole
   * point of a lantern is that daylight comes through it.
   */
  group.add(slab(width * 0.72, lanternHeight, width * 0.72, y, shade(color, 0.72)))
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

/**
 * Which wall of the building, named the way a person would name it.
 *
 * Not an axis. `heading` follows the longest edge of the plot, which is the
 * side lot line as often as it is the frontage, so local +Z is the front for
 * about a quarter of these buildings and the back or a flank for the rest. A
 * builder that names an axis is guessing; a builder that says "street" is not.
 *
 * `left` and `right` are from the point of view of someone standing in the
 * street looking at the building, which is the only vantage that matters here.
 */
export type Wall = 'street' | 'back' | 'left' | 'right'

export interface WallPlacement {
  /** Width along the wall. */
  across: number
  height: number
  /** How far it stands out from the wall, or sinks into it. */
  depth: number
  /** Height of its underside above grade. */
  y: number
  /** Offset along the wall, from centred. */
  along?: number
  /** Set back behind the wall face — for glass sitting inside a cut reveal. */
  set?: number
  color?: number
}

/**
 * The plane a wall lies in, and which way is out.
 *
 * The wall comes from the footprint's real edge rather than half the bounds,
 * because the frame's origin is the centre of the inscribed rectangle and the
 * ring is not centred on it. On the church those differ by 3.7 m along the
 * nave, which was enough to leave the entire Michigan Avenue front sitting
 * inside the masonry.
 */
function wallPlane(site: LandmarkSite, wall: Wall): {
  out: [number, number]
  plane: number
  onX: boolean
  width: number
} {
  const [fx, fz] = site.streetFace
  // Standing in the street facing the building, right is the wall clockwise
  // from the front — cross(look, up) with look pointing at the building.
  const out: [number, number] =
    wall === 'street' ? [fx, fz]
    : wall === 'back' ? [-fx, -fz]
    : wall === 'right' ? [fz, -fx]
    : [-fz, fx]

  const { minX, maxX, minZ, maxZ } = site.extent
  const onX = Math.abs(out[0]) > 0
  return {
    out,
    onX,
    plane: onX ? (out[0] > 0 ? maxX : minX) : out[1] > 0 ? maxZ : minZ,
    // How much wall there is to place things along.
    width: onX ? maxZ - minZ : maxX - minX,
  }
}

/** How much wall there is, so a builder can size things as a fraction of it. */
export function wallWidth(site: LandmarkSite, wall: Wall): number {
  return wallPlane(site, wall).width
}

/**
 * A part standing proud of a wall.
 *
 * The caller thinks in facade terms — how wide along the wall, how far it
 * stands out, how high off the pavement — and never in local axes. Both of the
 * ways this used to go wrong are gone: it cannot land on the wrong wall,
 * because walls are named rather than derived, and it cannot end up buried,
 * because it is measured from the wall's real position rather than from a
 * half-extent that assumes the footprint is centred.
 */
export function onWall(site: LandmarkSite, wall: Wall, p: WallPlacement): THREE.Mesh {
  const { out, plane, onX } = wallPlane(site, wall)
  const along = p.along ?? 0
  // Bites very slightly into the wall, so the join is a seam and not a gap.
  const centre = plane + (onX ? out[0] : out[1]) * (p.depth / 2 - 0.4 - (p.set ?? 0))
  const color = p.color ?? 0xffffff
  return onX
    ? slab(p.depth, p.height, p.across, p.y, color, [centre, along])
    : slab(p.across, p.height, p.depth, p.y, color, [along, centre])
}

/**
 * Cut a slot into one face of a specific mesh.
 *
 * The plane comes from the *target's* own bounding box rather than from the
 * footprint, which is the only version of this that cannot drift. A shaft is a
 * centred box and the footprint is not centred on the origin, so a cutter
 * measured from the footprint edge can stop short of the shaft entirely and
 * remove nothing — a carve that silently does nothing, which is a worse failure
 * than the sealed box it replaced, because at least a sealed box shows up in a
 * vertex count. A projecting wall block fails the same way in the other
 * direction, its outer face standing beyond where the cutter starts.
 *
 * Only the direction comes from the site. The distance is measured off the
 * thing being cut, so there is nothing to keep in step.
 *
 * It overshoots by 300 mm so the cut passes cleanly through the outer face.
 * Two coincident surfaces are the one thing a CSG evaluator cannot decide, and
 * the result is a flickering skin over the hole rather than an opening.
 */
export function slotIn(
  site: LandmarkSite,
  target: THREE.Mesh,
  wall: Wall,
  p: WallPlacement,
): THREE.Mesh {
  const { out, onX } = wallPlane(site, wall)
  const sign = onX ? out[0] : out[1]
  target.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(target)
  const plane = onX
    ? sign > 0 ? box.max.x : box.min.x
    : sign > 0 ? box.max.z : box.min.z

  const length = p.depth + 0.3
  const at = plane + sign * (0.3 - length / 2)
  const along = p.along ?? 0
  return onX
    ? slab(length, p.height, p.across, p.y, 0xffffff, [at, along])
    : slab(p.across, p.height, length, p.y, 0xffffff, [along, at])
}

/**
 * A wall block that stands proud of the footprint, with its cuts bound to it.
 *
 * A church front, a shopfront surround or a frontispiece projects past the
 * building line, so its outer face is not the footprint edge — and a cutter
 * measured from the footprint edge stops short of it and hollows out a cavity
 * sealed inside the stone. That is the same bug this whole exercise exists to
 * kill, arriving by a new route.
 *
 * So the block hands back its own cutters. There is no second measurement for a
 * builder to keep in step with the first, because there is no second
 * measurement.
 */
export interface WallSurface {
  /** How much wall there is along this face. */
  width: number
  /** The block itself. Pass it to `carve` with the cutters below. */
  mesh: THREE.Mesh
  /** A part standing proud of this block's outer face. */
  on(p: WallPlacement): THREE.Mesh
  /** A cutter sunk into this block's outer face, for `carve`. */
  into(p: WallPlacement): THREE.Mesh
  /** A panel set back behind this block's outer face — glass in a recess. */
  back(p: WallPlacement & { set: number }): THREE.Mesh
}

export function wallBlock(site: LandmarkSite, wall: Wall, o: WallPlacement): WallSurface {
  const { out, plane, onX, width } = wallPlane(site, wall)
  const sign = onX ? out[0] : out[1]
  const mesh = onWall(site, wall, o)
  // Where the block's own outer face ended up — see `onWall`.
  const face = plane + sign * (o.depth - 0.4)

  const box = (across: number, height: number, thickness: number, y: number, at: number, along: number, color: number) =>
    onX
      ? slab(thickness, height, across, y, color, [at, along])
      : slab(across, height, thickness, y, color, [along, at])

  return {
    width,
    mesh,
    on: (p) =>
      box(p.across, p.height, p.depth, p.y, face + sign * (p.depth / 2 - 0.4), p.along ?? 0, p.color ?? 0xffffff),
    // Delegated, so there is exactly one rule in the codebase for where a
    // cutter goes: measured off the face of the thing being cut.
    into: (p) => slotIn(site, mesh, wall, p),
    back: (p) =>
      box(p.across, p.height, p.depth, p.y, face - sign * (p.set + p.depth / 2), p.along ?? 0, p.color ?? 0xffffff),
  }
}

/**
 * The evaluator, kept for the life of the process.
 *
 * It holds working buffers that grow to the largest operation it has seen, so
 * one shared instance across the whole city is much cheaper than one per cut.
 */
const evaluator = new Evaluator()
evaluator.useGroups = false
// Position and normal only, matching what `mergeByMaterial` keeps. Asking for
// uv as well makes the evaluator carry an attribute nothing reads, and mismatched
// attribute sets between brushes are a silent failure in the merge later.
evaluator.attributes = ['position', 'normal']

/**
 * Cut shapes out of a solid.
 *
 * This exists because a recess is not a thing you can add. Sixteen places in
 * these models describe one, and with only addition available every one of them
 * had to fake it by putting a smaller box inside a bigger one — which is either
 * invisible, because it is sealed in the solid, or wrong, because it floats in
 * front of the wall it is supposed to be cut into. That produced the same bug
 * six times: the Drake's floor banding, the Carlyle's glass, the Esquire's
 * marquee, the spire's lantern, the light court on six prewar hotels at once,
 * and 900 North Michigan's window bands.
 *
 * Both meshes' own transforms are honoured and baked into the result, so the
 * caller can position a tool exactly the way it would position a part — which
 * is the whole point, since a cutter that has to be placed differently from a
 * part is a second convention to get wrong.
 */
export function carve(target: THREE.Mesh, ...tools: THREE.Mesh[]): THREE.Mesh {
  if (!tools.length) return target

  /**
   * Both operands are baked into the building's frame before evaluating.
   *
   * The evaluator returns its result in the *first* brush's local space, not in
   * world space, so carrying the transforms on the brushes puts the hole
   * somewhere else entirely — a wall standing at y = 6 came back with its
   * opening six metres low. Flattening the transform into the vertices means
   * there is only one frame in play and the result can sit at the origin.
   */
  const asBrush = (mesh: THREE.Mesh) => {
    mesh.updateMatrixWorld(true)
    const geometry = mesh.geometry.clone()
    geometry.applyMatrix4(mesh.matrixWorld)
    return new Brush(geometry)
  }

  let result = asBrush(target)
  for (const tool of tools) {
    const before = result.geometry.attributes.position!.count
    result = evaluator.evaluate(result, asBrush(tool), SUBTRACTION)
    result.updateMatrixWorld(true)
    /**
     * A cut that misses is worse than no cut at all.
     *
     * The evaluator hands back the original when the tool does not reach the
     * solid, so a cutter measured from the wrong plane removes nothing and says
     * nothing — leaving a builder that reads as though it opens a window and a
     * building that has none. That is strictly harder to notice than the sealed
     * box this replaced, which at least showed up in a vertex count. Subtracting
     * an intersecting box always changes the triangle count, so this cannot
     * pass by accident.
     */
    if (result.geometry.attributes.position!.count === before) {
      throw new Error('carve: the tool did not reach the solid, so nothing was cut')
    }
  }

  const carved = new THREE.Mesh(result.geometry, target.material)
  carved.castShadow = true
  carved.receiveShadow = true
  return carved
}

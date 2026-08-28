import * as THREE from 'three'

import { cellAt, characterAtlas, facedBox, FACE_ROW, OLD_FACE_ROW, COLS } from './characterAtlas'
import type { HumanSpec, SubjectDef } from '@/content/subjects/types'
import { makeRng } from '@/lib/rng'
import { toonRamp } from '@/render/palette'
import { disposeToonMaterials, patchToonMaterial, toonMaterial } from '@/render/toonPatch'

/**
 * Procedural placeholder subjects.
 *
 * These are primitives, but their animations are authored as genuine
 * `THREE.AnimationClip`s driven by a genuine `AnimationMixer`. That is the whole
 * point: the pose-reading code in the capture pipeline asks the mixer which clip
 * is playing and how far through it is, and that question has the same answer
 * whether the model came from here or from a .glb. Swapping in real assets
 * touches this directory and nothing else.
 *
 * CONVENTION: every model faces local -Z, matching three's camera convention, so
 * `Object3D.lookAt` orients a subject correctly along its patrol path.
 */

// One geometry of each primitive, scaled per part. Keeps geometry count flat no
// matter how many subjects exist.
const BOX = new THREE.BoxGeometry(1, 1, 1)
const SPHERE = new THREE.SphereGeometry(0.5, 12, 8)
const CONE = new THREE.ConeGeometry(0.5, 1, 8)
const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 10)

// Materials are shared per colour — material switches are what draw calls cost.
// Toon-shaded, and patched for hue-shifted shadow plus rim light.
function mat(color: number): THREE.MeshToonMaterial {
  return toonMaterial(color, toonRamp())
}

/**
 * Materials carrying the character atlas.
 *
 * Cached separately from the plain ones because they differ by map as well as
 * colour. The atlas is one shared texture, so this stays a small pool however
 * many people are on the street.
 */
const texturedCache = new Map<number, THREE.MeshToonMaterial>()
function texMat(color: number): THREE.MeshToonMaterial {
  let m = texturedCache.get(color)
  if (!m) {
    m = patchToonMaterial(
      new THREE.MeshToonMaterial({
        color,
        gradientMap: toonRamp(),
        map: characterAtlas(),
      }),
    )
    texturedCache.set(color, m)
  }
  return m
}

function part(
  name: string,
  geo: THREE.BufferGeometry,
  color: number,
  pos: [number, number, number],
  scale: [number, number, number],
  rot?: [number, number, number],
): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat(color))
  m.name = name
  m.position.set(...pos)
  m.scale.set(...scale)
  if (rot) m.rotation.set(...rot)
  m.castShadow = true
  return m
}

/**
 * A named joint.
 *
 * Animation rotates the *group*, while the mesh sits offset inside it — so a
 * limb swings from its shoulder or hip and a wheel rolls about its axle. Naming
 * the group rather than the mesh is what makes this transparent to the mixer:
 * clips keep targeting `armL.rotation[x]` exactly as before.
 *
 * Rotating the mesh directly pivots it about its own centre, which makes an arm
 * scissor away from the body mid-swing and a wheel spin like a turntable.
 */
function pivot(
  name: string,
  at: [number, number, number],
  mesh: THREE.Mesh,
  meshOffset: [number, number, number],
): THREE.Group {
  const g = new THREE.Group()
  g.name = name
  g.position.set(...at)
  mesh.position.set(...meshOffset)
  mesh.name = `${name}_mesh`
  g.add(mesh)
  return g
}

const num = (path: string, times: number[], values: number[]) =>
  new THREE.NumberKeyframeTrack(path, times, values)

const vec = (path: string, times: number[], values: number[]) =>
  new THREE.VectorKeyframeTrack(path, times, values)

export interface BuiltModel {
  group: THREE.Group
  clips: THREE.AnimationClip[]
  /** Local-space bounding box, used to project the subject at capture time. */
  bounds: THREE.Box3
}

// ---------------------------------------------------------------------------
// Bird
// ---------------------------------------------------------------------------

function buildBird(def: SubjectDef): BuiltModel {
  const { body: c, accent: a } = def.palette
  const g = new THREE.Group()
  g.add(
    part('body', SPHERE, c, [0, 0.19, 0], [0.3, 0.26, 0.42]),
    part('head', SPHERE, c, [0, 0.33, -0.15], [0.17, 0.17, 0.17]),
    part('beak', CONE, a, [0, 0.32, -0.24], [0.05, 0.1, 0.05], [-Math.PI / 2, 0, 0]),
    part('wingL', BOX, a, [-0.13, 0.21, 0.01], [0.03, 0.11, 0.28]),
    part('wingR', BOX, a, [0.13, 0.21, 0.01], [0.03, 0.11, 0.28]),
    part('tail', BOX, a, [0, 0.21, 0.24], [0.12, 0.03, 0.18]),
    part('legL', CYL, a, [-0.05, 0.05, 0.02], [0.02, 0.11, 0.02]),
    part('legR', CYL, a, [0.05, 0.05, 0.02], [0.02, 0.11, 0.02]),
  )

  const clips = [
    new THREE.AnimationClip('idle', 2.4, [
      num('head.rotation[y]', [0, 0.8, 1.6, 2.4], [0, 0.35, -0.3, 0]),
      num('body.position[y]', [0, 1.2, 2.4], [0.19, 0.205, 0.19]),
    ]),

    // Head drops to the ground and comes back up. The peak window in the subject
    // data corresponds to the bottom of that arc.
    new THREE.AnimationClip('peck', 1.2, [
      num('head.rotation[x]', [0, 0.45, 0.65, 1.2], [0, 1.15, 1.15, 0]),
      vec(
        'head.position',
        [0, 0.45, 0.65, 1.2],
        [0, 0.33, -0.15, 0, 0.19, -0.24, 0, 0.19, -0.24, 0, 0.33, -0.15],
      ),
      num('beak.rotation[x]', [0, 0.45, 0.65, 1.2], [-Math.PI / 2, -0.6, -0.6, -Math.PI / 2]),
      vec(
        'beak.position',
        [0, 0.45, 0.65, 1.2],
        [0, 0.32, -0.24, 0, 0.1, -0.3, 0, 0.1, -0.3, 0, 0.32, -0.24],
      ),
    ]),

    new THREE.AnimationClip('strut', 1.6, [
      num('body.position[y]', [0, 0.4, 0.8, 1.2, 1.6], [0.19, 0.22, 0.19, 0.22, 0.19]),
      num('head.rotation[y]', [0, 0.4, 0.8, 1.2, 1.6], [0, 0.45, 0, -0.45, 0]),
      num('legL.position[z]', [0, 0.4, 0.8, 1.2, 1.6], [0.02, 0.1, 0.02, -0.06, 0.02]),
      num('legR.position[z]', [0, 0.4, 0.8, 1.2, 1.6], [0.02, -0.06, 0.02, 0.1, 0.02]),
    ]),

    // Wings sweep up, body lifts. Peak is the top of the wingbeat.
    new THREE.AnimationClip('flap', 0.8, [
      num('wingL.rotation[z]', [0, 0.2, 0.4, 0.6, 0.8], [0, -1.1, 0.3, -1.1, 0]),
      num('wingR.rotation[z]', [0, 0.2, 0.4, 0.6, 0.8], [0, 1.1, -0.3, 1.1, 0]),
      num('body.position[y]', [0, 0.3, 0.5, 0.8], [0.19, 0.42, 0.46, 0.24]),
      num('body.rotation[x]', [0, 0.3, 0.8], [0, -0.25, 0]),
      num('tail.rotation[x]', [0, 0.4, 0.8], [0, 0.4, 0]),
    ]),
  ]

  return { group: g, clips, bounds: boundsOf(g) }
}

// ---------------------------------------------------------------------------
// Quadruped — shared by dog and cat, differing in scale and palette
// ---------------------------------------------------------------------------

function buildQuadruped(def: SubjectDef): BuiltModel {
  const { body: c, accent: a } = def.palette
  const g = new THREE.Group()
  g.add(
    part('body', BOX, c, [0, 0.52, 0], [0.42, 0.4, 0.86]),
    part('chest', BOX, c, [0, 0.56, -0.36], [0.4, 0.38, 0.3]),
    part('head', BOX, c, [0, 0.76, -0.52], [0.3, 0.28, 0.32]),
    part('snout', BOX, a, [0, 0.71, -0.71], [0.16, 0.15, 0.16]),
    part('earL', BOX, a, [-0.11, 0.92, -0.5], [0.07, 0.13, 0.04]),
    part('earR', BOX, a, [0.11, 0.92, -0.5], [0.07, 0.13, 0.04]),
    part('tail', BOX, a, [0, 0.62, 0.46], [0.07, 0.07, 0.34]),
    part('legFL', BOX, a, [-0.15, 0.24, -0.28], [0.1, 0.48, 0.1]),
    part('legFR', BOX, a, [0.15, 0.24, -0.28], [0.1, 0.48, 0.1]),
    part('legBL', BOX, a, [-0.15, 0.24, 0.3], [0.1, 0.48, 0.1]),
    part('legBR', BOX, a, [0.15, 0.24, 0.3], [0.1, 0.48, 0.1]),
  )

  const clips = [
    // Haunches down, front legs straight, slow tail sweep.
    new THREE.AnimationClip('sit', 3.0, [
      vec('body.position', [0, 3.0], [0, 0.44, 0.1, 0, 0.44, 0.1]),
      num('body.rotation[x]', [0, 3.0], [-0.3, -0.3]),
      num('legBL.position[y]', [0, 3.0], [0.14, 0.14]),
      num('legBR.position[y]', [0, 3.0], [0.14, 0.14]),
      num('tail.rotation[y]', [0, 0.75, 1.5, 2.25, 3.0], [0, 0.5, 0, -0.5, 0]),
      num('head.rotation[y]', [0, 1.5, 3.0], [-0.2, 0.25, -0.2]),
    ]),

    new THREE.AnimationClip('sniff', 2.0, [
      num('head.rotation[x]', [0, 0.5, 1.5, 2.0], [0.5, 0.75, 0.75, 0.5]),
      vec(
        'head.position',
        [0, 0.5, 1.5, 2.0],
        [0, 0.76, -0.52, 0, 0.42, -0.62, 0, 0.42, -0.62, 0, 0.76, -0.52],
      ),
      num('snout.position[y]', [0, 0.5, 1.5, 2.0], [0.71, 0.32, 0.32, 0.71]),
      num('tail.rotation[y]', [0, 0.5, 1.0, 1.5, 2.0], [0, 0.6, 0, -0.6, 0]),
    ]),

    new THREE.AnimationClip('trot', 0.9, [
      num('legFL.rotation[x]', [0, 0.225, 0.45, 0.675, 0.9], [0.5, 0, -0.5, 0, 0.5]),
      num('legBR.rotation[x]', [0, 0.225, 0.45, 0.675, 0.9], [0.5, 0, -0.5, 0, 0.5]),
      num('legFR.rotation[x]', [0, 0.225, 0.45, 0.675, 0.9], [-0.5, 0, 0.5, 0, -0.5]),
      num('legBL.rotation[x]', [0, 0.225, 0.45, 0.675, 0.9], [-0.5, 0, 0.5, 0, -0.5]),
      num('body.position[y]', [0, 0.225, 0.45, 0.675, 0.9], [0.52, 0.56, 0.52, 0.56, 0.52]),
      num('tail.rotation[y]', [0, 0.45, 0.9], [-0.3, 0.3, -0.3]),
    ]),

    // Head snaps up and back down. Peak window is the head fully raised.
    new THREE.AnimationClip('bark', 1.2, [
      num('head.rotation[x]', [0, 0.25, 0.5, 0.7, 1.2], [0, -0.55, -0.5, -0.55, 0]),
      num('snout.scale[y]', [0, 0.25, 0.5, 0.7, 1.2], [0.15, 0.24, 0.16, 0.24, 0.15]),
      num('body.position[y]', [0, 0.25, 0.6, 1.2], [0.52, 0.58, 0.52, 0.52]),
      num('tail.rotation[y]', [0, 0.3, 0.6, 0.9, 1.2], [0, 0.8, 0, -0.8, 0]),
    ]),

    // Cat-specific. Body flat to the ground, paws tucked.
    new THREE.AnimationClip('loaf', 3.6, [
      vec('body.position', [0, 3.6], [0, 0.3, 0, 0, 0.3, 0]),
      num('legFL.position[y]', [0, 3.6], [0.1, 0.1]),
      num('legFR.position[y]', [0, 3.6], [0.1, 0.1]),
      num('legBL.position[y]', [0, 3.6], [0.1, 0.1]),
      num('legBR.position[y]', [0, 3.6], [0.1, 0.1]),
      num('head.position[y]', [0, 3.6], [0.54, 0.54]),
      num('head.rotation[y]', [0, 1.8, 3.6], [-0.15, 0.15, -0.15]),
      num('tail.rotation[y]', [0, 1.2, 2.4, 3.6], [0.2, -0.2, 0.2, 0.2]),
    ]),

    new THREE.AnimationClip('prowl', 1.6, [
      num('body.position[y]', [0, 0.8, 1.6], [0.4, 0.43, 0.4]),
      num('legFL.rotation[x]', [0, 0.4, 0.8, 1.2, 1.6], [0.35, 0, -0.35, 0, 0.35]),
      num('legBR.rotation[x]', [0, 0.4, 0.8, 1.2, 1.6], [0.35, 0, -0.35, 0, 0.35]),
      num('legFR.rotation[x]', [0, 0.4, 0.8, 1.2, 1.6], [-0.35, 0, 0.35, 0, -0.35]),
      num('legBL.rotation[x]', [0, 0.4, 0.8, 1.2, 1.6], [-0.35, 0, 0.35, 0, -0.35]),
      num('head.position[y]', [0, 1.6], [0.62, 0.62]),
      num('tail.rotation[x]', [0, 0.8, 1.6], [-0.4, -0.6, -0.4]),
    ]),

    // Front end down, hindquarters up, full extension in the middle.
    new THREE.AnimationClip('stretch', 2.0, [
      num('body.rotation[x]', [0, 0.5, 1.0, 1.5, 2.0], [0, 0.4, 0.55, 0.4, 0]),
      vec(
        'body.position',
        [0, 0.5, 1.0, 1.5, 2.0],
        [0, 0.52, 0, 0, 0.46, -0.06, 0, 0.44, -0.1, 0, 0.46, -0.06, 0, 0.52, 0],
      ),
      num('legFL.position[z]', [0, 1.0, 2.0], [-0.28, -0.52, -0.28]),
      num('legFR.position[z]', [0, 1.0, 2.0], [-0.28, -0.52, -0.28]),
      num('legFL.rotation[x]', [0, 1.0, 2.0], [0, 0.7, 0]),
      num('legFR.rotation[x]', [0, 1.0, 2.0], [0, 0.7, 0]),
      num('tail.rotation[x]', [0, 1.0, 2.0], [0, -0.9, 0]),
      num('head.rotation[x]', [0, 1.0, 2.0], [0, 0.5, 0]),
    ]),
  ]

  return { group: g, clips, bounds: boundsOf(g) }
}

// ---------------------------------------------------------------------------
// Vehicle
// ---------------------------------------------------------------------------

/** A wheel on its axle: pivot rolls about X, cylinder laid on its side within. */
function wheelPivot(
  name: string,
  at: [number, number, number],
  scale: [number, number, number],
  color: number,
): THREE.Group {
  const mesh = new THREE.Mesh(CYL, mat(color))
  mesh.scale.set(...scale)
  mesh.rotation.z = Math.PI / 2
  mesh.castShadow = true
  return pivot(name, at, mesh, [0, 0, 0])
}

function buildVehicle(def: SubjectDef): BuiltModel {
  const { body: c, accent: a } = def.palette
  const g = new THREE.Group()
  const wheel: [number, number, number] = [0.34, 0.12, 0.34]
  g.add(
    part('body', BOX, c, [0, 0.6, 0], [1.8, 0.62, 4.2]),
    part('cabin', BOX, c, [0, 1.05, 0.15], [1.6, 0.56, 2.0]),
    part('glass', BOX, a, [0, 1.08, -0.9], [1.5, 0.42, 0.12]),
    part('sign', BOX, a, [0, 1.4, 0.1], [0.7, 0.18, 0.24]),
    // Wheels hang off pivots so they roll about X. The cylinder is laid on its
    // side *inside* the pivot, so the animated rotation never composes with the
    // orienting one — which is what made them spin like turntables.
    wheelPivot('wheelFL', [-0.92, 0.34, -1.3], wheel, a),
    wheelPivot('wheelFR', [0.92, 0.34, -1.3], wheel, a),
    wheelPivot('wheelBL', [-0.92, 0.34, 1.4], wheel, a),
    wheelPivot('wheelBR', [0.92, 0.34, 1.4], wheel, a),
  )

  // Rolling is rotation about X now that wheels hang off pivots.
  const spin = (path: string, dur: number) =>
    num(path, [0, dur / 2, dur], [0, -Math.PI, -Math.PI * 2])

  const clips = [
    new THREE.AnimationClip('parked', 4.0, [
      num('body.position[y]', [0, 2.0, 4.0], [0.6, 0.606, 0.6]),
    ]),

    new THREE.AnimationClip('cruise', 1.0, [
      spin('wheelFL.rotation[x]', 1.0),
      spin('wheelFR.rotation[x]', 1.0),
      spin('wheelBL.rotation[x]', 1.0),
      spin('wheelBR.rotation[x]', 1.0),
      num('body.position[y]', [0, 0.25, 0.5, 0.75, 1.0], [0.6, 0.615, 0.6, 0.615, 0.6]),
    ]),

    new THREE.AnimationClip('turn', 2.0, [
      spin('wheelBL.rotation[x]', 2.0),
      spin('wheelBR.rotation[x]', 2.0),
      num('wheelFL.rotation[y]', [0, 0.6, 1.4, 2.0], [0, 0.5, 0.5, 0]),
      num('wheelFR.rotation[y]', [0, 0.6, 1.4, 2.0], [0, 0.5, 0.5, 0]),
      num('body.rotation[z]', [0, 0.6, 1.4, 2.0], [0, 0.06, 0.06, 0]),
    ]),
  ]

  return { group: g, clips, bounds: boundsOf(g) }
}

// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Humanoid — tourists, residents, staff
// ---------------------------------------------------------------------------

/**
 * A person.
 *
 * Variation is the whole job here. Ten identical tourists read as wallpaper, so
 * every individual rolls its own skin, hair, top and bottom colours plus
 * accessories from its placement seed — deterministically, so the same person is
 * the same person on every load and a photo of them is reproducible.
 *
 * Colours come from the class's palettes rather than being generated freely: a
 * palette keeps the toon material cache small (materials are shared by colour)
 * and keeps the street looking art-directed rather than randomised.
 *
 * Striped tops are built as stacked bands of real geometry rather than a
 * texture, which costs nothing extra — the boxes are already there — and reads
 * at the distance people actually appear in a photo.
 */
function buildHumanoid(def: SubjectDef, seed: number): BuiltModel {
  const spec = def.human
  if (!spec) throw new Error(`Humanoid species "${def.species}" is missing its human spec`)

  const rng = makeRng(seed * 2654435761)
  const pickFrom = (list: number[]) => list[Math.floor(rng() * list.length)]!

  type Accessory = NonNullable<HumanSpec['accessories']>[number]
  const allowed = new Set<Accessory>(spec.accessories ?? [])
  /** Roll an accessory this class allows. Not every tourist wears the cap. */
  const has = (a: Accessory) => allowed.has(a) && rng() < 0.62

  const skin = pickFrom(spec.skin)
  const hairColor = pickFrom(spec.hair)
  const topColor = pickFrom(spec.top)
  const bottomColor = pickFrom(spec.bottom)
  const shoeColor = 0x241f1b

  const h = spec.height * (0.94 + rng() * 0.12)
  const build = spec.build * (0.92 + rng() * 0.18)

  const stripes = has('stripes')
  const coat = has('coat')
  const heels = has('heels')
  const bald = has('bald')

  /**
   * Proportions as fractions of total height.
   *
   * The previous version placed the head at 0.90h while the torso only reached
   * 0.75h, leaving a visible gap — a floating head. Anchoring every joint to a
   * shared table of real anatomical ratios makes that class of mistake
   * impossible: shoulders, neck and head can't drift apart because they're all
   * derived from the same number.
   *
   * Slightly stylised on purpose — a larger head and bigger shoes read better at
   * distance and sit closer to the reference art than strict realism does.
   */
  const HIP = 0.50
  const SHOULDER = 0.80
  const NECK_TOP = 0.855
  const HEAD_CENTRE = 0.925

  const hipY = h * HIP
  const shoulderY = h * SHOULDER
  const headY = h * HEAD_CENTRE
  const headH = h * 0.145
  const headW = h * 0.115 * (0.95 + build * 0.05)

  const shoulderHalf = h * 0.125 * build
  const waistHalf = h * 0.098 * build
  const bootLift = heels ? h * 0.03 : 0

  const g = new THREE.Group()

  /** A limb that swings from its joint. */
  const limb = (name: string, at: [number, number, number], size: [number, number, number], color: number) => {
    const mesh = new THREE.Mesh(BOX, mat(color))
    mesh.scale.set(...size)
    mesh.castShadow = true
    return pivot(name, at, mesh, [0, -size[1] / 2, 0])
  }

  // --- legs, from the hip ---
  const legLen = hipY - bootLift
  const legW = h * 0.062 * build
  const stance = h * 0.05 * build

  g.add(
    limb('legL', [-stance, hipY, 0], [legW, legLen, legW * 1.15], bottomColor),
    limb('legR', [stance, hipY, 0], [legW, legLen, legW * 1.15], bottomColor),
  )

  // Shoes ride inside the leg pivots so they swing with the foot. Deliberately
  // oversized — big feet anchor a stylised figure and read at distance.
  for (const side of ['L', 'R'] as const) {
    const shoe = new THREE.Mesh(BOX, mat(shoeColor))
    shoe.scale.set(legW * 1.35, h * 0.038, h * 0.105)
    shoe.position.set(0, -legLen + h * 0.019, -h * 0.022)
    shoe.name = `shoe${side}`
    shoe.castShadow = true
    ;(g.getObjectByName(`leg${side}`) as THREE.Group).add(shoe)
  }

  // --- torso: tapered, shoulders wider than waist ---
  const torsoH = shoulderY - hipY
  const torsoDepth = h * 0.075 * build

  /**
   * One segment of the torso: a square frustum from `halfBottom` to `halfTop`.
   *
   * Stripes are built as stacked segments of the same taper rather than boxes
   * laid over it. A straight box inside a tapered torso pokes its corners out at
   * the wide end and disappears at the narrow one, which reads as patches rather
   * than bands — the first version did exactly that.
   */
  const torsoSegment = (
    halfBottom: number,
    halfTop: number,
    height: number,
    y: number,
    color: number,
    name: string,
  ) => {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(halfTop / halfBottom, 1, 1, 4, 1),
      mat(color),
    )
    mesh.rotation.y = Math.PI / 4
    mesh.scale.set((halfBottom * 2) / Math.SQRT2, height, (torsoDepth * 2) / Math.SQRT2)
    mesh.position.y = y + height / 2
    mesh.name = name
    mesh.castShadow = true
    return mesh
  }

  const halfAt = (f: number) => waistHalf + (shoulderHalf - waistHalf) * f

  g.add(pivot('torso', [0, hipY, 0], torsoSegment(waistHalf, shoulderHalf, torsoH, 0, topColor, 'torsoShell'), [0, 0, 0]))
  const torsoGroup = g.getObjectByName('torso') as THREE.Group

  if (stripes) {
    // Replace the single shell with alternating bands that follow the taper.
    torsoGroup.remove(torsoGroup.children[0]!)
    const accent = pickFrom(spec.top)
    const bands = 5
    for (let i = 0; i < bands; i++) {
      const bandH = torsoH / bands
      const y = bandH * i
      torsoGroup.add(
        torsoSegment(
          halfAt(i / bands),
          halfAt((i + 1) / bands),
          bandH,
          y,
          i % 2 === 0 ? topColor : accent,
          `torsoBand${i}`,
        ),
      )
    }
  }

  g.add(part('hips', BOX, bottomColor, [0, hipY - h * 0.02, 0], [waistHalf * 2, h * 0.075, torsoDepth * 2]))

  if (coat) {
    // A coat flares below the waist, which changes the silhouette more than any
    // colour choice does.
    const skirt = new THREE.Mesh(BOX, mat(pickFrom(spec.bottom)))
    skirt.scale.set(shoulderHalf * 2.1, h * 0.2, torsoDepth * 2.3)
    skirt.position.y = hipY - h * 0.07
    skirt.name = 'coatSkirt'
    skirt.castShadow = true
    g.add(skirt)
  }

  // --- arms, from the shoulder ---
  const armLen = h * 0.36
  const armW = h * 0.045 * build
  const sleeveColor = coat ? pickFrom(spec.bottom) : topColor
  // Tucked slightly inside the shoulder rather than butted against it: a hair
  // of overlap hides the seam, where a hair of gap reads as a detached arm.
  const armX = shoulderHalf + armW * 0.35

  g.add(
    limb('armL', [-armX, shoulderY - h * 0.015, 0], [armW, armLen * 0.86, armW], sleeveColor),
    limb('armR', [armX, shoulderY - h * 0.015, 0], [armW, armLen * 0.86, armW], sleeveColor),
  )

  // Hands at the end of each arm, inside the pivot so they swing along.
  for (const side of ['L', 'R'] as const) {
    const hand = new THREE.Mesh(BOX, mat(skin))
    hand.scale.set(armW * 1.15, h * 0.05, armW * 1.15)
    hand.position.set(0, -armLen * 0.86 - h * 0.018, 0)
    hand.name = `hand${side}`
    ;(g.getObjectByName(`arm${side}`) as THREE.Group).add(hand)
  }

  // --- neck and head ---
  // The neck spans shoulder to head with no gap, by construction.
  const neckTop = h * NECK_TOP
  const neckH = neckTop - shoulderY + h * 0.01
  g.add(
    part('neck', CYL, skin, [0, shoulderY + neckH / 2 - h * 0.005, 0], [h * 0.032, neckH, h * 0.032]),
  )

  // The head carries a painted face from the atlas. This is where the reference
  // art puts its detail: a box with a face reads as a person, a box without one
  // reads as a box, and no amount of extra geometry closes that gap.
  const faceRow = spec.stoop ? OLD_FACE_ROW : FACE_ROW
  const faceCol = Math.floor(rng() * COLS)
  const head = new THREE.Mesh(facedBox(cellAt(faceCol, faceRow)), texMat(skin))
  head.name = 'head'
  head.position.set(0, headY, 0)
  head.scale.set(headW, headH, headW * 1.02)
  head.castShadow = true
  g.add(head)

  // Nose: tiny, but it tells you which way a figure is facing at 20 m, which
  // matters because facing is a scored variable.
  g.add(part('nose', BOX, skin, [0, headY - headH * 0.05, -headW * 0.56], [headW * 0.2, headH * 0.16, headW * 0.14]))

  if (!bald) {
    // Hair as a mass with a back, not a slab on top — most of a head's
    // silhouette is the hair.
    g.add(
      part('hair', BOX, hairColor, [0, headY + headH * 0.42, headW * 0.03], [headW * 1.08, headH * 0.4, headW * 1.1]),
      part('hairBack', BOX, hairColor, [0, headY + headH * 0.02, headW * 0.5], [headW * 1.02, headH * 0.72, headW * 0.22]),
    )
  }
  if (has('cap')) {
    const capColor = pickFrom(spec.top)
    g.add(
      // Seated down onto the skull so it doesn't hover.
      part('cap', BOX, capColor, [0, headY + headH * 0.44, 0], [headW * 1.1, headH * 0.3, headW * 1.1]),
      part('peak', BOX, capColor, [0, headY + headH * 0.36, -headW * 0.82], [headW * 0.94, headH * 0.1, headW * 0.6]),
    )
  }
  if (has('sunhat')) {
    const hatColor = pickFrom(spec.top)
    g.add(
      part('brim', CYL, hatColor, [0, headY + headH * 0.5, 0], [headW * 2.4, headH * 0.08, headW * 2.4]),
      part('crown', CYL, hatColor, [0, headY + headH * 0.72, 0], [headW * 1.15, headH * 0.4, headW * 1.15]),
    )
  }
  if (has('bag')) {
    g.add(
      part('bag', BOX, 0x3a3128, [armX + armW, hipY + h * 0.08, h * 0.05], [h * 0.075, h * 0.09, h * 0.045]),
      part('strap', BOX, 0x2a231c, [shoulderHalf * 0.5, shoulderY - h * 0.08, h * 0.02], [h * 0.012, h * 0.2, h * 0.012]),
    )
  }
  if (has('tote')) {
    g.add(
      part('tote', BOX, pickFrom(spec.top), [-(armX + armW), hipY + h * 0.02, h * 0.02], [h * 0.09, h * 0.11, h * 0.05]),
    )
  }

  if (spec.stoop) g.rotation.x = spec.stoop

  const armSwing = 0.55

  const clips = [
    new THREE.AnimationClip('idle', 3.4, [
      num('head.rotation[y]', [0, 1.1, 2.2, 3.4], [-0.25, 0.3, -0.1, -0.25]),
      num('torso.position[y]', [0, 1.7, 3.4], [hipY, hipY + h * 0.008, hipY]),
      num('armL.rotation[x]', [0, 1.7, 3.4], [0.04, -0.05, 0.04]),
      num('armR.rotation[x]', [0, 1.7, 3.4], [-0.04, 0.05, -0.04]),
    ]),

    new THREE.AnimationClip('walk', 1.05, [
      num('legL.rotation[x]', [0, 0.26, 0.52, 0.79, 1.05], [0.5, 0, -0.5, 0, 0.5]),
      num('legR.rotation[x]', [0, 0.26, 0.52, 0.79, 1.05], [-0.5, 0, 0.5, 0, -0.5]),
      num('armL.rotation[x]', [0, 0.26, 0.52, 0.79, 1.05], [-armSwing, 0, armSwing, 0, -armSwing]),
      num('armR.rotation[x]', [0, 0.26, 0.52, 0.79, 1.05], [armSwing, 0, -armSwing, 0, armSwing]),
      num('torso.rotation[y]', [0, 0.52, 1.05], [0.08, -0.08, 0.08]),
      num('head.rotation[y]', [0, 0.52, 1.05], [0.06, -0.06, 0.06]),
    ]),

    new THREE.AnimationClip('gawk', 2.6, [
      num('head.rotation[x]', [0, 0.7, 1.9, 2.6], [0, -0.62, -0.6, 0]),
      num('armL.rotation[x]', [0, 0.7, 1.9, 2.6], [0.04, -1.15, -1.2, 0.04]),
      num('armR.rotation[x]', [0, 0.7, 1.9, 2.6], [-0.04, -1.1, -1.15, -0.04]),
      num('torso.rotation[x]', [0, 0.7, 1.9, 2.6], [0, -0.14, -0.13, 0]),
    ]),

    new THREE.AnimationClip('talk', 2.2, [
      num('armR.rotation[x]', [0, 0.55, 1.1, 1.65, 2.2], [-0.1, -0.85, -0.4, -0.9, -0.1]),
      num('head.rotation[y]', [0, 1.1, 2.2], [0.42, 0.3, 0.42]),
      num('head.rotation[x]', [0, 0.55, 1.1, 1.65, 2.2], [0, -0.12, 0.05, -0.1, 0]),
    ]),

    new THREE.AnimationClip('rest', 4.0, [
      num('torso.rotation[z]', [0, 4.0], [0.13, 0.13]),
      num('legL.rotation[x]', [0, 4.0], [0.18, 0.18]),
      num('armL.rotation[x]', [0, 2.0, 4.0], [0.2, 0.1, 0.2]),
      num('head.rotation[y]', [0, 2.0, 4.0], [-0.35, -0.2, -0.35]),
    ]),
  ]

  return { group: g, clips, bounds: boundsOf(g) }
}

function boundsOf(g: THREE.Group): THREE.Box3 {
  const box = new THREE.Box3()
  box.setFromObject(g)
  return box
}

const BUILDERS: Record<
  SubjectDef['model'],
  (def: SubjectDef, seed: number) => BuiltModel
> = {
  bird: buildBird,
  quadruped: buildQuadruped,
  vehicle: buildVehicle,
  humanoid: buildHumanoid,
}

/**
 * Build a fresh model instance for a subject.
 *
 * Each call returns its own Group, because every subject animates independently
 * and so cannot share an Object3D. Geometry and materials *are* shared.
 */
export function buildModel(def: SubjectDef, seed = 0): BuiltModel {
  const built = BUILDERS[def.model](def, seed)
  built.group.scale.setScalar(def.scale)
  built.bounds.expandByScalar(0)
  return built
}

/** All materials/geometries created here, for a one-time warm compile. */
export function disposeModelCaches(): void {
  disposeToonMaterials()
  BOX.dispose()
  SPHERE.dispose()
  CONE.dispose()
  CYL.dispose()
}

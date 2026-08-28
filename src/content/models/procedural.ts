import * as THREE from 'three'

import type { HumanSpec, SubjectDef } from '@/content/subjects/types'
import { makeRng } from '@/lib/rng'
import { toonRamp } from '@/render/palette'
import { disposeToonMaterials, toonMaterial } from '@/render/toonPatch'

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
  const shoeColor = 0x2a2622

  // Per-person proportions, so a crowd has a range of heights and builds.
  const h = spec.height * (0.94 + rng() * 0.12)
  const build = spec.build * (0.92 + rng() * 0.18)

  const stripes = has('stripes')
  const coat = has('coat')
  const heels = has('heels')
  const bald = has('bald')

  const shoulder = 0.19 * build
  const hipY = h * 0.50
  const chestY = h * 0.68
  const headY = h * 0.90
  const legLen = hipY
  const bootLift = heels ? 0.05 : 0

  const g = new THREE.Group()

  // Legs and arms hang off pivots at hip and shoulder, so a swing rotates from
  // the joint. Rotating the mesh itself pivots about its centre, which makes a
  // limb detach from the body halfway through every stride.
  const limb = (name: string, at: [number, number, number], size: [number, number, number], color: number) => {
    const mesh = new THREE.Mesh(BOX, mat(color))
    mesh.scale.set(...size)
    mesh.castShadow = true
    return pivot(name, at, mesh, [0, -size[1] / 2, 0])
  }

  g.add(
    limb('legL', [-0.09 * build, legLen + bootLift, 0], [0.11 * build, legLen, 0.13 * build], bottomColor),
    limb('legR', [0.09 * build, legLen + bootLift, 0], [0.11 * build, legLen, 0.13 * build], bottomColor),
  )

  // Shoes ride inside the leg pivots so they swing with the foot.
  const shoeL = new THREE.Mesh(BOX, mat(shoeColor))
  shoeL.scale.set(0.12 * build, 0.07, 0.2)
  shoeL.position.set(0, -legLen + 0.035, -0.03)
  shoeL.name = 'shoeL'
  const shoeR = shoeL.clone()
  shoeR.name = 'shoeR'
  ;(g.getObjectByName('legL') as THREE.Group).add(shoeL)
  ;(g.getObjectByName('legR') as THREE.Group).add(shoeR)

  // Torso. Striped tops stack alternating bands; plain tops are one box.
  const torsoH = chestY - hipY + 0.14
  if (stripes) {
    const bands = 5
    const accent = pickFrom(spec.top)
    for (let i = 0; i < bands; i++) {
      const bandH = torsoH / bands
      g.add(
        part(
          i === 2 ? 'torso' : `torsoBand${i}`,
          BOX,
          i % 2 === 0 ? topColor : accent,
          [0, hipY + bandH * (i + 0.5) - 0.02, 0],
          [shoulder * 2, bandH, 0.19 * build],
        ),
      )
    }
  } else {
    g.add(
      part('torso', BOX, topColor, [0, (hipY + chestY) / 2 + 0.05, 0], [shoulder * 2, torsoH, 0.19 * build]),
    )
  }

  g.add(part('hips', BOX, bottomColor, [0, hipY - 0.03, 0], [shoulder * 1.85, 0.14, 0.18 * build]))

  if (coat) {
    g.add(
      part('coat', BOX, pickFrom(spec.bottom), [0, hipY + 0.02, 0], [shoulder * 2.25, torsoH * 0.95, 0.23 * build]),
    )
  }

  // Arms pivot at the shoulder for the same reason.
  const armLen = h * 0.34
  const sleeveColor = coat ? pickFrom(spec.bottom) : topColor
  g.add(
    limb('armL', [-(shoulder + 0.055), chestY + 0.06, 0], [0.085 * build, armLen, 0.1 * build], sleeveColor),
    limb('armR', [shoulder + 0.055, chestY + 0.06, 0], [0.085 * build, armLen, 0.1 * build], sleeveColor),
  )

  g.add(
    part('neck', CYL, skin, [0, chestY + 0.09, 0], [0.055, 0.08, 0.055]),
    part('head', BOX, skin, [0, headY, 0], [0.17, 0.21, 0.19]),
  )

  if (!bald) {
    g.add(part('hair', BOX, hairColor, [0, headY + 0.09, 0.012], [0.185, 0.07, 0.2]))
  }
  if (has('cap')) {
    g.add(
      part('cap', BOX, pickFrom(spec.top), [0, headY + 0.12, 0], [0.19, 0.055, 0.2]),
      part('peak', BOX, pickFrom(spec.top), [0, headY + 0.10, -0.16], [0.17, 0.03, 0.12]),
    )
  }
  if (has('sunhat')) {
    g.add(
      part('hat', CYL, pickFrom(spec.top), [0, headY + 0.13, 0], [0.4, 0.03, 0.4]),
      part('crown', CYL, pickFrom(spec.top), [0, headY + 0.17, 0], [0.19, 0.09, 0.19]),
    )
  }
  if (has('bag')) {
    g.add(part('bag', BOX, 0x3a3128, [shoulder + 0.05, hipY + 0.12, 0.09], [0.13, 0.16, 0.08]))
  }
  if (has('tote')) {
    g.add(part('tote', BOX, pickFrom(spec.top), [-(shoulder + 0.07), hipY + 0.06, 0.02], [0.16, 0.2, 0.09]))
  }

  // A stooped class leans the whole body forward from the feet.
  if (spec.stoop) g.rotation.x = spec.stoop

  const armSwing = 0.55
  const clips = [
    // Weight shift and a slow look around. The default state of a person
    // standing on a street.
    new THREE.AnimationClip('idle', 3.4, [
      num('head.rotation[y]', [0, 1.1, 2.2, 3.4], [-0.25, 0.3, -0.1, -0.25]),
      num('torso.position[y]', [0, 1.7, 3.4], [(hipY + chestY) / 2 + 0.05, (hipY + chestY) / 2 + 0.07, (hipY + chestY) / 2 + 0.05]),
      num('armL.rotation[x]', [0, 1.7, 3.4], [0.04, -0.05, 0.04]),
      num('armR.rotation[x]', [0, 1.7, 3.4], [-0.04, 0.05, -0.04]),
    ]),

    new THREE.AnimationClip('walk', 1.05, [
      num('legL.rotation[x]', [0, 0.26, 0.52, 0.79, 1.05], [0.5, 0, -0.5, 0, 0.5]),
      num('legR.rotation[x]', [0, 0.26, 0.52, 0.79, 1.05], [-0.5, 0, 0.5, 0, -0.5]),
      num('armL.rotation[x]', [0, 0.26, 0.52, 0.79, 1.05], [-armSwing, 0, armSwing, 0, -armSwing]),
      num('armR.rotation[x]', [0, 0.26, 0.52, 0.79, 1.05], [armSwing, 0, -armSwing, 0, armSwing]),
      num('head.rotation[y]', [0, 0.52, 1.05], [0.06, -0.06, 0.06]),
    ]),

    // Head back, arms up: the tourist looking at a building, and the highest
    // scoring pose most of these classes have.
    new THREE.AnimationClip('gawk', 2.6, [
      num('head.rotation[x]', [0, 0.7, 1.9, 2.6], [0, -0.62, -0.6, 0]),
      num('armL.rotation[x]', [0, 0.7, 1.9, 2.6], [0.04, -1.15, -1.2, 0.04]),
      num('armR.rotation[x]', [0, 0.7, 1.9, 2.6], [-0.04, -1.1, -1.15, -0.04]),
      num('torso.rotation[x]', [0, 0.7, 1.9, 2.6], [0, -0.14, -0.13, 0]),
    ]),

    // Talking: one hand gesturing, head turned to a companion.
    new THREE.AnimationClip('talk', 2.2, [
      num('armR.rotation[x]', [0, 0.55, 1.1, 1.65, 2.2], [-0.1, -0.85, -0.4, -0.9, -0.1]),
      num('head.rotation[y]', [0, 1.1, 2.2], [0.42, 0.3, 0.42]),
      num('head.rotation[x]', [0, 0.55, 1.1, 1.65, 2.2], [0, -0.12, 0.05, -0.1, 0]),
    ]),

    // Leaning on something, weight on one leg. Reads as waiting.
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

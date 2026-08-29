import * as THREE from 'three'

import {
  cellAt,
  characterAtlas,
  facedBox,
  facedFrustum,
  wrappedBox,
  COLS,
  FACE_ROW,
  LEG_ROW,
  OLD_FACE_ROW,
  SLEEVE_ROW,
  TORSO_BACK_ROW,
  TORSO_FRONT_ROW,
} from './characterAtlas'
import { outfitFor, OUTFIT_PALETTES } from './outfits'
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
  /**
   * Where the mesh sits inside the joint. Omit when the mesh has already
   * positioned itself.
   *
   * This was mandatory, and passing [0,0,0] for a mesh that had set its own
   * offset silently clobbered it — which dropped the torso half its own height,
   * leaving the chest sitting at the hip on every class that didn't take the
   * striped path.
   */
  meshOffset?: [number, number, number],
): THREE.Group {
  const g = new THREE.Group()
  g.name = name
  g.position.set(...at)
  if (meshOffset) mesh.position.set(...meshOffset)
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

  /**
   * Every part hangs off a `body` group rather than sitting beside it.
   *
   * Animating `body.position` used to move only the body mesh, leaving head,
   * wings, tail and legs behind — the take-off clip tore the bird apart. A group
   * at the origin, with the parts keeping their own local offsets inside it,
   * means body motion carries the whole animal while individual parts still
   * animate on their own.
   */
  const body = new THREE.Group()
  body.name = 'body'
  body.add(
    part('bodyShell', SPHERE, c, [0, 0.19, 0], [0.3, 0.26, 0.42]),
    part('head', SPHERE, c, [0, 0.33, -0.15], [0.17, 0.17, 0.17]),
    part('beak', CONE, a, [0, 0.32, -0.24], [0.05, 0.1, 0.05], [-Math.PI / 2, 0, 0]),
    part('wingL', BOX, a, [-0.13, 0.21, 0.01], [0.03, 0.11, 0.28]),
    part('wingR', BOX, a, [0.13, 0.21, 0.01], [0.03, 0.11, 0.28]),
    part('tail', BOX, a, [0, 0.21, 0.24], [0.12, 0.03, 0.18]),
    part('legL', CYL, a, [-0.05, 0.05, 0.02], [0.02, 0.11, 0.02]),
    part('legR', CYL, a, [0.05, 0.05, 0.02], [0.02, 0.11, 0.02]),
  )
  g.add(body)

  const clips = [
    new THREE.AnimationClip('idle', 2.4, [
      num('head.rotation[y]', [0, 0.8, 1.6, 2.4], [0, 0.35, -0.3, 0]),
      num('body.position[y]', [0, 1.2, 2.4], [0, 0.015, 0]),
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
      num('body.position[y]', [0, 0.4, 0.8, 1.2, 1.6], [0, 0.03, 0, 0.03, 0]),
      num('head.rotation[y]', [0, 0.4, 0.8, 1.2, 1.6], [0, 0.45, 0, -0.45, 0]),
      num('legL.position[z]', [0, 0.4, 0.8, 1.2, 1.6], [0.02, 0.1, 0.02, -0.06, 0.02]),
      num('legR.position[z]', [0, 0.4, 0.8, 1.2, 1.6], [0.02, -0.06, 0.02, 0.1, 0.02]),
    ]),

    // Wings sweep up, body lifts. Peak is the top of the wingbeat.
    new THREE.AnimationClip('flap', 0.8, [
      num('wingL.rotation[z]', [0, 0.2, 0.4, 0.6, 0.8], [0, -1.1, 0.3, -1.1, 0]),
      num('wingR.rotation[z]', [0, 0.2, 0.4, 0.6, 0.8], [0, 1.1, -0.3, 1.1, 0]),
      num('body.position[y]', [0, 0.3, 0.5, 0.8], [0, 0.23, 0.27, 0.05]),
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

  // As with the bird: a `body` group at the origin so sitting and loafing move
  // the whole animal, not just its torso.
  const body = new THREE.Group()
  body.name = 'body'
  /**
   * Proportions pushed toward the reference art: a head that is obviously a
   * head, big ears, chunky paws.
   *
   * The first version had a head the same colour as the body, the same width,
   * and flush against it — from the front the animal read as a single box with a
   * nose on it. An animal needs a neck gap and a head bigger than realism wants,
   * for the same reason the people do: at photo distance, silhouette is all
   * there is.
   */
  body.add(
    part('bodyShell', BOX, c, [0, 0.5, 0.06], [0.44, 0.42, 0.8]),
    part('chest', BOX, c, [0, 0.55, -0.34], [0.46, 0.44, 0.34]),
    // A short neck sets the head forward and clear of the shoulders.
    part('neck', BOX, c, [0, 0.66, -0.53], [0.24, 0.24, 0.16]),
    part('head', BOX, c, [0, 0.79, -0.67], [0.4, 0.36, 0.38]),
    // Muzzle kept low and small so it reads as a snout rather than a second
    // head, and so it leaves the brow clear for the eyes.
    part('snout', BOX, a, [0, 0.71, -0.89], [0.18, 0.14, 0.14]),
    part('nosePad', BOX, 0x2b2320, [0, 0.74, -0.96], [0.09, 0.07, 0.03]),
    // Eyes sit on the brow, proud of the head's front face. The first attempt
    // put them at the same depth as the muzzle, which buried them inside it —
    // invisible from every angle.
    part('eyeL', BOX, 0xf2efe8, [-0.1, 0.85, -0.865], [0.1, 0.09, 0.02]),
    part('eyeR', BOX, 0xf2efe8, [0.1, 0.85, -0.865], [0.1, 0.09, 0.02]),
    part('pupilL', BOX, 0x141317, [-0.1, 0.85, -0.876], [0.05, 0.07, 0.02]),
    part('pupilR', BOX, 0x141317, [0.1, 0.85, -0.876], [0.05, 0.07, 0.02]),
    // Ears: prominent, but a cat, not a rabbit.
    part('earL', BOX, a, [-0.13, 0.97, -0.63], [0.1, 0.15, 0.05]),
    part('earR', BOX, a, [0.13, 0.97, -0.63], [0.1, 0.15, 0.05]),
    part('tail', BOX, a, [0, 0.62, 0.44], [0.1, 0.1, 0.4]),
  )

  // Legs on hip pivots so they swing from the shoulder/haunch rather than about
  // their own middle — the same fix the humanoid limbs needed. A leg rotating
  // about its centre lifts its foot *and* its hip, which is why the trot looked
  // like the dog was treading water.
  const legMesh = () => {
    const m = new THREE.Mesh(BOX, mat(a))
    m.scale.set(0.15, 0.48, 0.15)
    m.castShadow = true
    return m
  }
  for (const [name, x, z] of [
    ['legFL', -0.16, -0.3],
    ['legFR', 0.16, -0.3],
    ['legBL', -0.16, 0.3],
    ['legBR', 0.16, 0.3],
  ] as const) {
    const joint = pivot(name, [x, 0.48, z], legMesh(), [0, -0.24, 0])
    // Chunky paws, inside the pivot so they swing with the leg.
    const paw = new THREE.Mesh(BOX, mat(a))
    paw.scale.set(0.19, 0.11, 0.24)
    paw.position.set(0, -0.44, -0.03)
    paw.name = `paw${name.slice(3)}`
    paw.castShadow = true
    joint.add(paw)
    body.add(joint)
  }

  g.add(body)

  const clips = [
    // Haunches down, front legs straight, slow tail sweep.
    // Rear down, front up, front legs braced vertical, back legs folded under.
    // Tilting the body alone rotates the legs with it and leaves them dangling.
    new THREE.AnimationClip('sit', 3.0, [
      vec('body.position', [0, 3.0], [0, -0.13, 0.05, 0, -0.13, 0.05]),
      num('body.rotation[x]', [0, 3.0], [0.3, 0.3]),
      num('legFL.rotation[x]', [0, 3.0], [-0.3, -0.3]),
      num('legFR.rotation[x]', [0, 3.0], [-0.3, -0.3]),
      num('legBL.rotation[x]', [0, 3.0], [-1.15, -1.15]),
      num('legBR.rotation[x]', [0, 3.0], [-1.15, -1.15]),
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
      num('body.position[y]', [0, 0.225, 0.45, 0.675, 0.9], [0, 0.04, 0, 0.04, 0]),
      num('tail.rotation[y]', [0, 0.45, 0.9], [-0.3, 0.3, -0.3]),
    ]),

    // Head snaps up and back down. Peak window is the head fully raised.
    new THREE.AnimationClip('bark', 1.2, [
      num('head.rotation[x]', [0, 0.25, 0.5, 0.7, 1.2], [0, -0.55, -0.5, -0.55, 0]),
      num('snout.scale[y]', [0, 0.25, 0.5, 0.7, 1.2], [0.15, 0.24, 0.16, 0.24, 0.15]),
      num('body.position[y]', [0, 0.25, 0.6, 1.2], [0, 0.06, 0, 0]),
      num('tail.rotation[y]', [0, 0.3, 0.6, 0.9, 1.2], [0, 0.8, 0, -0.8, 0]),
    ]),

    // Cat-specific. Body flat to the ground, paws tucked.
    new THREE.AnimationClip('loaf', 3.6, [
      vec('body.position', [0, 3.6], [0, -0.26, 0, 0, -0.26, 0]),
      num('legFL.rotation[x]', [0, 3.6], [-1.35, -1.35]),
      num('legFR.rotation[x]', [0, 3.6], [-1.35, -1.35]),
      num('legBL.rotation[x]', [0, 3.6], [1.35, 1.35]),
      num('legBR.rotation[x]', [0, 3.6], [1.35, 1.35]),
      num('head.position[y]', [0, 3.6], [0.62, 0.62]),
      num('head.rotation[y]', [0, 1.8, 3.6], [-0.15, 0.15, -0.15]),
      num('tail.rotation[y]', [0, 1.2, 2.4, 3.6], [0.2, -0.2, 0.2, 0.2]),
    ]),

    new THREE.AnimationClip('prowl', 1.6, [
      num('body.position[y]', [0, 0.8, 1.6], [-0.12, -0.09, -0.12]),
      num('legFL.rotation[x]', [0, 0.4, 0.8, 1.2, 1.6], [0.35, 0, -0.35, 0, 0.35]),
      num('legBR.rotation[x]', [0, 0.4, 0.8, 1.2, 1.6], [0.35, 0, -0.35, 0, 0.35]),
      num('legFR.rotation[x]', [0, 0.4, 0.8, 1.2, 1.6], [-0.35, 0, 0.35, 0, -0.35]),
      num('legBL.rotation[x]', [0, 0.4, 0.8, 1.2, 1.6], [-0.35, 0, 0.35, 0, -0.35]),
      num('head.position[y]', [0, 1.6], [0.68, 0.68]),
      num('tail.rotation[x]', [0, 0.8, 1.6], [-0.4, -0.6, -0.4]),
    ]),

    // Front end down, hindquarters up, full extension in the middle.
    new THREE.AnimationClip('stretch', 2.0, [
      num('body.rotation[x]', [0, 0.5, 1.0, 1.5, 2.0], [0, -0.4, -0.55, -0.4, 0]),
      vec(
        'body.position',
        [0, 0.5, 1.0, 1.5, 2.0],
        [0, 0, 0, 0, -0.06, -0.06, 0, -0.08, -0.1, 0, -0.06, -0.06, 0, 0, 0],
      ),
      num('legFL.rotation[x]', [0, 1.0, 2.0], [0, 0.85, 0]),
      num('legFR.rotation[x]', [0, 1.0, 2.0], [0, 0.85, 0]),
      num('legBL.rotation[x]', [0, 1.0, 2.0], [0, -0.3, 0]),
      num('legBR.rotation[x]', [0, 1.0, 2.0], [0, -0.3, 0]),
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
  const wheel: [number, number, number] = [0.34, 0.14, 0.34]
  g.add(
    // Body sits above the axle line so the wheels are visible rather than half
    // swallowed, and the cabin is inset from the body to break the slab.
    part('body', BOX, c, [0, 0.72, 0], [1.78, 0.58, 4.2]),
    part('hood', BOX, c, [0, 0.86, -1.42], [1.66, 0.3, 1.36]),
    part('boot', BOX, c, [0, 0.86, 1.5], [1.66, 0.3, 1.2]),
    part('cabin', BOX, c, [0, 1.16, 0.1], [1.52, 0.52, 1.9]),
    part('glass', BOX, a, [0, 1.18, -0.86], [1.42, 0.4, 0.1]),
    part('glassBack', BOX, a, [0, 1.18, 1.06], [1.42, 0.36, 0.1]),
    part('sign', BOX, a, [0, 1.48, 0.1], [0.66, 0.16, 0.22]),
    // Wheels hang off pivots so they roll about X. The cylinder is laid on its
    // side *inside* the pivot, so the animated rotation never composes with the
    // orienting one — which is what made them spin like turntables.
    wheelPivot('wheelFL', [-0.95, 0.34, -1.34], wheel, a),
    wheelPivot('wheelFR', [0.95, 0.34, -1.34], wheel, a),
    wheelPivot('wheelBL', [-0.95, 0.34, 1.42], wheel, a),
    wheelPivot('wheelBR', [0.95, 0.34, 1.42], wheel, a),
  )

  // Rolling is rotation about X now that wheels hang off pivots.
  const spin = (path: string, dur: number) =>
    num(path, [0, dur / 2, dur], [0, -Math.PI, -Math.PI * 2])

  const clips = [
    new THREE.AnimationClip('parked', 4.0, [
      num('body.position[y]', [0, 2.0, 4.0], [0.72, 0.726, 0.72]),
    ]),

    new THREE.AnimationClip('cruise', 1.0, [
      spin('wheelFL.rotation[x]', 1.0),
      spin('wheelFR.rotation[x]', 1.0),
      spin('wheelBL.rotation[x]', 1.0),
      spin('wheelBR.rotation[x]', 1.0),
      num('body.position[y]', [0, 0.25, 0.5, 0.75, 1.0], [0.72, 0.735, 0.72, 0.735, 0.72]),
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

  /**
   * A whole outfit, not a colour swap.
   *
   * The class chooses which looks are plausible for it — a doorman does not
   * wear a crop top — and the seed picks one. Colours then come from that
   * outfit's palette family rather than from the class, so a suit is never
   * sportswear-coloured.
   */
  const outfit = outfitFor(def.species, rng())
  const outfitPalette = OUTFIT_PALETTES[outfit.palette]

  const skin = pickFrom(spec.skin)
  const hairColor = pickFrom(spec.hair)
  const topColor = pickFrom(outfitPalette.top)
  const bottomColor = pickFrom(outfitPalette.bottom)
  const trimColor = pickFrom(outfitPalette.trim)
  const shoeColor = 0x241f1b

  const h = spec.height * (0.94 + rng() * 0.12)
  const build = spec.build * (0.92 + rng() * 0.18)

  const coat = outfit.longCoat === true
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
  // Jet Set Radio proportions: a head around a sixth of total height rather
  // than the realistic eighth, and hands and feet oversized to match. Realism
  // reads as generic at this polygon count; exaggeration is what gives a
  // low-poly figure a personality you can recognise across a street.
  const headH = h * 0.175
  const headW = h * 0.142 * (0.95 + build * 0.05)

  const shoulderHalf = h * 0.125 * build
  const waistHalf = h * 0.098 * build
  const bootLift = heels ? h * 0.03 : 0

  const g = new THREE.Group()

  /** A limb that swings from its joint. */
  // Trousers and sleeves get their own wrapped cells, so a pattern continues
  // around the limb instead of stopping at a seam.
  const legCol = outfit.legs
  const sleeveCol = outfit.sleeve

  const limb = (
    name: string,
    at: [number, number, number],
    size: [number, number, number],
    color: number,
    row?: number,
    col?: number,
  ) => {
    const mesh =
      row === undefined
        ? new THREE.Mesh(BOX, mat(color))
        : new THREE.Mesh(wrappedBox(cellAt(col ?? 0, row)), texMat(color))
    mesh.scale.set(...size)
    mesh.castShadow = true
    return pivot(name, at, mesh, [0, -size[1] / 2, 0])
  }

  // --- legs, from the hip ---
  const legLen = hipY - bootLift
  const legW = h * 0.072 * build
  // Wider than anatomy wants. Two legs the same colour close together read as
  // a single column, which is what the reference avoids by putting people in
  // baggy trousers with a visible gap between the legs.
  const stance = h * 0.075 * build

  g.add(
    limb('legL', [-stance, hipY, 0], [legW, legLen, legW * 1.15], bottomColor, LEG_ROW, legCol),
    limb('legR', [stance, hipY, 0], [legW, legLen, legW * 1.15], bottomColor, LEG_ROW, legCol),
  )

  // Shorts leave the shin bare: a real change of outline, not of colour.
  if (outfit.shorts) {
    for (const side of ['L', 'R'] as const) {
      const shin = new THREE.Mesh(BOX, mat(skin))
      shin.scale.set(legW * 0.86, legLen * 0.46, legW)
      shin.position.set(0, -legLen * 0.74, 0)
      shin.name = `shin${side}`
      shin.castShadow = true
      ;(g.getObjectByName(`leg${side}`) as THREE.Group).add(shin)
    }
  }

  // Shoes ride inside the leg pivots so they swing with the foot. Deliberately
  // oversized — big feet anchor a stylised figure and read at distance.
  for (const side of ['L', 'R'] as const) {
    const shoe = new THREE.Mesh(BOX, mat(shoeColor))
    // Big shoes. They anchor a stylised figure and read from a long way off.
    shoe.scale.set(legW * 1.75, h * 0.05, h * 0.135)
    shoe.position.set(0, -legLen + h * 0.025, -h * 0.03)
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
  const garmentCol = outfit.top

  const torsoSegment = (
    halfBottom: number,
    halfTop: number,
    height: number,
    y: number,
    color: number,
    name: string,
  ) => {
    // Garment detail — placket, lapels, zip, seams — comes from the atlas, with
    // the material colour showing through the white base underneath.
    const mesh = new THREE.Mesh(
      facedFrustum(
        halfTop / halfBottom,
        cellAt(garmentCol, TORSO_FRONT_ROW),
        cellAt(garmentCol, TORSO_BACK_ROW),
      ),
      texMat(color),
    )
    mesh.rotation.y = Math.PI / 4
    mesh.scale.set((halfBottom * 2) / Math.SQRT2, height, (torsoDepth * 2) / Math.SQRT2)
    mesh.position.y = y + height / 2
    mesh.name = name
    mesh.castShadow = true
    return mesh
  }

  /**
   * Heights inside the torso pivot, which sits at the hip.
   *
   * Declared here rather than beside the arms because the torso block now needs
   * it too — hoods attach at shoulder height.
   */
  const rel = (absoluteY: number) => absoluteY - hipY

  // No offset argument: torsoSegment already places the shell so it spans hip
  // to shoulder.
  // Held by reference: `pivot` renames the mesh it wraps to `<joint>_mesh`, so
  // looking this up by the name given in torsoSegment finds nothing.
  const torsoShell = torsoSegment(waistHalf, shoulderHalf, torsoH, 0, topColor, 'torsoShell')
  g.add(pivot('torso', [0, hipY, 0], torsoShell))
  const torsoGroup = g.getObjectByName('torso') as THREE.Group

  if (outfit.cropped) {
    // A cropped top: the shell starts above the waist, so a skin band below it
    // reads as a bare midriff. Changing where clothing *ends* is a stronger
    // variation than changing what colour it is.
    torsoShell.scale.y = torsoH * 0.66
    torsoShell.position.y = torsoH * 0.67

    const midriff = new THREE.Mesh(BOX, mat(skin))
    midriff.scale.set(waistHalf * 1.95, torsoH * 0.34, torsoDepth * 1.95)
    midriff.position.y = torsoH * 0.17
    midriff.name = 'midriff'
    midriff.castShadow = true
    torsoGroup.add(midriff)
  }

  if (outfit.hood) {
    // A hood bunched behind the neck. Distinctive from every angle, which a
    // printed graphic on the chest is not.
    const hood = new THREE.Mesh(SPHERE, mat(trimColor))
    hood.scale.set(shoulderHalf * 1.5, h * 0.09, torsoDepth * 1.7)
    hood.position.set(0, rel(shoulderY) - h * 0.01, torsoDepth * 1.1)
    hood.name = 'hood'
    hood.castShadow = true
    torsoGroup.add(hood)
  }


  g.add(part('hips', BOX, bottomColor, [0, hipY - h * 0.02, 0], [waistHalf * 2, h * 0.075, torsoDepth * 2]))

  if (outfit.skirt) {
    // A skirt block: flares below the hip and hides the tops of the legs.
    const skirt = new THREE.Mesh(
      new THREE.CylinderGeometry(1, waistHalf * 1.9 / (waistHalf * 1.05), 1, 8, 1),
      mat(bottomColor),
    )
    skirt.scale.set(waistHalf * 1.05 * 2, h * 0.22, waistHalf * 1.05 * 2)
    skirt.position.y = hipY - h * 0.09
    skirt.name = 'skirt'
    skirt.castShadow = true
    g.add(skirt)
  }

  if (coat) {
    // A coat falling to mid-thigh, which changes the silhouette more than any
    // colour choice does.
    const skirtPanel = new THREE.Mesh(BOX, mat(topColor))
    skirtPanel.scale.set(shoulderHalf * 2.15, h * 0.26, torsoDepth * 2.4)
    skirtPanel.position.y = hipY - h * 0.1
    skirtPanel.name = 'coatSkirt'
    skirtPanel.castShadow = true
    g.add(skirtPanel)
  }

  // Everything above the waist parents to the torso: `rest` leans it sideways
  // and `gawk` tips it back, and arms and head have to travel with it.
  //
  // --- arms, from the shoulder ---
  const armLen = h * 0.36
  const armW = h * 0.045 * build
  // Bare arms are skin, and skip the sleeve texture entirely.
  const sleeveColor = outfit.bareArms ? skin : coat ? trimColor : topColor
  // Tucked slightly inside the shoulder rather than butted against it: a hair
  // of overlap hides the seam, where a hair of gap reads as a detached arm.
  const armX = shoulderHalf + armW * 0.35

  torsoGroup.add(
    limb('armL', [-armX, rel(shoulderY) - h * 0.015, 0], [armW, armLen * 0.86, armW], sleeveColor,
      outfit.bareArms ? undefined : SLEEVE_ROW, sleeveCol),
    limb('armR', [armX, rel(shoulderY) - h * 0.015, 0], [armW, armLen * 0.86, armW], sleeveColor,
      outfit.bareArms ? undefined : SLEEVE_ROW, sleeveCol),
  )

  // Hands at the end of each arm, inside the pivot so they swing along.
  for (const side of ['L', 'R'] as const) {
    const hand = new THREE.Mesh(BOX, mat(skin))
    hand.scale.set(armW * 1.6, h * 0.062, armW * 1.5)
    hand.position.set(0, -armLen * 0.86 - h * 0.022, 0)
    hand.name = `hand${side}`
    hand.castShadow = true
    ;(torsoGroup.getObjectByName(`arm${side}`) as THREE.Group).add(hand)
  }

  // --- neck and head ---
  // The neck spans shoulder to head with no gap, by construction.
  // A thicker, taller neck than anatomy strictly wants. The head is a box, and
  // a box rotating about the neck joint sweeps a wedge open above the collar —
  // so the neck has to be substantial enough to fill it when someone looks up.
  const neckTop = h * NECK_TOP
  const neckH = neckTop - shoulderY + h * 0.035
  torsoGroup.add(
    part('neck', CYL, skin, [0, rel(shoulderY) + neckH / 2 - h * 0.02, 0], [h * 0.046, neckH, h * 0.046]),
  )

  // The head carries a painted face from the atlas. This is where the reference
  // art puts its detail: a box with a face reads as a person, a box without one
  // reads as a box, and no amount of extra geometry closes that gap.
  const faceRow = spec.stoop ? OLD_FACE_ROW : FACE_ROW
  const faceCol = Math.floor(rng() * COLS)
  /**
   * The head hangs off a pivot at the top of the neck.
   *
   * Rotating the head mesh directly turns it about its own centre, which swings
   * the chin forward and opens a gap above the collar every time someone looks
   * up — and looking up is the tourist's highest-scoring pose. A neck joint is
   * where a head actually rotates.
   */
  const headMesh = new THREE.Mesh(facedBox(cellAt(faceCol, faceRow)), texMat(skin))
  headMesh.name = 'headMesh'
  headMesh.scale.set(headW, headH, headW * 1.02)
  headMesh.castShadow = true

  // Pivot sits a little below the neck's top and the head overlaps down onto
  // it, so a tipped head rotates *into* the neck rather than away from it.
  const headPivotY = neckTop - h * 0.02
  const head = pivot('head', [0, rel(headPivotY), 0], headMesh, [0, headY - headPivotY - h * 0.012, 0])
  torsoGroup.add(head)

  /**
   * Head furniture parents to the head mesh, in its local units.
   *
   * These were left on the root while the cap was parented, so a head that
   * tipped back took its cap along and left its hair floating in place. Anything
   * attached to a head has to be a child of it — asserted in the tests now,
   * because "did I actually reparent that one" is not something to eyeball.
   */
  headMesh.add(
    // Nose: tiny, but it tells you which way a figure is facing at 20 m, and
    // facing is a scored variable.
    part('nose', BOX, skin, [0, -0.05, -0.549], [0.2, 0.16, 0.137]),
  )

  if (!bald) {
    /**
     * Hair silhouettes, picked per person.
     *
     * The single biggest lever on whether a crowd reads as individuals. Jet Set
     * Radio characters are recognisable at a distance almost entirely by their
     * hair shape, not their face — so this is where the variety belongs.
     */
    const style = Math.floor(rng() * 4)

    headMesh.add(part('hair', BOX, hairColor, [0, 0.44, 0.029], [1.1, 0.36, 1.09]))

    if (style === 0) {
      // Cropped: a close cap with a short back.
      headMesh.add(part('hairBack', BOX, hairColor, [0, 0.06, 0.5], [1.04, 0.62, 0.2]))
    } else if (style === 1) {
      // Bob: falls past the jaw, squared off.
      headMesh.add(
        part('hairBack', BOX, hairColor, [0, -0.18, 0.42], [1.12, 1.1, 0.36]),
        part('hairSideL', BOX, hairColor, [-0.55, -0.12, 0.1], [0.22, 0.95, 0.95]),
        part('hairSideR', BOX, hairColor, [0.55, -0.12, 0.1], [0.22, 0.95, 0.95]),
      )
    } else if (style === 2) {
      // Spikes: the most Jet Set Radio thing available, and unmistakable in
      // silhouette from any angle.
      headMesh.add(part('hairBack', BOX, hairColor, [0, 0.06, 0.5], [1.04, 0.6, 0.2]))
      for (let i = 0; i < 5; i++) {
        const a = (i / 4 - 0.5) * 1.5
        headMesh.add(
          part(`spike${i}`, CONE, hairColor,
            [Math.sin(a) * 0.42, 0.66 + Math.cos(a) * 0.1, -0.18 + Math.cos(a) * 0.12],
            [0.3, 0.55, 0.3], [(-a) * 0.5, 0, a * 0.9]),
        )
      }
    } else {
      // Volume: a tall rounded mass.
      headMesh.add(
        part('hairBack', BOX, hairColor, [0, 0.1, 0.46], [1.12, 0.9, 0.32]),
        part('hairTop', SPHERE, hairColor, [0, 0.52, 0.06], [1.32, 0.9, 1.3]),
      )
    }
  }
  if (has('cap')) {
    const capColor = pickFrom(spec.top)
    headMesh.add(
      // Seated down onto the skull so it doesn't hover.
      part('cap', BOX, capColor, [0, 0.44, 0], [1.1, 0.3, 1.1]),
      part('peak', BOX, capColor, [0, 0.36, -0.82], [0.94, 0.1, 0.6]),
    )
  }
  if (has('sunhat')) {
    const hatColor = pickFrom(spec.top)
    headMesh.add(
      part('brim', CYL, hatColor, [0, 0.5, 0], [2.4, 0.08, 2.4]),
      part('crown', CYL, hatColor, [0, 0.72, 0], [1.15, 0.4, 1.15]),
    )
  }
  if (has('bag')) {
    torsoGroup.add(
      part('bag', BOX, 0x3a3128, [armX + armW, h * 0.08, h * 0.05], [h * 0.075, h * 0.09, h * 0.045]),
      part('strap', BOX, 0x2a231c, [shoulderHalf * 0.5, rel(shoulderY) - h * 0.08, h * 0.02], [h * 0.012, h * 0.2, h * 0.012]),
    )
  }
  if (has('tote')) {
    torsoGroup.add(
      part('tote', BOX, pickFrom(spec.top), [-(armX + armW), h * 0.02, h * 0.02], [h * 0.09, h * 0.11, h * 0.05]),
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
      num('head.rotation[x]', [0, 0.7, 1.9, 2.6], [0, -0.44, -0.42, 0]),
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

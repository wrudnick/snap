import * as THREE from 'three'

import type { SubjectDef } from '@/content/subjects/types'
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

function buildVehicle(def: SubjectDef): BuiltModel {
  const { body: c, accent: a } = def.palette
  const g = new THREE.Group()
  const wheel: [number, number, number] = [0.34, 0.12, 0.34]
  g.add(
    part('body', BOX, c, [0, 0.6, 0], [1.8, 0.62, 4.2]),
    part('cabin', BOX, c, [0, 1.05, 0.15], [1.6, 0.56, 2.0]),
    part('glass', BOX, a, [0, 1.08, -0.9], [1.5, 0.42, 0.12]),
    part('sign', BOX, a, [0, 1.4, 0.1], [0.7, 0.18, 0.24]),
    part('wheelFL', CYL, a, [-0.92, 0.34, -1.3], wheel, [0, 0, Math.PI / 2]),
    part('wheelFR', CYL, a, [0.92, 0.34, -1.3], wheel, [0, 0, Math.PI / 2]),
    part('wheelBL', CYL, a, [-0.92, 0.34, 1.4], wheel, [0, 0, Math.PI / 2]),
    part('wheelBR', CYL, a, [0.92, 0.34, 1.4], wheel, [0, 0, Math.PI / 2]),
  )

  const spin = (path: string, dur: number) =>
    num(path, [0, dur / 2, dur], [0, -Math.PI, -Math.PI * 2])

  const clips = [
    new THREE.AnimationClip('parked', 4.0, [
      num('body.position[y]', [0, 2.0, 4.0], [0.6, 0.606, 0.6]),
    ]),

    new THREE.AnimationClip('cruise', 1.0, [
      spin('wheelFL.rotation[y]', 1.0),
      spin('wheelFR.rotation[y]', 1.0),
      spin('wheelBL.rotation[y]', 1.0),
      spin('wheelBR.rotation[y]', 1.0),
      num('body.position[y]', [0, 0.25, 0.5, 0.75, 1.0], [0.6, 0.615, 0.6, 0.615, 0.6]),
    ]),

    new THREE.AnimationClip('turn', 2.0, [
      spin('wheelBL.rotation[y]', 2.0),
      spin('wheelBR.rotation[y]', 2.0),
      num('wheelFL.rotation[x]', [0, 0.6, 1.4, 2.0], [0, 0.5, 0.5, 0]),
      num('wheelFR.rotation[x]', [0, 0.6, 1.4, 2.0], [0, 0.5, 0.5, 0]),
      num('body.rotation[z]', [0, 0.6, 1.4, 2.0], [0, 0.06, 0.06, 0]),
    ]),
  ]

  return { group: g, clips, bounds: boundsOf(g) }
}

// ---------------------------------------------------------------------------

function boundsOf(g: THREE.Group): THREE.Box3 {
  const box = new THREE.Box3()
  box.setFromObject(g)
  return box
}

const BUILDERS = {
  bird: buildBird,
  quadruped: buildQuadruped,
  vehicle: buildVehicle,
} as const

/**
 * Build a fresh model instance for a subject.
 *
 * Each call returns its own Group, because every subject animates independently
 * and so cannot share an Object3D. Geometry and materials *are* shared.
 */
export function buildModel(def: SubjectDef): BuiltModel {
  const built = BUILDERS[def.model](def)
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

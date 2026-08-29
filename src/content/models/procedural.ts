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
import { applyPartOverrides } from './partOverrides'
import type { HumanSpec, SubjectDef } from '@/content/subjects/types'
import { makeRng, pick } from '@/lib/rng'
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
/**
 * A box with its edges cut off.
 *
 * Every part in this file was a hard 90-degree box, which is why everything
 * read as a crate: a right-angled edge catches the rim light in a single hard
 * line and the ink pass draws it at full strength, so a person came out looking
 * like stacked packing cases. A chamfer gives each edge a narrow third face
 * that takes the light at its own angle, and softens the silhouette without
 * making anything round — which is the register the reference art works in too.
 *
 * 44 triangles instead of 12. Irrelevant: the budget in this game is draw
 * calls, not triangles, and this adds none — every part still shares the one
 * cached geometry.
 *
 * Winding is fixed after the fact rather than reasoned about per face. For a
 * convex solid centred on the origin, a triangle faces outward exactly when its
 * normal agrees with its own centroid, so the faces can be emitted in whatever
 * order reads clearly and corrected in one pass. Getting 44 windings right by
 * hand is a much worse use of care than checking them.
 */
function chamferedBox(bevel: number): THREE.BufferGeometry {
  const inner = 0.5 - bevel
  const AXES = [0, 1, 2] as const

  /** A corner, pushed out to the full half-extent along one axis only. */
  const point = (signs: readonly [number, number, number], axis: number): [number, number, number] => {
    const p: [number, number, number] = [signs[0] * inner, signs[1] * inner, signs[2] * inner]
    p[axis] = (signs[axis] ?? 0) * 0.5
    return p
  }

  type Vec = [number, number, number]
  type Tri = [Vec, Vec, Vec]
  const tris: Tri[] = []
  const quad = (a: Vec, b: Vec, c: Vec, d: Vec) => {
    tris.push([a, b, c], [a, c, d])
  }

  const CORNERS: Array<readonly [number, number, number]> = []
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) CORNERS.push([x, y, z])

  // Six faces, inset by the bevel.
  for (const axis of AXES) {
    const [b, c] = AXES.filter((v) => v !== axis) as [number, number]
    for (const sign of [-1, 1]) {
      const corner = (sb: number, sc: number) => {
        const signs: [number, number, number] = [0, 0, 0]
        signs[axis] = sign
        signs[b] = sb
        signs[c] = sc
        return point(signs, axis)
      }
      quad(corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1))
    }
  }

  // Twelve edge strips, one between each pair of faces.
  for (const a of AXES) {
    for (const b of AXES) {
      if (b <= a) continue
      const c = AXES.find((v) => v !== a && v !== b)!
      for (const sa of [-1, 1]) {
        for (const sb of [-1, 1]) {
          const at = (sc: number, axis: number) => {
            const signs: [number, number, number] = [0, 0, 0]
            signs[a] = sa
            signs[b] = sb
            signs[c] = sc
            return point(signs, axis)
          }
          quad(at(-1, a), at(1, a), at(1, b), at(-1, b))
        }
      }
    }
  }

  // Eight corner triangles.
  for (const signs of CORNERS) {
    tris.push([point(signs, 0), point(signs, 1), point(signs, 2)])
  }

  const positions: number[] = []
  for (const tri of tris) {
    const [a, b, c] = tri
    // Outward for a convex solid about the origin: the face normal agrees with
    // the centroid it sits on.
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2]
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2]
    const nx = uy * vz - uz * vy
    const ny = uz * vx - ux * vz
    const nz = ux * vy - uy * vx
    const cx = (a[0] + b[0] + c[0]) / 3
    const cy = (a[1] + b[1] + c[1]) / 3
    const cz = (a[2] + b[2] + c[2]) / 3
    const ordered: Vec[] = nx * cx + ny * cy + nz * cz >= 0 ? [a, b, c] : [a, c, b]
    for (const v of ordered) positions.push(v[0], v[1], v[2])
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  return geometry
}

/**
 * The shared primitives.
 *
 * One cached instance each, so a thousand parts across the street are a
 * thousand transforms over four geometries. Segment counts are up from the
 * original 8-12: a sphere at 8 rings is visibly faceted at the size a head
 * appears in a photograph, and the extra triangles cost nothing that matters.
 */
const BOX = chamferedBox(0.07)
const SPHERE = new THREE.SphereGeometry(0.5, 16, 12)
const CONE = new THREE.ConeGeometry(0.5, 1, 12)
const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 16)
/**
 * A tyre.
 *
 * Unit outer radius 0.5, so it scales like every other shared geometry here. A
 * solid cylinder cannot be a bicycle wheel: anything drawn inside it — rim,
 * hub, spokes — is buried behind the cylinder's own end cap, which is why the
 * first spoked wheel came out as a plain black disc with a grey dot. The hole
 * has to be in the geometry.
 *
 * Lies in the XY plane; rotate it like any other wheel part.
 */
const TORUS = new THREE.TorusGeometry(0.44, 0.06, 6, 18)

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

/**
 * A lighter or darker version of a colour, for hems, shadow lines and the
 * secondary bands that keep a single-coloured model from reading as one blob.
 *
 * Channels are clamped, so a factor above 1 brightens without wrapping.
 */
function shadeOf(color: number, factor: number): number {
  const ch = (shift: number) =>
    Math.min(255, Math.round(((color >> shift) & 0xff) * factor))
  return (ch(16) << 16) | (ch(8) << 8) | ch(0)
}

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
    /**
     * Folded wings, as ellipsoids hugging the body.
     *
     * These were flat pale boxes in the accent colour, which read as two plates
     * bolted to the sides of the bird. A folded wing is barely distinguishable
     * from the body except for its trailing edge and its bars — so it takes the
     * body colour, curves with the body, and lets the markings do the work.
     */
    part('wingL', SPHERE, shadeOf(c, 0.92), [-0.125, 0.2, 0.02], [0.075, 0.17, 0.36], [0, 0.12, 0.1]),
    part('wingR', SPHERE, shadeOf(c, 0.92), [0.125, 0.2, 0.02], [0.075, 0.17, 0.36], [0, -0.12, -0.1]),
    // Primaries crossing over the tail, the way a settled pigeon holds them.
    part('primaryL', BOX, shadeOf(c, 0.7), [-0.06, 0.17, 0.23], [0.05, 0.03, 0.2], [0, -0.16, 0]),
    part('primaryR', BOX, shadeOf(c, 0.7), [0.06, 0.17, 0.23], [0.05, 0.03, 0.2], [0, 0.16, 0]),
    part('tail', BOX, shadeOf(c, 0.85), [0, 0.2, 0.26], [0.13, 0.028, 0.2]),
    part('legL', CYL, a, [-0.05, 0.05, 0.02], [0.02, 0.11, 0.02]),
    part('legR', CYL, a, [0.05, 0.05, 0.02], [0.02, 0.11, 0.02]),
  )

  /**
   * Detail pass.
   *
   * A pigeon at photograph distance is a grey blob unless something breaks it
   * up. The three things that actually read are the eye, the green neck ring,
   * and the two dark bars across the folded wing — so those are what get built,
   * rather than a uniform increase in polygon count everywhere.
   */
  const eye = 0x1a1613
  const ring = 0x3f7a63
  body.add(
    part('eyeL', SPHERE, eye, [-0.075, 0.355, -0.185], [0.035, 0.035, 0.03]),
    part('eyeR', SPHERE, eye, [0.075, 0.355, -0.185], [0.035, 0.035, 0.03]),
    // Iridescent throat. Sat as a collar between head and body, where the two
    // spheres meet, so it also hides that seam.
    part('collar', SPHERE, ring, [0, 0.285, -0.105], [0.185, 0.13, 0.2]),
    part('breast', SPHERE, shadeOf(c, 1.14), [0, 0.235, -0.115], [0.235, 0.17, 0.2]),
    // Wing bars: the two dark stripes across a folded pigeon wing. They run
    // across the wing, not along it — as blocks stacked lengthways they read as
    // a pair of slots cut in the bird's side.
    part('barL0', BOX, shadeOf(c, 0.6), [-0.128, 0.205, 0.06], [0.045, 0.115, 0.028]),
    part('barL1', BOX, shadeOf(c, 0.6), [-0.122, 0.2, 0.14], [0.045, 0.095, 0.028]),
    part('barR0', BOX, shadeOf(c, 0.6), [0.128, 0.205, 0.06], [0.045, 0.115, 0.028]),
    part('barR1', BOX, shadeOf(c, 0.6), [0.122, 0.2, 0.14], [0.045, 0.095, 0.028]),
    // Tail feathers splayed rather than one slab, with a dark terminal band.
    part('tailBand', BOX, shadeOf(c, 0.45), [0, 0.2, 0.345], [0.125, 0.03, 0.05]),
    part('rump', SPHERE, c, [0, 0.225, 0.185], [0.19, 0.15, 0.16]),
  )
  // Toes. Three forward, one back, per foot — tiny, but they stop the legs
  // ending in a hard cylinder cap on the pavement.
  for (const [side, x] of [['L', -0.05], ['R', 0.05]] as const) {
    for (let i = 0; i < 3; i++) {
      body.add(
        part(`toe${side}${i}`, BOX, a, [x + (i - 1) * 0.018, 0.008, -0.018], [0.012, 0.012, 0.045]),
      )
    }
    body.add(part(`spur${side}`, BOX, a, [x, 0.008, 0.026], [0.012, 0.012, 0.03]))
  }
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

  /**
   * Detail pass.
   *
   * The animal was a chain of boxes of one width, so from the side it had no
   * waist and no shoulder. Haunch and shoulder masses proud of the body give it
   * an actual profile; the markings break up the flat flank.
   */
  body.add(
    part('shoulderL', BOX, c, [-0.235, 0.56, -0.24], [0.09, 0.3, 0.28]),
    part('shoulderR', BOX, c, [0.235, 0.56, -0.24], [0.09, 0.3, 0.28]),
    part('haunchL', BOX, c, [-0.235, 0.5, 0.3], [0.11, 0.34, 0.34]),
    part('haunchR', BOX, c, [0.235, 0.5, 0.3], [0.11, 0.34, 0.34]),
    // Belly in a lighter tone, the way most animals are pale underneath.
    part('belly', BOX, shadeOf(c, 1.25), [0, 0.32, 0.02], [0.36, 0.1, 0.72]),
    part('bib', BOX, shadeOf(c, 1.25), [0, 0.44, -0.48], [0.22, 0.2, 0.08]),
    // Ear interiors, a shade in from the edge so a rim of ear remains.
    part('earInL', BOX, shadeOf(a, 0.68), [-0.13, 0.96, -0.655], [0.055, 0.1, 0.03]),
    part('earInR', BOX, shadeOf(a, 0.68), [0.13, 0.96, -0.655], [0.055, 0.1, 0.03]),
    part('brow', BOX, shadeOf(c, 0.82), [0, 0.94, -0.79], [0.34, 0.06, 0.14]),
    part('tailTip', BOX, shadeOf(a, 1.3), [0, 0.62, 0.62], [0.095, 0.095, 0.1]),
    // Collar. Reads as a pet rather than a stray, and adds the one saturated
    // note on an otherwise single-hue animal.
    part('collar', BOX, 0x9c3a2e, [0, 0.66, -0.53], [0.27, 0.09, 0.19]),
    part('tag', BOX, 0xd8b24a, [0, 0.575, -0.6], [0.05, 0.06, 0.02]),
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
    /**
     * Gone.
     *
     * A rat is under the kerb most of the time, and the cheapest honest way to
     * say so is to put it there: the body drops below the floor and everything
     * flattens with it, so the animal is genuinely not in the picture rather
     * than being hidden by some visibility flag the scoring would have to know
     * about. It scores as a very small, very low subject, which is correct —
     * you cannot photograph a rat that is under a kerb.
     */
    new THREE.AnimationClip('hidden', 3.0, [
      vec('body.position', [0, 3.0], [0, -1.05, 0, 0, -1.05, 0]),
      num('legFL.rotation[x]', [0, 3.0], [-1.4, -1.4]),
      num('legFR.rotation[x]', [0, 3.0], [-1.4, -1.4]),
      num('legBL.rotation[x]', [0, 3.0], [1.4, 1.4]),
      num('legBR.rotation[x]', [0, 3.0], [1.4, 1.4]),
      num('head.rotation[x]', [0, 3.0], [0.9, 0.9]),
    ]),

    /**
     * Out and across, fast and low.
     *
     * Twice the leg frequency of a trot with the body slung down, which at the
     * second or so a rat is out for is all the read you get.
     */
    new THREE.AnimationClip('scurry', 0.45, [
      num('legFL.rotation[x]', [0, 0.1125, 0.225, 0.3375, 0.45], [0.8, 0, -0.8, 0, 0.8]),
      num('legFR.rotation[x]', [0, 0.1125, 0.225, 0.3375, 0.45], [-0.8, 0, 0.8, 0, -0.8]),
      num('legBL.rotation[x]', [0, 0.1125, 0.225, 0.3375, 0.45], [-0.8, 0, 0.8, 0, -0.8]),
      num('legBR.rotation[x]', [0, 0.1125, 0.225, 0.3375, 0.45], [0.8, 0, -0.8, 0, 0.8]),
      vec('body.position', [0, 0.225, 0.45], [0, -0.06, 0, 0, -0.02, 0, 0, -0.06, 0]),
      num('body.rotation[x]', [0, 0.45], [0.12, 0.12]),
      num('tail.rotation[y]', [0, 0.15, 0.3, 0.45], [0.4, -0.4, 0.4, 0.4]),
      num('head.rotation[x]', [0, 0.45], [0.25, 0.25]),
    ]),

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

function buildVehicle(def: SubjectDef, seed: number): BuiltModel {
  const { accent: a } = def.palette
  const spec = def.vehicle ?? {}
  const rng = makeRng((seed + 91) * 2654435761)
  const c = spec.bodyPalette?.length ? pick(rng, spec.bodyPalette) : def.palette.body
  const g = new THREE.Group()
  /**
   * Wheel diameter, not radius.
   *
   * This was 0.34, which on a shared cylinder of unit radius 0.5 is a 0.17 m
   * wheel — while the pivots sit at y 0.34. Every car in the city was rolling
   * on castors suspended 17 cm above the road. The two numbers have to agree:
   * diameter 0.68 puts the contact patch exactly on the ground.
   */
  const wheel: [number, number, number] = [0.68, 0.24, 0.68]

  // An SUV is the same car standing taller with a squarer back — which is most
  // of what separates the black Suburbans on Rush from everything else.
  const suv = spec.body === 'suv'
  const lift = suv ? 0.16 : 0
  const cabinH = suv ? 0.78 : 0.52
  const width = suv ? 1.9 : 1.78

  g.add(
    // Body sits above the axle line so the wheels are visible rather than half
    // swallowed, and the cabin is inset from the body to break the slab.
    part('body', BOX, c, [0, 0.72 + lift, 0], [width, 0.58 + lift, 4.2]),
    part('hood', BOX, c, [0, 0.86 + lift, -1.42], [width * 0.93, 0.3, 1.36]),
    part('boot', BOX, c, [0, 0.86 + lift, 1.5], [width * 0.93, 0.3, suv ? 1.5 : 1.2]),
    part('cabin', BOX, c, [0, 1.16 + lift + (cabinH - 0.52) / 2, 0.1], [width * 0.85, cabinH, suv ? 2.3 : 1.9]),
    part('glass', BOX, a, [0, 1.18 + lift, -0.86], [width * 0.8, 0.4, 0.1]),
    part('glassBack', BOX, a, [0, 1.18 + lift, suv ? 1.26 : 1.06], [width * 0.8, 0.36, 0.1]),
    // Wheels hang off pivots so they roll about X. The cylinder is laid on its
    // side *inside* the pivot, so the animated rotation never composes with the
    // orienting one — which is what made them spin like turntables.
    ...([
      ['wheelFL', -0.95, -1.34],
      ['wheelFR', 0.95, -1.34],
      ['wheelBL', -0.95, 1.42],
      ['wheelBR', 0.95, 1.42],
    ] as const).map(([name, x, z]) => {
      const p = wheelPivot(name, [x, 0.34 + lift * 0.5, z], wheel, 0x17191d)
      // Hubcap proud of the tyre on the outboard face, so a wheel is not one
      // flat black disc. Rotating with the pivot, it also makes the spin read.
      const out = Math.sign(x) * 0.13
      p.add(
        part(`${name}Cap`, CYL, 0xa8adb4, [out, 0, 0], [0.38, 0.04, 0.38], [0, 0, Math.PI / 2]),
        part(`${name}Nut`, CYL, 0x71767d, [out * 1.2, 0, 0], [0.12, 0.04, 0.12], [0, 0, Math.PI / 2]),
        part(`${name}SpokeA`, BOX, 0x8f959d, [out * 1.1, 0, 0], [0.05, 0.32, 0.05]),
        part(`${name}SpokeB`, BOX, 0x8f959d, [out * 1.1, 0, 0], [0.05, 0.32, 0.05], [Math.PI / 2, 0, 0]),
      )
      return p
    }),
  )

  // Arches over each wheel. Without them the wheels look bolted to the outside
  // of a slab; with them the body has a wing over the wheel, like a car.
  for (const [name, x, z] of [
    ['archFL', -1, -1.34], ['archFR', 1, -1.34],
    ['archBL', -1, 1.42], ['archBR', 1, 1.42],
  ] as const) {
    g.add(
      part(name, BOX, shadeOf(c, 0.86), [x * (width / 2 - 0.02), 0.62 + lift, z], [0.12, 0.34, 1.02]),
    )
  }

  /**
   * The details that make a box a car.
   *
   * None of these is individually visible from across the street; together they
   * are the difference between "vehicle" and "crate on wheels". Lamps and glass
   * in particular do most of the work, because they are the only parts that are
   * not body colour and so they are what reads first.
   */
  const trim = 0x1b1d22
  const glassEdge = 0x2b3138
  g.add(
    // Headlamps and tail lamps.
    part('headL', BOX, 0xfff2cf, [-0.6, 0.78 + lift, -2.06], [0.42, 0.16, 0.12]),
    part('headR', BOX, 0xfff2cf, [0.6, 0.78 + lift, -2.06], [0.42, 0.16, 0.12]),
    part('tailL', BOX, 0xc23a35, [-0.6, 0.82 + lift, 2.06], [0.42, 0.14, 0.1]),
    part('tailR', BOX, 0xc23a35, [0.6, 0.82 + lift, 2.06], [0.42, 0.14, 0.1]),
    // Grille and bumpers.
    part('grille', BOX, trim, [0, 0.66 + lift, -2.08], [1.1, 0.22, 0.1]),
    part('bumperF', BOX, trim, [0, 0.5 + lift, -2.04], [width * 0.94, 0.2, 0.2]),
    part('bumperB', BOX, trim, [0, 0.5 + lift, 2.06], [width * 0.94, 0.2, 0.2]),
    part('plate', BOX, 0xd8d4c6, [0, 0.52 + lift, 2.14], [0.42, 0.14, 0.06]),
    // Side glass, which is what separates a cabin from a block.
    part('glassSideL', BOX, a, [-width * 0.43, 1.2 + lift + (cabinH - 0.52) / 2, 0.1], [0.05, cabinH * 0.62, suv ? 1.9 : 1.5]),
    part('glassSideR', BOX, a, [width * 0.43, 1.2 + lift + (cabinH - 0.52) / 2, 0.1], [0.05, cabinH * 0.62, suv ? 1.9 : 1.5]),
    // Pillars either side of the door glass.
    part('pillarL', BOX, glassEdge, [-width * 0.43, 1.18 + lift, -0.72], [0.07, cabinH * 0.9, 0.1]),
    part('pillarR', BOX, glassEdge, [width * 0.43, 1.18 + lift, -0.72], [0.07, cabinH * 0.9, 0.1]),
    // Mirrors.
    part('mirrorL', BOX, trim, [-width * 0.55, 1.18 + lift, -0.78], [0.2, 0.11, 0.1]),
    part('mirrorR', BOX, trim, [width * 0.55, 1.18 + lift, -0.78], [0.2, 0.11, 0.1]),
    // A shut line down each flank, so the side is a door rather than a slab.
    part('doorL', BOX, trim, [-width / 2 - 0.005, 0.72 + lift, 0.3], [0.02, 0.5, 0.04]),
    part('doorR', BOX, trim, [width / 2 + 0.005, 0.72 + lift, 0.3], [0.02, 0.5, 0.04]),
    // Sills, which give the body a shadow line above the wheels.
    part('sillL', BOX, trim, [-width / 2 - 0.005, 0.5 + lift, 0], [0.03, 0.14, 2.9]),
    part('sillR', BOX, trim, [width / 2 + 0.005, 0.5 + lift, 0], [0.03, 0.14, 2.9]),
  )

  const roof = 1.44 + lift + (cabinH - 0.52)

  if (spec.sign === 'taxi') {
    /**
     * A lit roof sign and a checker band.
     *
     * The sign was a dark box the same colour as the glass, sitting on a yellow
     * roof — invisible at any distance. A taxi is recognised by two things and
     * these are both of them.
     */
    g.add(
      part('signBase', BOX, 0x2b2e34, [0, roof + 0.04, -0.1], [0.7, 0.08, 0.3]),
      part('sign', BOX, 0xf7e08a, [0, roof + 0.16, -0.1], [0.78, 0.2, 0.26]),
      part('signFaceL', BOX, 0x24262b, [-0.32, roof + 0.16, -0.1], [0.08, 0.16, 0.28]),
      part('signFaceR', BOX, 0x24262b, [0.32, roof + 0.16, -0.1], [0.08, 0.16, 0.28]),
    )
    // Chequers along both flanks, alternating light and dark.
    for (let i = 0; i < 10; i++) {
      const z = -1.6 + i * 0.36
      const dark = i % 2 === 0
      for (const side of [-1, 1]) {
        g.add(
          part(`check${side < 0 ? 'L' : 'R'}${i}`, BOX, dark ? 0x24262b : 0xf2f2ee,
            [side * (width / 2 + 0.012), 0.62 + lift, z], [0.03, 0.18, 0.36]),
        )
      }
    }
    // Medallion number on the rear quarter.
    g.add(
      part('medallionL', BOX, 0x24262b, [-width / 2 - 0.015, 0.92 + lift, 1.5], [0.02, 0.16, 0.42]),
      part('medallionR', BOX, 0x24262b, [width / 2 + 0.015, 0.92 + lift, 1.5], [0.02, 0.16, 0.42]),
    )
  } else if (spec.sign === 'rideshare') {
    // The lit placard in the windscreen, which is the whole visual difference
    // between an Uber and any other car on the street.
    g.add(part('placard', BOX, 0xf2f2f2, [0.42, 1.02 + lift, -0.9], [0.34, 0.2, 0.06]))
  } else if (spec.sign === 'delivery') {
    g.add(
      part('bag', BOX, 0xd8453f, [0, roof + 0.24, 0.5], [0.72, 0.5, 0.72]),
      part('bagStrap', BOX, 0x2b2b2b, [0, roof + 0.02, 0.5], [0.78, 0.06, 0.78]),
    )
  }

  if (spec.stripe !== undefined) {
    g.add(
      part('stripeL', BOX, spec.stripe, [-width / 2 - 0.01, 0.74 + lift, 0], [0.04, 0.26, 3.4]),
      part('stripeR', BOX, spec.stripe, [width / 2 + 0.01, 0.74 + lift, 0], [0.04, 0.26, 3.4]),
    )
  }

  if (spec.lightBar) {
    g.add(
      part('lightBar', BOX, 0x1b1d22, [0, roof + 0.09, -0.1], [1.12, 0.12, 0.26]),
      part('lightRed', BOX, 0xe03b3b, [-0.32, roof + 0.11, -0.1], [0.34, 0.14, 0.24]),
      part('lightBlue', BOX, 0x3b6fe0, [0.32, roof + 0.11, -0.1], [0.34, 0.14, 0.24]),
    )
  }

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

  if (spec.lightBar) {
    // Lights alternate by scaling each lamp — there is no emissive channel to
    // animate on a toon material, and a lamp that visibly swells and shrinks
    // reads as flashing at the distance a photo is taken from.
    clips.push(
      new THREE.AnimationClip('lights', 0.8, [
        num('lightRed.scale[y]', [0, 0.2, 0.4, 0.6, 0.8], [1, 2.2, 1, 1, 1]),
        num('lightBlue.scale[y]', [0, 0.2, 0.4, 0.6, 0.8], [1, 1, 1, 2.2, 1]),
        num('body.position[y]', [0, 0.8], [0.72 + lift, 0.72 + lift]),
      ]),
    )
  }

  return { group: g, clips, bounds: boundsOf(g) }
}

// ---------------------------------------------------------------------------


/**
 * A CTA bus.
 *
 * The largest thing on the street by a long way, which is the point of it: a
 * bus passing gives the avenue a sense of scale nothing else does, and it fills
 * a frame at a distance where a car is a speck.
 */
function buildBus(def: SubjectDef): BuiltModel {
  const { body: c, accent: a } = def.palette
  const g = new THREE.Group()
  const wheel: [number, number, number] = [0.52, 0.22, 0.52]
  const L = 12.2
  const W = 2.55
  const H = 2.05

  g.add(
    part('body', BOX, c, [0, 1.62, 0], [W, H, L]),
    // The window band: one dark strip down each side rather than punched
    // windows, because at the size a bus appears in frame the band is what
    // reads and the individual panes are noise.
    part('windowL', BOX, a, [-W / 2 - 0.01, 2.1, 0.2], [0.05, 0.86, L * 0.82]),
    part('windowR', BOX, a, [W / 2 + 0.01, 2.1, 0.2], [0.05, 0.86, L * 0.82]),
    part('windscreen', BOX, a, [0, 2.12, -L / 2 - 0.01], [W * 0.86, 1.0, 0.06]),
    part('rear', BOX, a, [0, 2.06, L / 2 + 0.01], [W * 0.86, 0.8, 0.06]),
    // Destination blind over the windscreen.
    part('blind', BOX, 0x1c1f26, [0, 2.78, -L / 2 + 0.06], [1.5, 0.3, 0.1]),
    part('skirtL', BOX, 0x2b3038, [-W / 2 - 0.01, 0.9, 0], [0.05, 0.62, L * 0.94]),
    part('skirtR', BOX, 0x2b3038, [W / 2 + 0.01, 0.9, 0], [0.05, 0.62, L * 0.94]),
    part('roof', BOX, 0xd8dbe0, [0, 2.7, 0.4], [W * 0.86, 0.14, L * 0.7]),
    wheelPivot('wheelFL', [-1.12, 0.52, -L / 2 + 1.9], wheel, 0x1b1d22),
    wheelPivot('wheelFR', [1.12, 0.52, -L / 2 + 1.9], wheel, 0x1b1d22),
    wheelPivot('wheelBL', [-1.12, 0.52, L / 2 - 2.6], wheel, 0x1b1d22),
    wheelPivot('wheelBR', [1.12, 0.52, L / 2 - 2.6], wheel, 0x1b1d22),
  )

  // CTA livery and the fittings that say bus rather than shipping container.
  g.add(
    part('stripe', BOX, 0x1d4f8f, [0, 1.12, 0], [W + 0.03, 0.24, L * 0.98]),
    part('stripeRed', BOX, 0xb8352f, [0, 0.94, 0], [W + 0.03, 0.12, L * 0.98]),
    part('doorFront', BOX, 0x2b3038, [W / 2 + 0.02, 1.5, -L / 2 + 2.6], [0.06, 1.8, 1.1]),
    part('doorMid', BOX, 0x2b3038, [W / 2 + 0.02, 1.5, 1.2], [0.06, 1.8, 1.1]),
    part('headL', BOX, 0xfff2cf, [-0.85, 1.02, -L / 2 - 0.02], [0.4, 0.22, 0.08]),
    part('headR', BOX, 0xfff2cf, [0.85, 1.02, -L / 2 - 0.02], [0.4, 0.22, 0.08]),
    part('tailL', BOX, 0xc23a35, [-0.9, 1.1, L / 2 + 0.02], [0.34, 0.3, 0.08]),
    part('tailR', BOX, 0xc23a35, [0.9, 1.1, L / 2 + 0.02], [0.34, 0.3, 0.08]),
    part('mirrorL', BOX, 0x1b1d22, [-W / 2 - 0.22, 2.5, -L / 2 + 0.5], [0.3, 0.34, 0.1]),
    part('mirrorR', BOX, 0x1b1d22, [W / 2 + 0.22, 2.5, -L / 2 + 0.5], [0.3, 0.34, 0.1]),
    part('vent', BOX, 0xb9bec5, [0, 2.82, -2.2], [1.1, 0.2, 1.6]),
    part('poleAC', BOX, 0xb9bec5, [0, 2.82, 2.6], [0.9, 0.16, 1.2]),
  )

  const spin = (path: string, dur: number) =>
    num(path, [0, dur / 2, dur], [0, -Math.PI, -Math.PI * 2])

  const clips = [
    new THREE.AnimationClip('parked', 4.0, [
      num('body.position[y]', [0, 2.0, 4.0], [1.62, 1.63, 1.62]),
    ]),
    new THREE.AnimationClip('cruise', 1.2, [
      spin('wheelFL.rotation[x]', 1.2),
      spin('wheelFR.rotation[x]', 1.2),
      spin('wheelBL.rotation[x]', 1.2),
      spin('wheelBR.rotation[x]', 1.2),
      num('body.position[y]', [0, 0.3, 0.6, 0.9, 1.2], [1.62, 1.64, 1.62, 1.64, 1.62]),
    ]),
    // Kneeling at a stop: the front dips, which is a real and very recognisable
    // thing a CTA bus does.
    new THREE.AnimationClip('stop', 3.0, [
      num('body.position[y]', [0, 0.8, 2.2, 3.0], [1.62, 1.5, 1.5, 1.62]),
      num('body.rotation[x]', [0, 0.8, 2.2, 3.0], [0, 0.02, 0.02, 0]),
    ]),
  ]

  return { group: g, clips, bounds: boundsOf(g) }
}

/**
 * Someone on a bike — couriers, delivery riders, anyone in the bike lane.
 *
 * The rider is built into the bike rather than reusing the humanoid: a person
 * on a bicycle is folded forward with their knees up, which is a different
 * shape from a person standing, and pedalling has to drive the legs from the
 * cranks.
 */
function buildBicycle(def: SubjectDef, seed: number): BuiltModel {
  const { body: c, accent: a } = def.palette
  const rng = makeRng((seed + 17) * 2654435761)
  const spec = def.rider
  const skin = spec ? pick(rng, spec.skin) : 0xc79a72
  const top = spec ? pick(rng, spec.top) : 0x2f6f8f
  const bottom = spec ? pick(rng, spec.bottom) : 0x2a2f38
  const g = new THREE.Group()

  /**
   * A wheel that isn't a black disc.
   *
   * The tyre cylinder alone read as a solid puck — at any distance a bicycle
   * looked like it was rolling on two coins. A pale rim inside the tyre, a hub,
   * and six spoke bars give it the see-through quality a wheel needs. The
   * spokes are children of the pivot so they turn with it.
   */
  const spoked = (name: string, at: [number, number, number]) => {
    // A torus lies in the XY plane, so the thin axis is Z. Passing the old
    // cylinder's [d, thickness, d] here squashed the wheel into an ellipse.
    const p = pivot(name, at, part(`${name}Tyre`, TORUS, 0x191b20, [0, 0, 0], [0.66, 0.66, 0.1], [0, Math.PI / 2, 0]))
    p.add(
      // The rim sits just inside the tyre and is visible through the hole.
      part(`${name}Rim`, TORUS, 0x8f959d, [0, 0, 0], [0.55, 0.55, 0.06], [0, Math.PI / 2, 0]),
      part(`${name}Hub`, CYL, 0x8b9098, [0, 0, 0], [0.1, 0.09, 0.1], [0, 0, Math.PI / 2]),
    )
    for (let i = 0; i < 6; i++) {
      p.add(
        // Spun about X: the wheel lies in the YZ plane, so rotating about Z
        // would swing the spokes out of the wheel entirely.
        part(`${name}Spoke${i}`, BOX, 0x9aa0a8, [0, 0, 0], [0.012, 0.56, 0.012],
          [(i / 6) * Math.PI, 0, 0]),
      )
    }
    return p
  }

  g.add(
    spoked('wheelF', [0, 0.33, -0.52]),
    spoked('wheelB', [0, 0.33, 0.52]),
    part('frame', BOX, c, [0, 0.6, 0], [0.07, 0.07, 1.02], [0, 0, 0.34]),
    part('seatTube', BOX, c, [0, 0.68, 0.34], [0.07, 0.42, 0.07]),
    part('forks', BOX, c, [0, 0.62, -0.5], [0.07, 0.52, 0.07], [0.2, 0, 0]),
    part('saddle', BOX, 0x1f2126, [0, 0.9, 0.36], [0.12, 0.06, 0.3]),
    part('bars', BOX, 0x1f2126, [0, 0.92, -0.46], [0.46, 0.05, 0.05]),
  )

  /**
   * Detail pass.
   *
   * A bike read as three sticks and two discs. Chainstays and a down tube give
   * it the diamond every bicycle actually has, and the small hardware — grips,
   * lamp, mudguard, bottle — is what makes it look owned rather than diagrammed.
   */
  g.add(
    // Chainstays and seatstays: the rear triangle.
    part('chainstayL', BOX, c, [-0.055, 0.35, 0.29], [0.04, 0.04, 0.5]),
    part('chainstayR', BOX, c, [0.055, 0.35, 0.29], [0.04, 0.04, 0.5]),
    part('seatstayL', BOX, c, [-0.055, 0.6, 0.44], [0.04, 0.5, 0.04], [0.42, 0, 0]),
    part('seatstayR', BOX, c, [0.055, 0.6, 0.44], [0.04, 0.5, 0.04], [0.42, 0, 0]),
    part('downTube', BOX, c, [0, 0.52, -0.16], [0.06, 0.06, 0.78], [-0.5, 0, 0]),
    part('headTube', BOX, c, [0, 0.85, -0.47], [0.06, 0.2, 0.06], [0.2, 0, 0]),
    // Hub and cranks hardware.
    part('chainring', CYL, 0x8b8f96, [0.045, 0.34, 0.06], [0.19, 0.02, 0.19], [0, 0, Math.PI / 2]),
    part('chainTop', BOX, 0x2b2e34, [0.045, 0.42, 0.3], [0.02, 0.02, 0.48]),
    part('chainBottom', BOX, 0x2b2e34, [0.045, 0.27, 0.3], [0.02, 0.02, 0.48]),
    part('cassette', CYL, 0x8b8f96, [0.045, 0.33, 0.52], [0.1, 0.03, 0.1], [0, 0, Math.PI / 2]),
    // Grips, brake levers, and a bell — where the hands go.
    part('gripL', CYL, 0x25282e, [-0.21, 0.92, -0.46], [0.035, 0.11, 0.035], [0, 0, Math.PI / 2]),
    part('gripR', CYL, 0x25282e, [0.21, 0.92, -0.46], [0.035, 0.11, 0.035], [0, 0, Math.PI / 2]),
    part('leverL', BOX, 0x9aa0a8, [-0.17, 0.87, -0.51], [0.025, 0.11, 0.03], [0.4, 0, 0]),
    part('leverR', BOX, 0x9aa0a8, [0.17, 0.87, -0.51], [0.025, 0.11, 0.03], [0.4, 0, 0]),
    part('stem', BOX, 0x2b2e34, [0, 0.92, -0.42], [0.05, 0.04, 0.14]),
    // Lamp and reflector. On a courier bike these are always on, and they are
    // the brightest thing on the model at dusk.
    part('lamp', CYL, 0xf0e2b0, [0, 0.78, -0.6], [0.05, 0.06, 0.05], [Math.PI / 2, 0, 0]),
    part('reflector', BOX, 0xc4442e, [0, 0.72, 0.52], [0.07, 0.05, 0.02]),
    part('mudguard', BOX, 0x2b2e34, [0, 0.72, 0.52], [0.09, 0.04, 0.34], [0.35, 0, 0]),
    part('bottle', CYL, 0x3f7a9c, [0, 0.56, 0.06], [0.045, 0.19, 0.045], [0, 0, 0.34]),
    // Rear rack — what a delivery rider straps the bag to.
    part('rack', BOX, 0x3a3e45, [0, 0.86, 0.6], [0.24, 0.03, 0.3]),
    part('rackStayL', BOX, 0x3a3e45, [-0.1, 0.72, 0.62], [0.025, 0.28, 0.025]),
    part('rackStayR', BOX, 0x3a3e45, [0.1, 0.72, 0.62], [0.025, 0.28, 0.025]),
  )

  // Cranks on a pivot so the legs can be hung off them and driven by one track.
  const cranks = pivot('cranks', [0, 0.34, 0.06], part('crankArm', BOX, a, [0, 0, 0], [0.05, 0.34, 0.05]))
  cranks.add(
    part('pedalL', BOX, 0x1f2126, [-0.11, -0.16, 0], [0.1, 0.04, 0.16]),
    part('pedalR', BOX, 0x1f2126, [0.11, 0.16, 0], [0.1, 0.04, 0.16]),
  )
  g.add(cranks)

  /**
   * Rider, folded over the bars.
   *
   * Built around the contact points rather than by eye: hips on the saddle,
   * hands on the bars, feet on the pedals. The first version placed the torso
   * by guesswork and it came out sitting behind and above the bike with its
   * legs ending in mid-air, which is what a person on a bicycle looks like if
   * you forget the bicycle is holding them up.
   */
  const HIP = [0, 0.9, 0.34] as const
  const torso = pivot(
    'riderTorso',
    [HIP[0], HIP[1], HIP[2]],
    part('torsoBox', BOX, top, [0, 0.23, 0], [0.33, 0.5, 0.22]),
  )
  /**
   * Leaning forward over the bars.
   *
   * This was `+0.72`, which leans the rider *backwards*: the bike faces −Z, and
   * a positive rotation about X carries the top of the torso toward +Z. The
   * result was a cyclist reclining off the back of the saddle with both arms in
   * the air. Forward lean on this model is negative.
   */
  const LEAN = -0.72
  torso.rotation.x = LEAN
  torso.add(
    part('head', SPHERE, skin, [0, 0.62, -0.1], [0.19, 0.22, 0.19]),
    part('neck', BOX, skin, [0, 0.5, -0.05], [0.11, 0.1, 0.11]),
    /**
     * Arms, solved to the grips rather than eyeballed.
     *
     * The grips sit at y 0.92, z −0.46 in world space; rotated into the leaning
     * torso's frame that is roughly (±0.21, 0.54, −0.59), so an arm from the
     * shoulder at (±0.15, 0.46, 0) is 0.6 long and almost straight down the
     * −Z axis. Placing it by eye is how the last version ended up detached.
     */
    part('armL', BOX, top, [-0.18, 0.5, -0.29], [0.09, 0.09, 0.6], [-0.14, 0, 0]),
    part('armR', BOX, top, [0.18, 0.5, -0.29], [0.09, 0.09, 0.6], [-0.14, 0, 0]),
    part('handL', BOX, skin, [-0.21, 0.54, -0.58], [0.09, 0.09, 0.11], [-0.14, 0, 0]),
    part('handR', BOX, skin, [0.21, 0.54, -0.58], [0.09, 0.09, 0.11], [-0.14, 0, 0]),
    // Shoulders proud of the torso block, so the arms grow out of something.
    part('shoulderL', BOX, top, [-0.16, 0.44, 0], [0.1, 0.14, 0.2]),
    part('shoulderR', BOX, top, [0.16, 0.44, 0], [0.1, 0.14, 0.2]),
    // A hem at the bottom of the jersey and a collar at the neck: the two
    // places a garment ends, and the two places the eye looks for one.
    part('hem', BOX, shadeOf(top, 0.78), [0, 0.0, 0], [0.34, 0.05, 0.23]),
    part('collar', BOX, shadeOf(top, 1.2), [0, 0.47, -0.02], [0.2, 0.05, 0.18]),
  )
  g.add(torso)

  /** Thigh down from the hip, shin down to the pedal. */
  const leg = (name: string, x: number) => {
    const thigh = pivot(
      name,
      [x, HIP[1] - 0.04, HIP[2] - 0.04],
      part(`${name}Thigh`, BOX, bottom, [0, -0.17, 0], [0.12, 0.36, 0.13]),
    )
    const shin = pivot(
      `${name}Shin`,
      [0, -0.34, 0],
      part(`${name}ShinBox`, BOX, bottom, [0, -0.16, 0], [0.1, 0.34, 0.11]),
    )
    shin.add(part(`${name}Foot`, BOX, 0x1f2126, [0, -0.33, -0.05], [0.1, 0.07, 0.19]))
    thigh.add(shin)
    return thigh
  }

  const thighL = leg('thighL', -0.11)
  const thighR = leg('thighR', 0.11)
  g.add(thighL, thighR)

  if (spec?.accessories?.includes('helmet')) {
    // Over the head, not behind it: the head sits at z −0.1 and the helmet was
    // at −0.04, which put it on the back of the skull.
    torso.add(
      part('helmet', SPHERE, a, [0, 0.68, -0.1], [0.23, 0.16, 0.24]),
      part('helmetVentL', BOX, shadeOf(a, 0.6), [-0.05, 0.73, -0.1], [0.03, 0.05, 0.2]),
      part('helmetVentR', BOX, shadeOf(a, 0.6), [0.05, 0.73, -0.1], [0.03, 0.05, 0.2]),
      part('helmetStrap', BOX, 0x24282e, [0, 0.6, -0.1], [0.2, 0.03, 0.2]),
    )
  }
  if (spec?.accessories?.includes('bag')) {
    // The insulated cube, on the rider's back where it actually rides.
    torso.add(part('deliveryBag', BOX, a, [0, 0.3, 0.19], [0.34, 0.36, 0.2]))
  }

  const clips = [
    new THREE.AnimationClip('idle', 3.0, [
      // Negative is forward on this model; see LEAN above.
      num('riderTorso.rotation[x]', [0, 1.5, 3.0], [-0.72, -0.67, -0.72]),
      // Positive swings a leg FORWARD, toward the cranks. Negative reaches out
      // behind the back wheel, which is where both legs were.
      num('thighL.rotation[x]', [0, 3.0], [0.62, 0.62]),
      num('thighR.rotation[x]', [0, 3.0], [0.34, 0.34]),
      num('thighLShin.rotation[x]', [0, 3.0], [-0.55, -0.55]),
      num('thighRShin.rotation[x]', [0, 3.0], [-0.3, -0.3]),
    ]),
    new THREE.AnimationClip('ride', 0.9, [
      num('wheelF.rotation[x]', [0, 0.45, 0.9], [0, -Math.PI, -Math.PI * 2]),
      num('wheelB.rotation[x]', [0, 0.45, 0.9], [0, -Math.PI, -Math.PI * 2]),
      num('cranks.rotation[x]', [0, 0.45, 0.9], [0, -Math.PI, -Math.PI * 2]),
      // Thigh and shin move together: the knee closes as the foot comes up and
      // opens as it goes down, which is the whole read of pedalling.
      num('thighL.rotation[x]', [0, 0.225, 0.45, 0.675, 0.9], [0.85, 0.55, 0.28, 0.55, 0.85]),
      num('thighR.rotation[x]', [0, 0.225, 0.45, 0.675, 0.9], [0.28, 0.55, 0.85, 0.55, 0.28]),
      num('thighLShin.rotation[x]', [0, 0.225, 0.45, 0.675, 0.9], [-0.85, -0.45, -0.15, -0.5, -0.85]),
      num('thighRShin.rotation[x]', [0, 0.225, 0.45, 0.675, 0.9], [-0.15, -0.5, -0.85, -0.45, -0.15]),
      num('riderTorso.rotation[z]', [0, 0.225, 0.45, 0.675, 0.9], [0.04, 0, -0.04, 0, 0.04]),
    ]),
    // Up out of the saddle, which is the shot worth waiting for.
    new THREE.AnimationClip('sprint', 0.6, [
      num('wheelF.rotation[x]', [0, 0.3, 0.6], [0, -Math.PI, -Math.PI * 2]),
      num('wheelB.rotation[x]', [0, 0.3, 0.6], [0, -Math.PI, -Math.PI * 2]),
      num('cranks.rotation[x]', [0, 0.3, 0.6], [0, -Math.PI, -Math.PI * 2]),
      num('riderTorso.rotation[x]', [0, 0.3, 0.6], [-0.86, -0.8, -0.86]),
      num('riderTorso.position[y]', [0, 0.3, 0.6], [1.0, 1.05, 1.0]),
      num('thighL.rotation[x]', [0, 0.15, 0.3, 0.45, 0.6], [0.95, 0.6, 0.3, 0.6, 0.95]),
      num('thighR.rotation[x]', [0, 0.15, 0.3, 0.45, 0.6], [0.3, 0.6, 0.95, 0.6, 0.3]),
      num('thighLShin.rotation[x]', [0, 0.15, 0.3, 0.45, 0.6], [-0.95, -0.5, -0.18, -0.55, -0.95]),
      num('thighRShin.rotation[x]', [0, 0.15, 0.3, 0.45, 0.6], [-0.18, -0.55, -0.95, -0.5, -0.18]),
    ]),
  ]

  return { group: g, clips, bounds: boundsOf(g) }
}

/**
 * Mounted police.
 *
 * A horse is a quadruped with a very different silhouette — long neck, deep
 * chest, high back — and the rider has to sit on it rather than beside it, so
 * the rider hangs off a saddle pivot and moves with the animal.
 */
function buildHorse(def: SubjectDef, seed: number): BuiltModel {
  const { body: c, accent: a } = def.palette
  const rng = makeRng((seed + 31) * 2654435761)
  const spec = def.rider
  const skin = spec ? pick(rng, spec.skin) : 0xb9835c
  const uniform = spec ? pick(rng, spec.top) : 0x2b3550
  const g = new THREE.Group()

  const body = new THREE.Group()
  body.name = 'body'
  body.position.set(0, 1.42, 0)
  body.add(
    part('barrel', BOX, c, [0, 0, 0], [0.62, 0.78, 1.9]),
    part('chest', BOX, c, [0, 0.04, -0.86], [0.58, 0.7, 0.5]),
    part('rump', BOX, c, [0, 0.02, 0.92], [0.6, 0.72, 0.42]),
    part('tail', BOX, a, [0, 0.1, 1.16], [0.12, 0.5, 0.12], [-0.4, 0, 0]),
  )

  /**
   * Neck and head, solved along the lines they actually follow.
   *
   * The previous version hung a mostly-vertical box off the chest and put the
   * head pivot up and forward of it, so the two did not meet: from the side the
   * horse had a horizontal crate for a neck. Here the neck runs from the
   * withers at body (0, 0.35, −0.95) to the poll at (0, 0.85, −1.50) — a 50°
   * rise — and the head hangs off the poll at 43° below that.
   *
   * Sign convention, the same one the cyclist needed: negative rotation about X
   * tips the far end of a part toward −Z, which on this model is forward.
   */
  const NECK_RISE = -0.833
  const neck = pivot(
    'neck',
    [0, 0.35, -0.95],
    part('neckBox', BOX, c, [0, 0.25, -0.275], [0.36, 0.86, 0.44], [NECK_RISE, 0, 0]),
  )
  neck.add(
    // Crest along the top of the neck and a throat below it, so the neck has a
    // section rather than being one flat slab.
    part('crest', BOX, c, [0, 0.34, -0.4], [0.26, 0.4, 0.34], [NECK_RISE, 0, 0]),
    part('throat', BOX, shadeOf(c, 0.9), [0, 0.16, -0.42], [0.28, 0.36, 0.3], [NECK_RISE, 0, 0]),
  )

  const HEAD_DROP = -0.75
  const head = pivot(
    'head',
    [0, 0.5, -0.55],
    part('headBox', BOX, c, [0, 0, 0], [0.3, 0.36, 0.68], [HEAD_DROP, 0, 0]),
  )
  head.add(
    // Cheek, then the muzzle tapering off the front of it.
    part('cheek', BOX, c, [0, 0.06, 0.14], [0.34, 0.4, 0.34], [HEAD_DROP, 0, 0]),
    part('muzzle', BOX, a, [0, -0.16, -0.42], [0.24, 0.26, 0.28], [HEAD_DROP, 0, 0]),
    part('nose', BOX, shadeOf(a, 0.8), [0, -0.24, -0.54], [0.2, 0.16, 0.12], [HEAD_DROP, 0, 0]),
    part('blaze', BOX, 0xe8e2d6, [0, 0.02, -0.34], [0.09, 0.12, 0.44], [HEAD_DROP, 0, 0]),
    part('nostrilL', BOX, 0x1d1712, [-0.07, -0.26, -0.56], [0.05, 0.06, 0.04]),
    part('nostrilR', BOX, 0x1d1712, [0.07, -0.26, -0.56], [0.05, 0.06, 0.04]),
    part('earL', CONE, c, [-0.1, 0.28, 0.1], [0.1, 0.22, 0.1], [-0.2, 0, -0.12]),
    part('earR', CONE, c, [0.1, 0.28, 0.1], [0.1, 0.22, 0.1], [-0.2, 0, 0.12]),
    part('earInL', CONE, shadeOf(a, 0.7), [-0.1, 0.27, 0.075], [0.055, 0.17, 0.055], [-0.2, 0, -0.12]),
    part('earInR', CONE, shadeOf(a, 0.7), [0.1, 0.27, 0.075], [0.055, 0.17, 0.055], [-0.2, 0, 0.12]),
    part('eyeL', SPHERE, 0x14100c, [-0.15, 0.1, -0.1], [0.07, 0.07, 0.07]),
    part('eyeR', SPHERE, 0x14100c, [0.15, 0.1, -0.1], [0.07, 0.07, 0.07]),
    // Bridle: browband over the forehead, noseband round the muzzle, cheek
    // straps joining them, and the bit at the corner of the mouth.
    part('browband', BOX, 0x3a2a1e, [0, 0.16, 0.0], [0.33, 0.05, 0.08], [HEAD_DROP, 0, 0]),
    part('noseband', BOX, 0x3a2a1e, [0, -0.12, -0.36], [0.27, 0.09, 0.06], [HEAD_DROP, 0, 0]),
    part('cheekL', BOX, 0x3a2a1e, [-0.16, 0.02, -0.18], [0.03, 0.42, 0.05], [HEAD_DROP, 0, 0]),
    part('cheekR', BOX, 0x3a2a1e, [0.16, 0.02, -0.18], [0.03, 0.42, 0.05], [HEAD_DROP, 0, 0]),
    part('bit', CYL, 0x9aa0a8, [0, -0.2, -0.44], [0.02, 0.28, 0.02], [0, 0, Math.PI / 2]),
    // Forelock, falling forward between the ears.
    part('forelock', BOX, a, [0, 0.2, -0.06], [0.15, 0.18, 0.14], [-0.5, 0, 0]),
  )

  /**
   * Mane, as a run of blocks down the crest.
   *
   * Stepped along the neck's own axis so it sits on the crest at every point,
   * rather than along a guessed line — the first attempt left the topmost block
   * hanging in the air behind the neck.
   */
  for (let i = 0; i < 7; i++) {
    const t = i / 6
    neck.add(
      part(`mane${i}`, BOX, a,
        [0, 0.06 + t * 0.5, -0.07 - t * 0.55],
        [0.14, 0.18 + (1 - t) * 0.06, 0.16], [NECK_RISE, 0, 0]),
    )
  }
  neck.add(head)
  body.add(neck)

  /**
   * A leg, with the lower half tapered and a hoof on the end.
   *
   * The hoof and fetlock live inside the pivot so they swing with the leg — the
   * same rule the dog's paws follow. A horse whose feet stayed on the ground
   * while its legs moved was the first thing wrong with the walk.
   */
  const leg = (name: string, x: number, z: number) => {
    const p = pivot(name, [x, -0.36, z], part(`${name}Box`, BOX, c, [0, -0.4, 0], [0.16, 0.86, 0.16]))
    p.add(
      // Upper leg mass, thicker where it meets the body.
      part(`${name}Thigh`, BOX, c, [0, -0.12, 0], [0.22, 0.36, 0.24]),
      part(`${name}Cannon`, BOX, shadeOf(c, 0.88), [0, -0.62, 0], [0.12, 0.32, 0.12]),
      part(`${name}Fetlock`, BOX, shadeOf(c, 0.8), [0, -0.79, 0], [0.14, 0.09, 0.14]),
      part(`${name}Hoof`, CYL, 0x2e2721, [0, -0.87, 0.01], [0.09, 0.1, 0.09]),
    )
    return p
  }
  body.add(leg('legFL', -0.24, -0.66), leg('legFR', 0.24, -0.66), leg('legBL', -0.24, 0.72), leg('legBR', 0.24, 0.72))

  // The rider sits on the saddle and therefore inside `body`, so everything the
  // horse does carries them with it.
  /**
   * Saddle and blanket.
   *
   * The rider was sitting straight on the horse's back. Besides looking wrong,
   * the saddle is what visually joins the two models — without it they read as
   * two separate objects that happen to intersect.
   */
  body.add(
    part('blanket', BOX, 0x2b3550, [0, 0.4, 0.06], [0.66, 0.06, 0.86]),
    part('saddle', BOX, 0x5a3a22, [0, 0.45, 0.06], [0.5, 0.12, 0.62]),
    part('cantle', BOX, 0x4a2f1c, [0, 0.53, 0.34], [0.44, 0.12, 0.1], [-0.3, 0, 0]),
    part('pommel', BOX, 0x4a2f1c, [0, 0.53, -0.22], [0.36, 0.12, 0.1], [0.3, 0, 0]),
    part('girth', BOX, 0x3a2a1e, [0, 0.02, 0.06], [0.66, 0.62, 0.1]),
    part('stirrupL', BOX, 0x9aa0a8, [-0.4, -0.1, 0.12], [0.03, 0.14, 0.11]),
    part('stirrupR', BOX, 0x9aa0a8, [0.4, -0.1, 0.12], [0.03, 0.14, 0.11]),
    part('leatherL', BOX, 0x3a2a1e, [-0.4, 0.16, 0.12], [0.03, 0.4, 0.05]),
    part('leatherR', BOX, 0x3a2a1e, [0.4, 0.16, 0.12], [0.03, 0.4, 0.05]),
    /**
     * Reins, solved between their two ends rather than eyeballed.
     *
     * The bit sits at body (±0.12, 0.35, −1.70) and the rider's gloves at
     * (±0.24, 0.76, −0.24), so a rein is 1.52 long, rising 15° back to the
     * hands, and passes outboard of the neck. The eyeballed version was half
     * that length and floating a metre in front of the horse's face.
     */
    part('reinL', BOX, 0x3a2a1e, [-0.18, 0.555, -0.97], [0.025, 0.025, 1.52], [0.274, 0, 0]),
    part('reinR', BOX, 0x3a2a1e, [0.18, 0.555, -0.97], [0.025, 0.025, 1.52], [0.274, 0, 0]),
    /**
     * Barrel shaping.
     *
     * The body was one 0.62-wide box from chest to rump, so the horse had no
     * shoulder, no belly and no quarters — a plank on four legs. These sit
     * proud of it at the places a horse is actually widest.
     */
    part('shoulderL', BOX, c, [-0.3, 0.02, -0.6], [0.12, 0.62, 0.5]),
    part('shoulderR', BOX, c, [0.3, 0.02, -0.6], [0.12, 0.62, 0.5]),
    part('quarterL', BOX, c, [-0.31, 0.0, 0.7], [0.14, 0.66, 0.6]),
    part('quarterR', BOX, c, [0.31, 0.0, 0.7], [0.14, 0.66, 0.6]),
    part('belly', BOX, shadeOf(c, 0.86), [0, -0.36, 0.05], [0.56, 0.16, 1.7]),
    part('withers', BOX, c, [0, 0.36, -0.72], [0.44, 0.2, 0.5]),
    // Tail dock, so the tail grows out of something.
    part('dock', BOX, c, [0, 0.16, 1.1], [0.16, 0.16, 0.14]),
  )

  // Seated *on* the saddle: its top is at body y 0.51, and the torso box runs
  // from pivot+0.05 upward, so the pivot belongs at 0.46. At 0.62 the rider was
  // hovering a hand's width above the seat.
  const rider = pivot('rider', [0, 0.46, 0.06], part('riderTorso', BOX, uniform, [0, 0.36, 0], [0.42, 0.62, 0.3]))
  rider.add(
    part('riderHead', SPHERE, skin, [0, 0.82, 0], [0.22, 0.25, 0.22]),
    part('riderCap', BOX, uniform, [0, 0.95, 0], [0.26, 0.1, 0.28]),
    part('riderArmL', BOX, uniform, [-0.26, 0.4, -0.1], [0.12, 0.12, 0.42], [0.6, 0, 0]),
    part('riderArmR', BOX, uniform, [0.26, 0.4, -0.1], [0.12, 0.12, 0.42], [0.6, 0, 0]),
    // Outboard of the barrel. The barrel is 0.62 wide and the shoulders sit
    // proud of that, so a thigh at x 0.26 was buried inside the horse.
    part('riderLegL', BOX, 0x1f2432, [-0.36, 0.06, -0.06], [0.16, 0.46, 0.2], [0.5, 0, 0]),
    part('riderLegR', BOX, 0x1f2432, [0.36, 0.06, -0.06], [0.16, 0.46, 0.2], [0.5, 0, 0]),
    part('riderVest', BOX, 0xf2e14a, [0, 0.4, -0.16], [0.36, 0.4, 0.06]),
    // Mounted-unit helmet: a dome with a brim, not a flat cap.
    part('riderDome', SPHERE, uniform, [0, 0.99, 0], [0.25, 0.2, 0.26]),
    part('riderBrim', BOX, shadeOf(uniform, 0.6), [0, 0.9, -0.05], [0.31, 0.03, 0.34]),
    part('riderChinstrap', BOX, 0x2a2622, [0, 0.83, 0], [0.23, 0.04, 0.24]),
    part('riderBadge', BOX, 0xd8b24a, [-0.13, 0.52, -0.17], [0.07, 0.08, 0.02]),
    part('riderBelt', BOX, 0x241f1b, [0, 0.1, 0], [0.44, 0.08, 0.32]),
    part('riderRadio', BOX, 0x1d1f24, [0.2, 0.5, -0.1], [0.06, 0.11, 0.05]),
    // Riding boots up over the calf, which is what actually distinguishes a
    // mounted officer's silhouette from a seated one.
    part('bootL', BOX, 0x1a1714, [-0.38, -0.24, 0.06], [0.17, 0.44, 0.2], [0.1, 0, 0]),
    part('bootR', BOX, 0x1a1714, [0.38, -0.24, 0.06], [0.17, 0.44, 0.2], [0.1, 0, 0]),
    part('gloveL', BOX, 0x2a2622, [-0.24, 0.3, -0.3], [0.11, 0.1, 0.13]),
    part('gloveR', BOX, 0x2a2622, [0.24, 0.3, -0.3], [0.11, 0.1, 0.13]),
  )
  body.add(rider)
  g.add(body)

  const clips = [
    new THREE.AnimationClip('stand', 4.0, [
      num('body.position[y]', [0, 2.0, 4.0], [1.42, 1.435, 1.42]),
      num('neck.rotation[x]', [0, 2.0, 4.0], [0, 0.06, 0]),
      num('head.rotation[y]', [0, 1.4, 2.8, 4.0], [0, 0.3, -0.25, 0]),
    ]),
    new THREE.AnimationClip('walk', 1.6, [
      num('legFL.rotation[x]', [0, 0.4, 0.8, 1.2, 1.6], [0.4, 0, -0.4, 0, 0.4]),
      num('legFR.rotation[x]', [0, 0.4, 0.8, 1.2, 1.6], [-0.4, 0, 0.4, 0, -0.4]),
      num('legBL.rotation[x]', [0, 0.4, 0.8, 1.2, 1.6], [-0.4, 0, 0.4, 0, -0.4]),
      num('legBR.rotation[x]', [0, 0.4, 0.8, 1.2, 1.6], [0.4, 0, -0.4, 0, 0.4]),
      num('body.position[y]', [0, 0.4, 0.8, 1.2, 1.6], [1.42, 1.46, 1.42, 1.46, 1.42]),
      num('neck.rotation[x]', [0, 0.8, 1.6], [0.04, -0.04, 0.04]),
    ]),
    // Head up, ears forward, looking at something — the photograph.
    new THREE.AnimationClip('alert', 3.0, [
      num('neck.rotation[x]', [0, 0.7, 2.2, 3.0], [0, -0.34, -0.34, 0]),
      num('head.rotation[x]', [0, 0.7, 2.2, 3.0], [0, 0.2, 0.2, 0]),
      num('rider.rotation[x]', [0, 0.7, 2.2, 3.0], [0, -0.08, -0.08, 0]),
      num('body.position[y]', [0, 3.0], [1.42, 1.42]),
    ]),
  ]

  return { group: g, clips, bounds: boundsOf(g) }
}

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
  const shirtColor = pickFrom(outfitPalette.shirt)

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
  // oversized — big feet anchor a stylised figure and read at distance — and
  // with a sole, a toe cap and a turn-up at the hem, because a shoe that is one
  // box is a brick and a trouser leg that ends in nothing is a stick.
  for (const side of ['L', 'R'] as const) {
    const leg = g.getObjectByName(`leg${side}`) as THREE.Group
    const shoe = new THREE.Mesh(BOX, mat(shoeColor))
    shoe.scale.set(legW * 1.75, h * 0.05, h * 0.135)
    shoe.position.set(0, -legLen + h * 0.025, -h * 0.03)
    shoe.name = `shoe${side}`
    shoe.castShadow = true
    leg.add(shoe)

    leg.add(
      part(`sole${side}`, BOX, 0x14110e, [0, -legLen + h * 0.004, -h * 0.03], [legW * 1.82, h * 0.016, h * 0.14]),
      part(`toe${side}`, BOX, shoeColor, [0, -legLen + h * 0.03, -h * 0.088], [legW * 1.6, h * 0.036, h * 0.03]),
    )
    if (!outfit.shorts) {
      leg.add(
        // A turn-up is the same cloth in shadow, not a contrasting band.
        part(`hem${side}`, BOX, shadeOf(bottomColor, 0.78), [0, -legLen + h * 0.072, 0], [legW * 1.1, h * 0.026, legW * 1.08]),
      )
    }
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

  // Hands at the end of each arm, inside the pivot so they swing along, with a
  // cuff where the sleeve ends. The cuff is what stops an arm reading as one
  // undifferentiated tube from shoulder to fingertip.
  for (const side of ['L', 'R'] as const) {
    const arm = torsoGroup.getObjectByName(`arm${side}`) as THREE.Group
    const hand = new THREE.Mesh(BOX, mat(skin))
    hand.scale.set(armW * 1.6, h * 0.062, armW * 1.5)
    hand.position.set(0, -armLen * 0.86 - h * 0.022, 0)
    hand.name = `hand${side}`
    hand.castShadow = true
    arm.add(hand)

    if (!outfit.bareArms) {
      arm.add(
        part(
          `cuff${side}`,
          BOX,
          shirtColor,
          [0, -armLen * 0.86 + h * 0.012, 0],
          [armW * 1.22, h * 0.028, armW * 1.2],
        ),
      )
    }
  }

  // A collar and a belt: two thin bands that between them give a torso a top
  // and a middle. Both are cheap and both read from further away than any
  // amount of shaping does.
  torsoGroup.add(
    part(
      'collar',
      BOX,
      shirtColor,
      [0, rel(shoulderY) - h * 0.004, 0],
      [shoulderHalf * 1.92, h * 0.026, torsoDepth * 1.06],
    ),
  )
  if (!outfit.cropped && !outfit.skirt) {
    torsoGroup.add(
      part(
        'belt',
        BOX,
        0x1f1a16,
        [0, rel(hipY) + h * 0.028, 0],
        [waistHalf * 2.1, h * 0.022, torsoDepth * 1.04],
      ),
    )
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

  // A hat replaces the crown; it does not stack on top of it. Leaving both in
  // gives a head half again its proper height — the doorman read as a featureless
  // black slab from every angle because his cap sat on a full block of hair.
  const hatted = has('cap') || has('sunhat')

  if (!bald) {
    /**
     * Hair silhouettes, picked per person.
     *
     * The single biggest lever on whether a crowd reads as individuals. Jet Set
     * Radio characters are recognisable at a distance almost entirely by their
     * hair shape, not their face — so this is where the variety belongs.
     */
    // Rolled whether or not it's used, so a hat doesn't shift every later roll
    // and change the person's whole outfit.
    const styles = spec.hairStyles ?? [0, 1, 2, 3]
    const style = styles[Math.floor(rng() * styles.length)]!

    if (!hatted) {
      headMesh.add(part('hair', BOX, hairColor, [0, 0.44, 0.029], [1.1, 0.36, 1.09]))
    }

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
      if (!hatted) {
        for (let i = 0; i < 5; i++) {
          const a = (i / 4 - 0.5) * 1.5
          headMesh.add(
            part(`spike${i}`, CONE, hairColor,
              [Math.sin(a) * 0.42, 0.66 + Math.cos(a) * 0.1, -0.18 + Math.cos(a) * 0.12],
              [0.3, 0.55, 0.3], [(-a) * 0.5, 0, a * 0.9]),
          )
        }
      }
    } else {
      // Volume: a tall rounded mass.
      headMesh.add(part('hairBack', BOX, hairColor, [0, 0.1, 0.46], [1.12, 0.9, 0.32]))
      if (!hatted) {
        headMesh.add(part('hairTop', SPHERE, hairColor, [0, 0.52, 0.06], [1.32, 0.9, 1.3]))
      }
    }
  }
  if (has('cap')) {
    const capColor = pickFrom(spec.top)
    headMesh.add(
      // Seated down onto the skull so it doesn't hover.
      part('cap', BOX, capColor, [0, 0.42, 0], [1.12, 0.3, 1.12]),
      // At the brow, not the crown, and about a third of a head deep. The old
      // peak reached 0.82 of a head-length forward, which from the side read as
      // a plank rather than a cap.
      part('peak', BOX, capColor, [0, 0.29, -0.6], [0.96, 0.09, 0.42]),
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
  bicycle: buildBicycle,
  horse: buildHorse,
  bus: buildBus,
}

/**
 * Build a fresh model instance for a subject.
 *
 * Each call returns its own Group, because every subject animates independently
 * and so cannot share an Object3D. Geometry and materials *are* shared.
 */
export function buildModel(def: SubjectDef, seed = 0): BuiltModel {
  const built = BUILDERS[def.model](def, seed)
  // Hand adjustments from the part editor, applied on top of what the builder
  // produced. See partOverrides.ts.
  applyPartOverrides(built.group, def.species)
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

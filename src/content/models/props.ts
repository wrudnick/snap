import * as THREE from 'three'

import { furnitureSpec } from './environment'
import type { SectionKind } from '@/content/routes/types'

/**
 * Street furniture, buildable on its own so it can be looked at and edited.
 *
 * In the world these are instanced — every lamppost is one instance of a shared
 * box, every tree canopy one instance of a shared sphere — which is what keeps
 * a street of them affordable, and also what makes them impossible to inspect.
 * There is no object to select, because there is no object.
 *
 * So the same specs are assembled here into an ordinary group, one per kind.
 * What you see in the inspector is built from the same numbers the world uses,
 * so a canopy that looks wrong here looks wrong there.
 */

export interface PropModel {
  id: string
  label: string
  build: () => THREE.Object3D
}

const mat = (color: number) =>
  new THREE.MeshToonMaterial({ color: new THREE.Color(color) })

const BOX = new THREE.BoxGeometry(1, 1, 1)
const SPHERE = new THREE.SphereGeometry(0.5, 10, 8)

function piece(
  name: string,
  geometry: THREE.BufferGeometry,
  color: number,
  position: [number, number, number],
  scale: [number, number, number],
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, mat(color))
  mesh.name = name
  mesh.position.set(...position)
  mesh.scale.set(...scale)
  return mesh
}

/** Trunk plus a cluster of blobs, matching what `addCanopy` places. */
function tree(kind: SectionKind, shape: 0 | 1 | 2, label: string): PropModel {
  return {
    id: `tree-${label}`,
    label: `Tree — ${label}`,
    build: () => {
      const spec = furnitureSpec(kind)
      const group = new THREE.Group()
      if (!spec) return group

      group.add(
        piece('trunk', BOX, spec.poleColor, [0, spec.poleHeight / 2, 0], [
          spec.poleWidth,
          spec.poleHeight,
          spec.poleWidth,
        ]),
      )

      const [width, height] = spec.headSize
      const spread = shape === 1 ? 0.62 : shape === 2 ? 1.15 : 0.88
      const rise = shape === 1 ? 1.35 : shape === 2 ? 0.72 : 1.0

      // The same seven-lump arrangement the world uses, laid out evenly rather
      // than at random so the shape is readable.
      const lumps = 7
      for (let i = 0; i < lumps; i++) {
        const angle = (i / (lumps - 1)) * Math.PI * 2
        const reach = i === 0 ? 0 : 0.34 * width * spread
        const scale = (i === 0 ? 0.92 : 0.5 + (i % 3) * 0.12) * width * spread
        // The central mass is lifted by its own radius, not by the tree's
        // height — see addCanopy, which had the same gap for the same reason.
        const lift = i === 0 ? scale * 0.32 : height * (0.22 + (i % 3) * 0.16) * rise
        group.add(
          piece(
            `canopy${i}`,
            SPHERE,
            spec.headColor,
            [Math.cos(angle) * reach, spec.poleHeight + lift, Math.sin(angle) * reach],
            [scale, scale * 0.86, scale],
          ),
        )
      }
      return group
    },
  }
}

function fromFurniture(kind: SectionKind, id: string, label: string): PropModel {
  return {
    id,
    label,
    build: () => {
      const spec = furnitureSpec(kind)
      const group = new THREE.Group()
      if (!spec) return group
      group.add(
        piece('pole', BOX, spec.poleColor, [0, spec.poleHeight / 2, 0], [
          spec.poleWidth,
          spec.poleHeight,
          spec.poleWidth,
        ]),
        piece(
          'head',
          BOX,
          spec.headColor,
          [0, spec.poleHeight + spec.headSize[1] / 2, 0],
          spec.headSize,
        ),
      )
      return group
    },
  }
}

export const PROPS: PropModel[] = [
  tree('boutique', 0, 'round'),
  tree('boutique', 1, 'tall'),
  tree('park', 2, 'broad'),
  fromFurniture('avenue', 'lamppost', 'Lamppost'),
  fromFurniture('dining', 'awning', 'Awning'),
  fromFurniture('beach', 'beach-light', 'Beach light'),
  {
    id: 'string-lights',
    label: 'String lights',
    build: () => {
      const group = new THREE.Group()
      const HEIGHT = 4.6
      const SAG = 1.05
      const SPAN = 16
      for (const end of [-SPAN / 2, SPAN / 2]) {
        group.add(piece('pole', BOX, 0x241f1a, [0, HEIGHT / 2, end], [0.09, HEIGHT, 0.09]))
      }
      /**
       * The cable the bulbs hang from.
       *
       * Without it they are eight lights floating in a curve, which is the
       * shape of a string of lights and none of the reason it reads as one —
       * the black line between them is what the eye follows, and at dusk it is
       * the only part of this that is not glowing.
       *
       * Straight segments chorded along the same sag curve. The whole thing
       * lives in the YZ plane, so aligning a segment is one rotation about X:
       * a box's length runs down its own Z, and rotating that to (dy, dz) is
       * `atan2(dy, dz)`.
       */
      const onCurve = (u: number) =>
        new THREE.Vector3(0, HEIGHT - Math.sin(u * Math.PI) * SAG, -SPAN / 2 + u * SPAN)

      const SEGMENTS = 24
      for (let k = 0; k < SEGMENTS; k++) {
        const from = onCurve(k / SEGMENTS)
        const to = onCurve((k + 1) / SEGMENTS)
        const segment = new THREE.Mesh(BOX, mat(0x181512))
        segment.name = `cable${k}`
        segment.position.copy(from).add(to).multiplyScalar(0.5)
        segment.scale.set(0.035, 0.035, from.distanceTo(to))
        segment.rotation.x = Math.atan2(to.y - from.y, to.z - from.z)
        group.add(segment)
      }

      for (let b = 1; b < 9; b++) {
        const along = b / 9
        const on = onCurve(along)
        // Hung a little under the cable rather than centred on it.
        group.add(piece(`bulb${b}`, SPHERE, 0xffcf8a, [0, on.y - 0.14, on.z], [0.17, 0.17, 0.17]))
        group.add(piece(`lead${b}`, BOX, 0x181512, [0, on.y - 0.06, on.z], [0.022, 0.13, 0.022]))
      }
      return group
    },
  },
]

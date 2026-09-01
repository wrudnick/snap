import * as THREE from 'three'

import {
  BROWN_BRICK,
  GLASS,
  LIMESTONE,
  LIMESTONE_SHADE,
  RED_BRICK,
} from './landmarkArchetypes'
import {
  band,
  carve,
  extrudeRing,
  floorBands,
  gable,
  slotIn,
  mat,
  onWall,
  piers,
  slab,
  taperedSlab,
  wallWidth,
} from './landmarkKit'
import type { LandmarkSite } from './landmarkSites'

/**
 * The ones an archetype cannot carry.
 *
 * A parameterised tower covers most of this route honestly, because most of
 * this route genuinely is the same handful of building types. These eight are
 * not: each has a single feature that *is* the building, and a version without
 * it would be a lie dressed as filler.
 */

/**
 * 20 East Chestnut — Sofitel Chicago Magnificent Mile, 2002,
 * Jean-Paul Viguier.
 *
 * A prow. The plan is a triangle and the tower leans out over the street like
 * the bow of a ship, in flat white glass with no cornice at all — which on a
 * street of masonry boxes is the most conspicuous thing for several blocks.
 * Modelled as a three-sided prism so the prow is real geometry and catches its
 * own outline.
 */
export function sofitel(site: LandmarkSite): THREE.Object3D {
  const g = new THREE.Group()
  const [w, d] = site.size
  const h = site.height

  /**
   * A prow, and a *raked* one.
   *
   * Photographs settle what the first version missed: the plan is triangular
   * and one face leans — the prow edge rakes back as it rises, so the building
   * reads as a ship's bow cutting toward the street rather than as a wedge
   * standing straight up. A symmetric prism has the plan right and the
   * silhouette wrong, and the silhouette is the whole reason anyone notices it.
   *
   * Built from stacked triangular slices, each shifted a little further back
   * than the one below. Blunt, but it is the only way to get a raking face out
   * of prisms, and the outline pass draws every step.
   */
  const WHITE = 0xd9dde2
  const radius = Math.max(w, d) * 0.6
  const SLICES = 16
  const RAKE = radius * 0.5

  for (let i = 0; i < SLICES; i++) {
    const t = i / SLICES
    const sliceH = h / SLICES
    const r = radius * (1 - 0.1 * t)
    const slice = new THREE.Mesh(
      new THREE.CylinderGeometry(r, r, sliceH * 1.02, 3, 1),
      mat(WHITE),
    )
    slice.position.set(0, sliceH * (i + 0.5), -RAKE * t)
    slice.rotation.y = Math.PI / 2
    slice.castShadow = true
    slice.receiveShadow = true
    g.add(slice)

    // A glazed band at every second slice, so the shaft is not blank.
    if (i % 2 === 1) {
      const ring = new THREE.Mesh(
        new THREE.CylinderGeometry(r + 0.25, r + 0.25, sliceH * 0.42, 3, 1),
        mat(GLASS),
      )
      ring.position.set(0, sliceH * (i + 0.5), -RAKE * t)
      ring.rotation.y = Math.PI / 2
      g.add(ring)
    }
  }
  return g
}

/**
 * 103 East Chestnut — the Quigley Seminary chapel, 1918.
 *
 * A small French Gothic chapel modelled on the Sainte-Chapelle: a steep roof,
 * a slender flèche over the crossing, and buttresses between tall windows. It
 * is three storeys and it is the most ornamented thing on this list.
 */
export function quigley(site: LandmarkSite): THREE.Object3D {
  const g = new THREE.Group()
  const [, d] = site.size
  const [fullW, fullD] = site.bounds
  const wallH = 16
  const naveD = Math.min(fullD, d * 1.6)
  const STONE = 0xb9b5a4

  /**
   * The rose window is the building.
   *
   * St James Chapel is modelled on the Sainte-Chapelle and its street front is
   * one steep gable almost entirely filled by a great traceried circle, over a
   * deep pointed portal. The first version had a gable, buttresses and a flèche
   * and none of that — which is most of a Gothic chapel's face missing.
   *
   * Built as a recessed disc with radiating spokes rather than real tracery:
   * the outline pass draws every one of those edges, and at the distance this
   * is seen from the ring and the spokes are exactly what reads.
   */
  g.add(extrudeRing(site.localRing, 0, wallH, STONE))
  g.add(gable(fullW * 0.98, naveD, wallH, 11, 0x5a5148))
  g.add(piers(fullW * 0.96, wallH * 0.9, naveD, 0, Math.max(5, Math.round(fullW / 5)), 0xa9a494, 0.85))

  // The west front, stepped proud of the nave and carried up as a gable wall.
  const frontZ = -naveD / 2
  g.add(slab(fullW * 0.46, wallH + 11, 1.8, 0, STONE, [0, frontZ]))

  const rose = Math.min(fullW * 0.3, 9)
  const ring = new THREE.Mesh(
    new THREE.CylinderGeometry(rose / 2, rose / 2, 1.0, 16, 1),
    mat(0x6f6a5c),
  )
  ring.rotation.x = Math.PI / 2
  ring.position.set(0, wallH * 0.86, frontZ - 1.0)
  g.add(ring)
  const hub = new THREE.Mesh(
    new THREE.CylinderGeometry(rose * 0.13, rose * 0.13, 1.2, 10, 1),
    mat(STONE),
  )
  hub.rotation.x = Math.PI / 2
  hub.position.set(0, wallH * 0.86, frontZ - 1.1)
  g.add(hub)
  for (let i = 0; i < 8; i++) {
    const spoke = slab(0.5, rose * 0.92, 0.4, 0, STONE, [0, frontZ - 1.1])
    spoke.position.y = wallH * 0.86
    spoke.rotation.z = (i / 8) * Math.PI
    g.add(spoke)
  }

  // The portal beneath it, and pinnacles up the gable.
  g.add(slab(fullW * 0.2, wallH * 0.44, 0.9, 0, 0x554f44, [0, frontZ - 1.0]))
  for (const sx of [-1, 1]) {
    g.add(slab(1.5, 7, 1.5, wallH + 2, STONE, [sx * fullW * 0.22, frontZ]))
    g.add(slab(1.1, 4, 1.1, wallH + 9, STONE, [sx * fullW * 0.22, frontZ]))
  }

  // The flèche over the ridge.
  const spireMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.001, 1.5, 15, 6, 1),
    mat(0x5a5148),
  )
  spireMesh.position.y = wallH + 11 + 7
  g.add(spireMesh)
  g.add(slab(2.4, 3, 2.4, wallH + 11, 0x5a5148))
  return g
}

/**
 * 58 East Oak — the Esquire Theater, 1938.
 *
 * An Art Deco cinema, and cinemas are their signage: a vertical blade running
 * the height of the facade with the name down it, over a horizontal marquee
 * across the pavement. The building behind is a plain limestone box and
 * deliberately stays that way.
 */
export function esquire(site: LandmarkSite): THREE.Object3D {
  const g = new THREE.Group()
  const [fullW, fullD] = site.bounds
  const h = Math.max(site.height, 14)

  /**
   * The shopfronts are cut, not drawn on.
   *
   * A cinema at street level is glass, and the way to say so is to take the
   * stone away and put the glass in the hole. Standing a dark panel in front of
   * the wall - which is all this could do before - reads as a poster stuck to
   * the masonry.
   */
  let shell = extrudeRing(site.localRing, 0, h, 0xe0d8c4)
  const front = wallWidth(site, 'street')
  for (const side of [-1, 1]) {
    shell = carve(
      shell,
      slotIn(site, shell, 'street', {
        across: front * 0.24,
        height: 4.0,
        depth: 1.1,
        y: 0.5,
        along: side * front * 0.3,
      }),
    )
  }
  g.add(shell)
  for (const side of [-1, 1]) {
    g.add(
      onWall(site, 'street', {
        across: front * 0.24,
        height: 4.0,
        depth: 0.3,
        y: 0.5,
        along: side * front * 0.3,
        color: 0x3a4a5e,
      }),
    )
  }
  /**
   * The auditorium stands taller than the shops flanking it, so the front is a
   * raised centre bay rather than one flat parapet. On a lot this wide a single
   * extrusion reads as a pancake no matter what is stuck to the front of it.
   */
  g.add(slab(fullW * 0.46, h * 0.38, fullD * 0.88, h, 0xe0d8c4))
  g.add(band(fullW * 0.46, fullD * 0.88, h + h * 0.38, 0.6, 0.5, 0xc0b49c))

  // Streamline banding, horizontal and shallow.
  for (const y of [h * 0.6, h * 0.68, h * 0.76]) {
    g.add(band(fullW, fullD, y, 0.4, 0.3, 0xc0b49c))
  }
  /**
   * A cinema is its signage, and signage has to sit on the outside of the wall
   * that faces the street.
   *
   * Both halves of that were wrong. The marquee was measured off `size` — the
   * rectangle that fits inside the outline — while the mass is extruded from
   * the real footprint five metres deeper, so it was buried in the building and
   * the blade showed only as a stub standing on the roof. And it was hung off
   * local +Z, which for this building is the back: its street side is -Z. It
   * was an invisible marquee on the wrong wall. `onWall` names the wall instead of deriving it, and `intoWall` cuts.
   */
  const MARQUEE = 0xb8332f
  const lip = h * 0.3
  g.add(onWall(site, 'street', { across: fullW * 0.6, height: 2.0, depth: 3.4, y: lip, color: MARQUEE }))
  g.add(onWall(site, 'street', { across: fullW * 0.56, height: 0.5, depth: 3.0, y: lip - 0.7, color: 0xffe6b4 }))
  g.add(onWall(site, 'street', { across: fullW * 0.6, height: 0.45, depth: 3.8, y: lip + 2.0, color: 0xe8d9b8 }))

  /**
   * The blade carries the name, and it has to clear the raised centre bay —
   * a vertical sign that stops below the parapet behind it is just a pilaster.
   */
  const bladeY = h * 0.34
  const bladeTop = h + h * 0.38 + 5
  g.add(onWall(site, 'street', { across: 2.0, height: bladeTop - bladeY, depth: 2.6, y: bladeY, color: MARQUEE }))
  for (const sx of [-1, 0, 1]) {
    g.add(
      onWall(site, 'street', {
        across: 0.34,
        height: (bladeTop - bladeY) * 0.94,
        depth: 2.9,
        y: bladeY,
        color: 0xe8d9b8,
        along: sx * 0.6,
      }),
    )
  }
  g.add(onWall(site, 'street', { across: 2.6, height: 1.3, depth: 3.0, y: bladeTop, color: 0xe8d9b8 }))

  return g
}

/**
 * 120 East Bellevue — the Fortnightly of Chicago, 1892,
 * McKim, Mead & White.
 *
 * A Georgian townhouse, not a tower: red brick with limestone quoins, a
 * symmetrical five-bay front, a balustraded parapet and a slate hipped roof.
 * The only thing of its age and scale on the route, which is exactly why it
 * should not be filler.
 */
export function fortnightly(site: LandmarkSite): THREE.Object3D {
  const g = new THREE.Group()
  const [w, d] = site.size
  const h = Math.max(site.height, 16)

  g.add(extrudeRing(site.localRing, 0, 2.2, LIMESTONE))
  g.add(extrudeRing(site.localRing, 2.2, h - 2.2, RED_BRICK))
  g.add(floorBands(w * 0.98, h - 6, d * 0.98, 2.2, 4.4, LIMESTONE_SHADE))
  // Quoins: limestone blocks up both front corners.
  for (const sx of [-1, 1]) {
    g.add(slab(1.4, h - 3, 1.4, 2.2, LIMESTONE, [(sx * w) / 2, d / 2]))
  }
  /**
   * A cornice, a balustrade and a hipped roof.
   *
   * The balustrade was built with `crenellation`, which is a battlement — the
   * wrong century and the wrong building type entirely. A Georgian parapet is a
   * low run of balusters, and behind it the roof is hipped with dormers, which
   * is what stops a townhouse reading as an office block.
   */
  g.add(band(w, d, h - 1.6, 1.6, 1.1, LIMESTONE))
  const posts = Math.max(6, Math.round(w / 1.8))
  for (let i = 0; i < posts; i++) {
    const x = -w / 2 + (w * (i + 0.5)) / posts
    for (const z of [d / 2, -d / 2]) {
      g.add(slab(0.28, 1.3, 0.28, h, LIMESTONE_SHADE, [x, z]))
    }
  }
  g.add(band(w, d, h + 1.3, 0.35, 0.5, LIMESTONE))
  g.add(taperedSlab(w * 0.92, 4.5, d * 0.92, h + 1.6, 0.45, 0x5a5148))
  for (const sx of [-1, 0, 1]) {
    g.add(slab(1.6, 1.8, 1.2, h + 2.2, LIMESTONE, [sx * w * 0.24, d * 0.3]))
  }
  return g
}

/**
 * 163 East Walton — the Millennium Knickerbocker, 1927.
 *
 * A 1920s hotel whose top three storeys step back behind an arcade, so the
 * crown is open rather than solid — the detail that separates it from every
 * other brick hotel of its decade.
 */
export function knickerbocker(site: LandmarkSite): THREE.Object3D {
  const g = new THREE.Group()
  const [w, d] = site.size
  const h = site.height
  const baseH = Math.min(h * 0.16, 10)

  g.add(extrudeRing(site.localRing, 0, baseH, LIMESTONE))
  g.add(band(w, d, baseH, 0.9, 0.6, LIMESTONE_SHADE))
  const shaftH = h - baseH - 12
  g.add(slab(w * 0.97, shaftH, d * 0.97, baseH, BROWN_BRICK))
  g.add(floorBands(w * 0.97, shaftH - 4, d * 0.97, baseH, 3.6, 0x6d5344))
  g.add(band(w, d, baseH + shaftH, 1.6, 1.2, LIMESTONE))

  /**
   * The arcaded top: an open colonnade, not a wall with piers drawn on it.
   *
   * The recessed core behind the columns is what makes it read as open — a
   * solid block with fins on the outside is just a fluted block, and the whole
   * point of this crown is that you can see daylight through it.
   */
  const top = baseH + shaftH + 1.6
  g.add(slab(w * 0.72, 10, d * 0.72, top, 0x6d5344))
  const columns = Math.max(5, Math.round(w / 3.6))
  const pitch = (w * 0.86) / columns
  for (let i = 0; i < columns; i++) {
    const x = -(w * 0.86) / 2 + pitch * (i + 0.5)
    for (const z of [(d * 0.86) / 2, -(d * 0.86) / 2]) {
      g.add(slab(pitch * 0.34, 10, 0.9, top, LIMESTONE, [x, z]))
    }
  }
  g.add(band(w * 0.86, d * 0.86, top, 0.9, 0.5, LIMESTONE))
  g.add(band(w * 0.86, d * 0.86, top + 10, 2.2, 1.6, LIMESTONE))
  g.add(band(w * 0.78, d * 0.78, top + 12.2, 0.9, 0.6, LIMESTONE_SHADE))
  return g
}

/**
 * Oak Street Beach Café.
 *
 * A single-storey pavilion on the sand under Lake Shore Drive, and the first
 * building the player passes. Low, wide, open on the lake side, with a deck and
 * a flat canopy — nothing like anything else on the list.
 */
export function beachCafe(site: LandmarkSite): THREE.Object3D {
  const g = new THREE.Group()
  const [fullW, fullD] = site.bounds

  /**
   * The Beachstro, from a photograph, and it is nothing like the pale kiosk it
   * was.
   *
   * Mint-green painted timber with white *peaked* canvas canopies — not a flat
   * slab roof — and open sides with a lattice rail rather than glass. It is
   * also several linked pavilions rather than one box, which is what gives it
   * that scalloped run of white peaks along the sand. Those peaks are the first
   * built thing in the game and the only pitched roof on the beach.
   */
  const GREEN = 0x6fa89a
  const GREEN_DARK = 0x4e7d72
  const CANVAS = 0xeef0ea

  g.add(extrudeRing(site.localRing, 0, 0.45, 0xb8a684))

  const bays = Math.max(2, Math.round(fullW / 7))
  const pitch = fullW / bays
  for (let i = 0; i < bays; i++) {
    const x = -fullW / 2 + pitch * (i + 0.5)
    const bayW = pitch * 0.92
    const bayD = Math.min(fullD * 0.8, 8)

    // Deck rail, open above it.
    g.add(slab(bayW, 1.05, bayD, 0.45, GREEN, [x, 0]))
    g.add(slab(bayW * 0.88, 0.75, bayD * 0.86, 0.6, GREEN_DARK, [x, 0]))
    // Corner posts carrying the canopy.
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        g.add(
          slab(0.28, 3.1, 0.28, 0.45, GREEN, [
            x + (sx * bayW) / 2,
            (sz * bayD) / 2,
          ]),
        )
      }
    }
    // A peaked canvas roof per bay.
    g.add(gable(bayW * 1.12, bayD * 1.12, 3.55, 1.9, CANVAS).translateX(x))
    g.add(band(bayW * 1.12, bayD * 1.12, 3.5, 0.16, 0.1, GREEN))
  }
  return g
}

/**
 * 1040 North Lake Shore Drive — The Carlyle, 1963.
 *
 * A tall thin white concrete slab standing alone above the underpass, which is
 * the one thing you can see from inside the cut. Its face is a plain grid of
 * balconies and it is very nearly a rectangle, so what makes it read is the
 * proportion and the banding, not a crown.
 */
export function carlyle(site: LandmarkSite): THREE.Object3D {
  const g = new THREE.Group()
  const [w, d] = site.size
  const h = site.height
  const WHITE = 0xdad6c9
  const GLASS = 0x55677a

  /**
   * A white 1963 slab whose entire character is the depth of its balcony grid.
   *
   * The first attempt had it backwards. It built a white shaft and then put a
   * dark core *inside* it — geometry sealed within a solid box, drawing
   * nothing — and set the fins flush with the face, so the waffle had no
   * relief at all and the tower came out a blank white board with a faint grid
   * printed on it. The shaft has to be the dark glass, with the floor slabs and
   * fins standing well proud of it. On this building the relief is the design;
   * a balcony that projects a few centimetres is a pencil line, not a balcony.
   */
  g.add(extrudeRing(site.localRing, 0, 5, WHITE))
  g.add(slab(w * 0.9, h - 5, d * 0.9, 5, GLASS))
  g.add(floorBands(w * 0.9, h - 9, d * 0.9, 5, 3.4, WHITE, 1.3, 0.45))
  g.add(piers(w * 0.9, h - 9, d * 0.9, 5, Math.max(4, Math.round(w / 4)), WHITE, 1.2))
  /**
   * The end walls are solid concrete — the balconies stop short of them, which
   * is what gives the slab its framed look from the side.
   */
  for (const sx of [-1, 1]) {
    g.add(slab(1.8, h - 5, d * 0.98, 5, WHITE, [(sx * w * 0.9) / 2, 0]))
  }
  g.add(band(w * 0.94, d * 0.94, h - 2.5, 2.5, 1.0, WHITE))
  return g
}

/**
 * 179 East Lake Shore Drive — Drake Tower, 1929.
 *
 * A slim pre-war apartment tower next to the hotel, with a stepped brick crown.
 * OSM has no height for it at all; it is thirty storeys.
 */
export function drakeTower(site: LandmarkSite): THREE.Object3D {
  const g = new THREE.Group()
  const [w, d] = site.size
  const h = site.height
  const baseH = 8

  g.add(extrudeRing(site.localRing, 0, baseH, LIMESTONE))
  g.add(slab(w * 0.96, h - baseH - 8, d * 0.96, baseH, BROWN_BRICK))
  g.add(piers(w * 0.96, h - baseH - 12, d * 0.96, baseH + 2, Math.max(4, Math.round(w / 4)), 0x6d5344, 0.4))
  g.add(band(w, d, h - 8, 1.4, 1.0, LIMESTONE))
  /**
   * A stepped brick crown with corner piers carried above the parapet, which is
   * what 1920s apartment towers do instead of a cornice — the corners rise and
   * the middle steps back between them.
   */
  g.add(slab(w * 0.82, 6, d * 0.82, h - 8, BROWN_BRICK))
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(
        slab(w * 0.14, 9, w * 0.14, h - 8, BROWN_BRICK, [
          (sx * w * 0.82) / 2,
          (sz * d * 0.82) / 2,
        ]),
      )
    }
  }
  g.add(slab(w * 0.5, 5, d * 0.5, h - 2, BROWN_BRICK))
  g.add(band(w * 0.5, d * 0.5, h + 3, 1.1, 0.8, LIMESTONE))
  return g
}

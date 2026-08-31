import * as THREE from 'three'

import {
  BROWN_BRICK,
  GLASS,
  LIMESTONE,
  LIMESTONE_SHADE,
  RED_BRICK,
} from './landmarkArchetypes'
import { band, crenellation, floorBands, gable, mat, piers, slab } from './landmarkKit'
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
  const radius = Math.max(w, d) * 0.58

  const prism = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 0.92, radius, h, 3, 1),
    mat(0xd9dde2),
  )
  prism.position.y = h / 2
  prism.rotation.y = Math.PI / 2
  prism.castShadow = true
  prism.receiveShadow = true
  g.add(prism)

  // Storey banding round the prism, which is all the articulation it has.
  const rows = Math.floor(h / 7.2)
  for (let i = 1; i < rows; i++) {
    const t = i / rows
    const r = radius * (1 - 0.08 * t) + 0.2
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.35, 3, 1), mat(GLASS))
    ring.position.y = i * 7.2
    ring.rotation.y = Math.PI / 2
    g.add(ring)
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
  const [w, d] = site.size
  const wallH = 15
  const naveD = Math.min(d, w * 0.5)
  const STONE = 0xcdc4ac

  g.add(slab(w, wallH, naveD, 0, STONE))
  g.add(gable(w, naveD, wallH, 8, 0x5f5348))
  g.add(piers(w, wallH, naveD, 0, Math.max(4, Math.round(w / 5)), 0xbdb49c, 0.8))

  // The flèche — a slender spire over the ridge, which is the silhouette.
  const spire = new THREE.Mesh(
    new THREE.CylinderGeometry(0.001, 1.6, 14, 6, 1),
    mat(0x5f5348),
  )
  spire.position.y = wallH + 8 + 7
  g.add(spire)
  g.add(slab(2.6, 3, 2.6, wallH + 8, 0x5f5348))
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
  const [w, d] = site.size
  const h = Math.max(site.height, 12)

  g.add(slab(w, h, d, 0, 0xe0d8c4))
  // Streamline banding, horizontal and shallow.
  for (const y of [h * 0.55, h * 0.62, h * 0.69]) {
    g.add(band(w, d, y, 0.4, 0.25, 0xc0b49c))
  }
  // Marquee over the pavement.
  g.add(slab(w * 0.7, 1.3, 3.4, h * 0.34, 0xc23a35, [0, d / 2 + 1.5]))
  g.add(slab(w * 0.66, 0.5, 3.0, h * 0.34 - 0.5, 0xffe2a8, [0, d / 2 + 1.5]))
  // The blade, running past the parapet.
  g.add(slab(1.4, h * 0.95, 3.2, h * 0.3, 0xc23a35, [0, d / 2 + 1.7]))
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

  g.add(slab(w, 2.2, d, 0, LIMESTONE))
  g.add(slab(w * 0.98, h - 2.2, d * 0.98, 2.2, RED_BRICK))
  g.add(floorBands(w * 0.98, h - 6, d * 0.98, 2.2, 4.4, LIMESTONE_SHADE))
  // Quoins: limestone blocks up both front corners.
  for (const sx of [-1, 1]) {
    g.add(slab(1.4, h - 3, 1.4, 2.2, LIMESTONE, [(sx * w) / 2, d / 2]))
  }
  // A cornice and a balustrade above it.
  g.add(band(w, d, h - 1.6, 1.6, 1.1, LIMESTONE))
  g.add(crenellation(w, d, h, LIMESTONE_SHADE))
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

  g.add(slab(w, baseH, d, 0, LIMESTONE))
  g.add(band(w, d, baseH, 0.9, 0.6, LIMESTONE_SHADE))
  const shaftH = h - baseH - 12
  g.add(slab(w * 0.97, shaftH, d * 0.97, baseH, BROWN_BRICK))
  g.add(floorBands(w * 0.97, shaftH - 4, d * 0.97, baseH, 3.6, 0x6d5344))
  g.add(band(w, d, baseH + shaftH, 1.6, 1.2, LIMESTONE))

  // The arcaded top: a colonnade rather than a wall.
  const top = baseH + shaftH + 1.6
  g.add(slab(w * 0.86, 10, d * 0.86, top, LIMESTONE))
  g.add(piers(w * 0.86, 9, d * 0.86, top, Math.max(5, Math.round(w / 4)), LIMESTONE_SHADE, 0.6))
  g.add(band(w * 0.86, d * 0.86, top + 10, 1.8, 1.4, LIMESTONE))
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
  const [w, d] = site.size

  g.add(slab(w, 0.5, d, 0, 0xb08a5e))
  g.add(slab(w * 0.8, 3.4, d * 0.7, 0.5, 0xe4dccc))
  g.add(slab(w * 0.76, 2.2, d * 0.66, 0.9, GLASS))
  // Canopy on posts, out over the deck.
  g.add(slab(w, 0.4, d, 4.2, 0xd8d0bc))
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(slab(0.3, 4.2, 0.3, 0.5, 0x7a6a52, [(sx * w) / 2 - sx * 0.6, (sz * d) / 2 - sz * 0.6]))
    }
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

  g.add(slab(w, 5, d, 0, WHITE))
  g.add(slab(w * 0.96, h - 5, d * 0.96, 5, WHITE))
  // Recessed glazed strips between the balcony slabs.
  g.add(slab(w * 0.9, h - 12, d * 0.9, 6, 0x5e7285))
  g.add(floorBands(w * 0.96, h - 10, d * 0.96, 5, 3.6, WHITE))
  g.add(band(w * 0.96, d * 0.96, h - 2, 2, 0.7, WHITE))
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

  g.add(slab(w, baseH, d, 0, LIMESTONE))
  g.add(slab(w * 0.96, h - baseH - 8, d * 0.96, baseH, BROWN_BRICK))
  g.add(piers(w * 0.96, h - baseH - 12, d * 0.96, baseH + 2, Math.max(4, Math.round(w / 4)), 0x6d5344, 0.4))
  g.add(band(w, d, h - 8, 1.4, 1.0, LIMESTONE))
  // Stepped brick crown.
  g.add(slab(w * 0.78, 5, d * 0.78, h - 8, BROWN_BRICK))
  g.add(slab(w * 0.54, 4, d * 0.54, h - 3, BROWN_BRICK))
  g.add(band(w * 0.54, d * 0.54, h + 1, 1.0, 0.7, LIMESTONE))
  return g
}

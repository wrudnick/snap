import * as THREE from 'three'

import { band, extrudeRing, floorBands, piers, setbackStack, slab, taperedSlab } from './landmarkKit'
import type { LandmarkSite } from './landmarkSites'

/**
 * Building types, not buildings.
 *
 * Most of the fifty-two are not one-offs. Chicago's Gold Coast is four or five
 * typologies repeated: the 1920s masonry hotel with a heavy cornice, the
 * 1960s concrete apartment slab with balcony banding, the 1980s granite tower
 * with a stepped crown, the two-storey limestone shop. Writing fifty bespoke
 * functions would mostly be writing the same function fifty times with the
 * numbers moved, and each copy would be a place for a mistake to hide.
 *
 * So the typologies are parameterised and the character goes in the arguments —
 * a cornice depth, a crown, a colour, whether the balconies read horizontally
 * or the piers vertically. The genuinely singular buildings still get their own
 * function; there are about eight of those.
 */

export const LIMESTONE = 0xd8cfb8
export const LIMESTONE_SHADE = 0xc2b79c
export const RED_BRICK = 0x9c6a52
export const BROWN_BRICK = 0x7d6151
export const DARK_GRANITE = 0x4a4a50
export const PALE_CONCRETE = 0xc8c4b8
export const GREY_CONCRETE = 0x8a8880
export const GLASS = 0x51697d
export const BLUE_GLASS = 0x53708c

/**
 * A plausible tower floorplate on an over-large plot.
 *
 * OSM footprints are plots, not towers. On the Gold Coast a block is often
 * mapped as one polygon — 900 North Michigan's is 127 by 198 metres — and
 * extruding that to the tower's real height gives a slab several times the bulk
 * of the building it is meant to be. A residential or hotel floorplate is
 * around thirty metres across whatever the plot is; anything wider is podium.
 *
 * So a tall building on a big plot gets both: the podium fills the plot, and
 * the shaft above it is cut back to something a floorplate could actually be.
 * Buildings that genuinely fill their plot are unaffected, because the cap only
 * bites when the plot is bigger than the cap.
 */
export function floorplate(site: LandmarkSite): { width: number; depth: number } {
  const [w, d] = site.size
  // Taller buildings carry slightly larger plates — a 60-storey tower has a
  // bigger core and more units per floor than a 15-storey one.
  const cap = 30 + Math.min(16, site.height / 12)
  return { width: Math.min(w, cap), depth: Math.min(d, cap) }
}

export interface TowerOptions {
  /** Shaft colour. */
  color: number
  /** Trim, cornice and banding colour. */
  trim: number
  /** Fraction of height given to a wider base. */
  base?: number
  /** Horizontal balcony slabs — the 1960s look — instead of vertical piers. */
  balconies?: boolean
  /** A stepped crown, for anything post-1980. */
  crown?: 'flat' | 'stepped' | 'cornice' | 'mansard'
  /** Setback fraction at the top of the shaft. */
  setback?: number
}

/**
 * The workhorse: a residential or hotel tower with a base, a shaft and a top.
 *
 * Tripartite because nearly all of them are, and because a shaft that runs
 * straight from pavement to parapet reads as a chimney. Which of the two
 * rhythms it wears — horizontal balconies or vertical piers — does most of the
 * work of telling a 1960s tower from a 1920s one at a distance.
 */
export function towerBlock(site: LandmarkSite, o: TowerOptions): THREE.Object3D {
  const g = new THREE.Group()
  const [w, d] = site.size
  const h = site.height
  const plate = floorplate(site)
  // A podium only exists where the plot is wider than the tower needs. Where it
  // does, it is deeper than a plain base: it is the retail the tower sits on.
  const podium = plate.width < w * 0.95 || plate.depth < d * 0.95
  const baseH = podium
    ? Math.min(h * 0.18, 22)
    : Math.min(h * (o.base ?? 0.1), 14)
  const shaftTop = h - (o.crown === 'flat' ? 1.5 : 6)

  // The base follows the real outline; the shaft above keeps the fitted
  // rectangle. See extrudeRing.
  g.add(extrudeRing(site.localRing, 0, baseH, o.trim))
  g.add(band(w, d, baseH, 1.1, 0.7, o.trim))

  const setback = o.setback ?? 1
  const shaftW = plate.width * setback
  const shaftD = plate.depth * setback
  g.add(slab(shaftW, shaftTop - baseH, shaftD, baseH, o.color))

  if (o.balconies) {
    // A slab at every storey. The defining feature of the type — nothing else
    // on the street is banded that tightly.
    g.add(floorBands(shaftW, shaftTop - baseH - 2, shaftD, baseH, 3.6, o.trim))
  } else {
    g.add(
      piers(shaftW, shaftTop - baseH - 3, shaftD, baseH + 1.5,
        Math.max(4, Math.round(shaftW / 5)), o.trim, 0.45),
    )
    // A string course every few storeys, so the piers do not run unbroken.
    g.add(floorBands(shaftW, shaftTop - baseH - 4, shaftD, baseH, 14.4, o.trim))
  }

  switch (o.crown ?? 'cornice') {
    case 'cornice':
      g.add(band(shaftW, shaftD, h - 3, 3, 1.6, o.trim))
      g.add(band(shaftW, shaftD, h, 0.9, 0.9, o.color))
      break
    case 'stepped':
      g.add(setbackStack(shaftW * 0.9, shaftD * 0.9, shaftTop, h - shaftTop, 2, 0.72, o.color))
      break
    case 'mansard':
      g.add(taperedSlab(shaftW * 1.02, h - shaftTop, shaftD * 1.02, shaftTop, 0.5, o.trim))
      break
    case 'flat':
      g.add(band(shaftW, shaftD, h - 1.4, 1.4, 0.5, o.trim))
      break
  }
  return g
}

export interface ShopOptions {
  color: number
  trim: number
  /** A canopy over the pavement. */
  awning?: number
  /** A projecting sign blade, for a cinema or a bar. */
  blade?: number
}

/**
 * Two or three storeys of shopfront.
 *
 * Small, and they matter more than their size: these are the ones the player
 * walks past at arm's length, so a blank box here is far more conspicuous than
 * a blank box forty storeys up. Glazed at the ground, banded above, capped.
 */
export function shopFront(site: LandmarkSite, o: ShopOptions): THREE.Object3D {
  const g = new THREE.Group()
  const [w, d] = site.size
  const h = Math.max(site.height, 6)

  /**
   * Extruded whole, not just at the base: a two-storey shop *is* its plot, and
   * these are the buildings the player passes closest to.
   */
  g.add(extrudeRing(site.localRing, 0, h, o.color))
  // Recessed glazing at street level.
  g.add(slab(w * 0.94, Math.min(4.2, h * 0.55), d * 0.94, 0.4, GLASS))
  g.add(band(w, d, Math.min(4.6, h * 0.6), 0.8, 0.5, o.trim))
  if (h > 8) g.add(floorBands(w, h - 6, d, 4.6, 3.8, o.trim))
  g.add(band(w, d, h - 1.2, 1.2, 0.9, o.trim))

  if (o.awning !== undefined) {
    for (const side of [1, -1]) {
      const canopy = slab(w * 0.9, 0.35, 2.4, 3.4, o.awning, [0, (side * d) / 2 + 1.1])
      g.add(canopy)
    }
  }
  if (o.blade !== undefined) {
    // A vertical marquee blade on one corner — a cinema or a bar sign.
    g.add(slab(0.6, h * 0.8, 2.6, h * 0.35, o.blade, [w / 2 - 1, d / 2 + 1.2]))
  }
  return g
}

/**
 * A 1920s masonry hotel: limestone base, brick shaft, a cornice you can see
 * from the next block.
 *
 * The cornice is deliberately oversized. On the real buildings it is the whole
 * silhouette, and modelled to scale it disappears at the distance these are
 * actually looked at from.
 */
export function prewarHotel(
  site: LandmarkSite,
  brick: number,
  trim = LIMESTONE,
): THREE.Object3D {
  const g = new THREE.Group()
  const [w, d] = site.size
  const h = site.height
  const baseH = Math.min(h * 0.14, 11)

  const course = brick === RED_BRICK ? 0x8a5c46 : 0x6d5344

  g.add(extrudeRing(site.localRing, 0, baseH, trim))
  g.add(band(w, d, baseH, 1.0, 0.6, trim))

  /**
   * The light court, which is what these hotels have instead of a flat wall.
   *
   * It was a smaller box added in the middle of the shaft — the same brick,
   * shorter and narrower on every side, sealed inside and drawing nothing on
   * six buildings at once. A recess cannot be made by adding geometry. So the
   * shaft is built as two full-depth wings with a shallower block between
   * them, which notches both long faces at once, the way the real ones are
   * notched front and back.
   */
  const wing = w * 0.33
  const wingX = (w - wing) / 2
  for (const sx of [-1, 1]) {
    g.add(slab(wing, h - baseH, d * 0.97, baseH, brick, [sx * wingX, 0]))
    g.add(floorBands(wing, h - baseH - 6, d * 0.97, baseH, 3.6, course).translateX(sx * wingX))
  }
  g.add(slab(w - wing * 1.94, h - baseH, d * 0.62, baseH, brick))
  g.add(band(w, d, h - 2.4, 2.4, 1.9, trim))
  g.add(band(w, d, h, 0.9, 0.9, LIMESTONE_SHADE))
  return g
}

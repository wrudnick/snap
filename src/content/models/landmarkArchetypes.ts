import * as THREE from 'three'

import {
  band,
  carve,
  extrudeRing,
  floorBands,
  onWall,
  piers,
  slotIn,
  setbackStack,
  slab,
  taperedSlab,
  wallWidth,
} from './landmarkKit'
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
  const h = Math.max(site.height, 6)
  const [fullW, fullD] = site.bounds
  const street = wallWidth(site, 'street')
  const glazeH = Math.min(4.2, h * 0.55)
  const REVEAL = 0.9

  /**
   * Extruded whole, not just at the base: a two-storey shop *is* its plot.
   *
   * And then the shopfront is cut out of it. It used to be a glass box added
   * *inside* the extrusion — sealed in the solid, drawing nothing — so every
   * shop on the route had an invisible shopfront and presented a blank wall at
   * exactly the point where the player passes closest to it. The awnings went
   * the same way: hung off `±d / 2` where `d` is the inscribed rectangle, which
   * is inside the real footprint, so they were buried in the masonry too.
   */
  let shell = extrudeRing(site.localRing, 0, h, o.color)
  const opening = { across: street * 0.82, height: glazeH, depth: REVEAL, y: 0.5 }
  shell = carve(shell, slotIn(site, shell, 'street', opening))
  g.add(shell)

  // Glass at the back of the reveal, where it picks up the shadow of the head.
  g.add(onWall(site, 'street', {
    across: opening.across - 0.3,
    height: glazeH - 0.3,
    depth: 0.4,
    y: 0.6,
    set: 0.5,
    color: GLASS,
  }))
  // Mullions standing in the opening, on a shopfront rhythm rather than a
  // structural one — these are wide panes of glass with slim bars between.
  const bays = Math.max(2, Math.round(opening.across / 3.2))
  for (let i = 1; i < bays; i++) {
    g.add(onWall(site, 'street', {
      across: 0.22,
      height: glazeH - 0.2,
      depth: 0.5,
      y: 0.5,
      set: 0.2,
      along: -opening.across / 2 + (opening.across * i) / bays,
      color: o.trim,
    }))
  }
  /**
   * A lintel over the opening, and a cornice.
   *
   * Both kept tight to the wall. Sized off `bounds` with a generous overhang
   * they became shelves standing most of a metre off an irregular plot — a
   * two-storey shop wearing a cornice a tower would be embarrassed by.
   */
  g.add(onWall(site, 'street', {
    across: opening.across + 0.8,
    height: 0.7,
    depth: 0.55,
    y: glazeH + 0.1,
    color: o.trim,
  }))
  if (h > 8) g.add(floorBands(fullW * 0.98, h - 6, fullD * 0.98, glazeH + 1.4, 3.8, o.trim))
  g.add(band(fullW * 0.98, fullD * 0.98, h - 1.0, 1.0, 0.35, o.trim))

  if (o.awning !== undefined) {
    g.add(onWall(site, 'street', {
      across: street * 0.86,
      height: 0.35,
      depth: 2.4,
      y: glazeH + 1.1,
      color: o.awning,
    }))
  }
  if (o.blade !== undefined) {
    // A vertical sign on one end of the frontage — a cinema or a bar.
    g.add(onWall(site, 'street', {
      across: 0.6,
      height: h * 0.8,
      depth: 2.6,
      y: h * 0.35,
      along: street * 0.34,
      color: o.blade,
    }))
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
   * shaft was rebuilt as two full-depth wings with a shallower block between
   * them, which faked it. Now the notch is simply cut, front and back, which is
   * what a light court is: a slot taken out of the middle of the plan so the
   * inner rooms get a window.
   */
  const shaft = slab(w * 0.97, h - baseH, d * 0.97, baseH, brick)
  const courtW = w * 0.3
  const courtD = d * 0.2
  g.add(
    carve(
      shaft,
      ...(['street', 'back'] as const).map((wall) =>
        slotIn(site, shaft, wall, { across: courtW, height: h - baseH - 4, depth: courtD, y: baseH + 2 }),
      ),
    ),
  )
  for (const sx of [-1, 1]) {
    g.add(floorBands(w * 0.33, h - baseH - 6, d * 0.97, baseH, 3.6, course).translateX((sx * w * 0.64) / 2))
  }
  g.add(band(w, d, h - 2.4, 2.4, 1.9, trim))
  g.add(band(w, d, h, 0.9, 0.9, LIMESTONE_SHADE))
  return g
}

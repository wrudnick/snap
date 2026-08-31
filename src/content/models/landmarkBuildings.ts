import * as THREE from 'three'

import {
  band,
  crenellation,
  floorBands,
  gable,
  mat,
  piers,
  setbackStack,
  slab,
  taperedSlab,
} from './landmarkKit'
import {
  BROWN_BRICK,
  DARK_GRANITE,
  GLASS,
  LIMESTONE,
  LIMESTONE_SHADE,
  PALE_CONCRETE,
  RED_BRICK,
  floorplate,
  prewarHotel,
  shopFront,
  towerBlock,
  type ShopOptions,
  type TowerOptions,
} from './landmarkArchetypes'
import {
  beachCafe,
  carlyle,
  drakeTower,
  esquire,
  fortnightly,
  knickerbocker,
  quigley,
  sofitel,
} from './landmarkSpecials'
import type { LandmarkSite } from './landmarkSites'

/**
 * The buildings on this route, one at a time.
 *
 * Keyed by OSM way id, which is the only stable handle: names get retagged,
 * indexes shift on every re-extract, and coordinates typed in by hand go stale
 * the moment the map data changes. Everything about *where* a building stands —
 * its plan, its orientation, its height — comes from the same OSM record the
 * extruded city would have used, so the model and the hole it fills cannot
 * disagree. A builder here only says what the thing looks like.
 *
 * `levels` overrides OSM where OSM is missing or wrong. Nine of these buildings
 * carry no `building:levels` at all and default to a 11 m stub, which for the
 * Drake or a church tower is nonsense.
 *
 * On likeness: these are stylised block models in a flat-shaded, ink-outlined
 * art style, worked from the buildings' real massing and materials. They are
 * meant to be recognisable from across the street, not accurate to the window.
 */

export interface LandmarkBuilding {
  /** Display name. Real architecture, invented signage. */
  name: string
  /** Storeys, when OSM has none or has the wrong part of the block. */
  levels?: number
  build: (site: LandmarkSite) => THREE.Object3D
}

/** Storey height used when converting a level count to metres. */
const STOREY = 3.6


/**
 * 875 North Michigan Avenue — the John Hancock Center.
 *
 * Three things make it recognisable at any distance and it needs all three: the
 * taper (a 262 x 165 ft base narrowing to 100 x 56 ft), the exterior X-bracing,
 * and the twin antennas. Drop any one and it reads as a generic dark tower.
 *
 * The braces are the fiddly part: because the tower tapers, every level is a
 * different width, so each X is sized from the interpolated width at its own
 * height rather than stamped from a template.
 */
function hancock(site: LandmarkSite): THREE.Object3D {
  const g = new THREE.Group()
  const [w, d] = site.size
  const h = site.height
  const TAPER = 0.38

  g.add(taperedSlab(w, h, d, 0, TAPER, 0x2b2d33))

  // Ten braced bays up the shaft. Width at any height is the linear taper.
  const widthAt = (t: number) => w * (1 - (1 - TAPER) * t)
  const bays = 10
  for (let i = 0; i < bays; i++) {
    const t0 = 0.06 + (i / bays) * 0.88
    const t1 = 0.06 + ((i + 1) / bays) * 0.88
    const y0 = h * t0
    const y1 = h * t1
    const wMid = widthAt((t0 + t1) / 2)
    const rise = y1 - y0
    const diagonal = Math.hypot(wMid, rise)
    const angle = Math.atan2(rise, wMid)

    for (const z of [d / 2 * (1 - (1 - TAPER) * t0), -d / 2 * (1 - (1 - TAPER) * t0)]) {
      for (const sign of [1, -1]) {
        const brace = new THREE.Mesh(
          new THREE.BoxGeometry(diagonal, 1.5, 1.0),
          mat(0x585c66),
        )
        brace.position.set(0, (y0 + y1) / 2, z)
        brace.rotation.z = angle * sign
        brace.castShadow = true
        g.add(brace)
      }
      // The belt at each brace junction.
      g.add(slab(wMid, 1.4, 1.2, y0, 0x585c66, [0, z]))
    }
  }

  // Twin antennas.
  for (const x of [-widthAt(1) * 0.22, widthAt(1) * 0.22]) {
    g.add(slab(1.1, 100, 1.1, h, 0x585c66, [x, 0]))
  }
  return g
}

/**
 * 919 North Michigan — the Palmolive Building, 1929, Holabird & Root.
 *
 * One of the country's great setback skyscrapers: a broad limestone base
 * stepping back repeatedly to a slender central shaft, fluted the whole way up.
 * The Lindbergh Beacon on the roof is the other half of its identity — it swept
 * the sky to guide aircraft to Midway, and it is the thing you would notice at
 * dusk, which is when the route passes.
 */
function palmolive(site: LandmarkSite): THREE.Object3D {
  const g = new THREE.Group()
  const [w, d] = site.size
  const h = site.height

  // Base to about a third, then four setbacks to the tower.
  const baseH = h * 0.34
  g.add(slab(w, baseH, d, 0, LIMESTONE))
  g.add(piers(w, baseH - 4, d, 3, Math.max(4, Math.round(w / 6)), LIMESTONE_SHADE))
  g.add(band(w, d, baseH - 1.4, 1.4, 0.8, LIMESTONE_SHADE))

  g.add(setbackStack(w * 0.82, d * 0.82, baseH, h - baseH, 4, 0.78, LIMESTONE))

  // The beacon: a drum on the crown with a lit lens.
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.6, 4, 8), mat(LIMESTONE_SHADE))
  drum.position.y = h + 2
  g.add(drum)
  const lens = new THREE.Mesh(new THREE.SphereGeometry(1.7, 10, 8), mat(0xffe9b0))
  lens.position.y = h + 5
  g.add(lens)
  return g
}

/**
 * 140 East Walton — The Drake Hotel, 1920, Marshall & Fox.
 *
 * Italian Renaissance, and its silhouette is almost entirely one feature: a
 * very deep bracketed cornice capping a flat brick mass. The plan is a squat H,
 * which the OSM outline already gives; what has to be added is the cornice, the
 * limestone base and the rooftop sign, which has been there long enough to be
 * part of the building.
 *
 * OSM has no level count for it, so 13 comes from the building itself.
 */
function drakeHotel(site: LandmarkSite): THREE.Object3D {
  const g = new THREE.Group()
  const [w, d] = site.size
  const h = site.height

  const baseH = h * 0.16
  g.add(slab(w, baseH, d, 0, LIMESTONE))
  g.add(band(w, d, baseH, 1.0, 0.6, LIMESTONE_SHADE))
  g.add(slab(w * 0.98, h - baseH, d * 0.98, baseH, RED_BRICK))
  g.add(floorBands(w * 0.98, h - baseH - 4, d * 0.98, baseH, 3.6, 0x8a5c46))

  // The cornice, oversized on purpose — it is the whole silhouette.
  g.add(band(w, d, h - 2.6, 2.6, 2.2, LIMESTONE))
  g.add(band(w, d, h, 1.0, 1.0, LIMESTONE_SHADE))

  // Rooftop sign, both long faces.
  for (const z of [d / 2 + 0.6, -(d / 2 + 0.6)]) {
    g.add(slab(w * 0.42, 4.4, 0.5, h + 1.4, 0xc23a35, [0, z]))
  }
  return g
}

/**
 * 900 North Michigan, 1989, Kohn Pedersen Fox.
 *
 * The tell is the crown: four illuminated lantern-like pylons, one at each
 * corner of the top, which is what picks it out of the skyline at night. Below
 * that it is a granite shaft over a deep retail podium — the vertical Shops
 * mall — so the massing is a wide base and a narrower tower.
 *
 * OSM tags the block at 20 levels, which is the podium; the tower is 66.
 */
function nineHundred(site: LandmarkSite): THREE.Object3D {
  const g = new THREE.Group()
  const [w, d] = site.size
  const h = site.height

  const podiumH = h * 0.22
  g.add(slab(w, podiumH, d, 0, LIMESTONE))
  g.add(band(w, d, podiumH, 1.4, 1.0, LIMESTONE_SHADE))

  // The OSM outline is the whole block; the tower's plate is a fraction of it.
  const plate = floorplate(site)
  const towerW = plate.width
  const towerD = plate.depth
  const towerH = h - podiumH
  g.add(slab(towerW, towerH, towerD, podiumH, DARK_GRANITE))
  g.add(floorBands(towerW, towerH - 8, towerD, podiumH, 7.2, 0x3c3c42))
  // A setback near the top, then the lanterns above it.
  g.add(band(towerW, towerD, h - 14, 2.0, 1.2, LIMESTONE_SHADE))

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = sx * (towerW / 2 - 3)
      const z = sz * (towerD / 2 - 3)
      g.add(slab(5.5, 16, 5.5, h - 12, DARK_GRANITE, [x, z]))
      g.add(slab(4.2, 5, 4.2, h + 4, 0xffe2a8, [x, z]))
    }
  }
  return g
}

/**
 * 940-980 North Michigan — One Magnificent Mile, 1983, SOM / Bruce Graham.
 *
 * Three hexagonal tubes bundled together and stopped at different heights —
 * 57, 49 and 21 storeys — in rose granite. Nothing else on the avenue looks
 * remotely like it, and the whole of its identity is that stepped bundle, so
 * the tubes are modelled as actual hexagonal prisms rather than boxes.
 */
function oneMagnificentMile(site: LandmarkSite): THREE.Object3D {
  const g = new THREE.Group()
  const [w, d] = site.size
  const h = site.height
  const ROSE = 0xa8807a

  const tube = (radius: number, height: number, x: number, z: number) => {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, height, 6, 1),
      mat(ROSE),
    )
    mesh.position.set(x, height / 2, z)
    mesh.rotation.y = Math.PI / 6
    mesh.castShadow = true
    mesh.receiveShadow = true
    g.add(mesh)
    // Floor banding on the tube, so it is not a smooth column.
    const rows = Math.floor(height / 10)
    for (let i = 1; i < rows; i++) {
      const ring = new THREE.Mesh(
        new THREE.CylinderGeometry(radius + 0.25, radius + 0.25, 0.4, 6, 1),
        mat(0x8f6a66),
      )
      ring.position.set(x, i * 10, z)
      ring.rotation.y = Math.PI / 6
      g.add(ring)
    }
  }

  const r = Math.min(w, d) * 0.3
  tube(r, h, -r * 0.5, -r * 0.3)
  tube(r * 0.86, h * 0.86, r * 0.75, r * 0.2)
  tube(r * 0.8, h * 0.37, -r * 0.1, r * 0.95)
  return g
}

/**
 * 126 East Chestnut — Fourth Presbyterian Church, 1914, Ralph Adams Cram.
 *
 * Gothic Revival limestone, and the reason it matters here is that it is the
 * one low, horizontal, deeply-carved thing on a mile of towers — the route
 * passes it on Michigan. A long nave with a steep roof, a tall square bell
 * tower with corner pinnacles, and buttresses down the flank.
 *
 * OSM gives it no height at all, so this is authored: the nave is about 20 m
 * and the tower about 40.
 */
function fourthPresbyterian(site: LandmarkSite): THREE.Object3D {
  const g = new THREE.Group()
  const [w, d] = site.size
  const STONE = 0xcfc6ae
  const naveH = 17
  const naveD = Math.min(d, w * 0.42)

  g.add(slab(w, naveH, naveD, 0, STONE))
  g.add(gable(w, naveD, naveH, 6, 0x6b5f52))

  /**
   * Buttresses: slim, and stopping short of the eaves.
   *
   * The first pass ran full-height piers at the pier helper's default
   * thickness, which on a low building came out as a colonnade of fat columns
   * with the roof balanced on top. A buttress is a thin blade that dies into
   * the wall below the roofline.
   */
  const bays = Math.max(4, Math.round(w / 6))
  g.add(piers(w, naveH * 0.82, naveD, 0, bays, 0xc0b69e, 0.7))

  // Bell tower at the street end, crenellated, with corner pinnacles.
  const towerW = Math.min(naveD * 0.9, 11)
  const towerH = 40
  const towerX = -w / 2 + towerW * 0.65
  g.add(slab(towerW, towerH, towerW, 0, STONE, [towerX, 0]))
  // Offset onto the tower like everything else here — without the translate
  // this string course floated over the middle of the nave.
  g.add(band(towerW, towerW, towerH * 0.62, 0.9, 0.5, 0xc0b69e).translateX(towerX))
  // A tall lancet recess on each face, which is most of what says Gothic.
  for (const [ox, oz] of [[towerW / 2, 0], [-towerW / 2, 0], [0, towerW / 2], [0, -towerW / 2]] as const) {
    g.add(
      slab(ox === 0 ? towerW * 0.34 : 0.5, towerH * 0.3, oz === 0 ? 0.5 : towerW * 0.34,
        towerH * 0.3, 0x9c937f, [towerX + ox, oz]),
    )
  }
  g.add(crenellation(towerW, towerW, towerH, STONE).translateX(towerX))
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(
        slab(1.5, 5.5, 1.5, towerH, STONE, [
          towerX + sx * (towerW / 2 - 0.9),
          sz * (towerW / 2 - 0.9),
        ]),
      )
    }
  }
  return g
}

/**
 * 11 East Walton — Waldorf Astoria Chicago (the Elysian), 2009,
 * Lucien Lagrange.
 *
 * A deliberately old-fashioned tower: limestone, tripartite, and crowned with a
 * mansard rather than a flat parapet, which is what makes it read as French
 * rather than as another glass box. Two lower wings flank a central shaft.
 */
function waldorfAstoria(site: LandmarkSite): THREE.Object3D {
  const g = new THREE.Group()
  const [w, d] = site.size
  const h = site.height

  const baseH = h * 0.12
  g.add(slab(w, baseH, d, 0, LIMESTONE))
  g.add(band(w, d, baseH, 1.2, 0.9, LIMESTONE_SHADE))

  // Flanking wings, about half height.
  for (const sx of [-1, 1]) {
    g.add(slab(w * 0.3, h * 0.52, d * 0.8, baseH, LIMESTONE, [sx * w * 0.34, 0]))
  }

  const shaftW = w * 0.56
  const shaftH = h - baseH - 10
  g.add(slab(shaftW, shaftH, d * 0.9, baseH, LIMESTONE))
  g.add(piers(shaftW, shaftH - 6, d * 0.9, baseH + 2, Math.max(4, Math.round(shaftW / 5)), LIMESTONE_SHADE))
  g.add(band(shaftW, d * 0.9, baseH + shaftH, 1.6, 1.2, LIMESTONE_SHADE))

  // Mansard crown.
  g.add(taperedSlab(shaftW * 1.04, 10, d * 0.94, baseH + shaftH + 1.6, 0.45, 0x4f5560))
  return g
}

/**
 * 1030 North State — Newberry Plaza, 1974.
 *
 * A plain dark 1970s slab, and worth building precisely because it is: it is
 * the tall thing behind the Triangle, and a flat extruded box there reads as
 * unfinished. Concrete frame, recessed glass, a strong vertical rhythm from the
 * structural bays.
 */
function newberryPlaza(site: LandmarkSite): THREE.Object3D {
  const g = new THREE.Group()
  const [w, d] = site.size
  const h = site.height
  const CONCRETE = 0x8a8880

  g.add(slab(w, h, d, 0, CONCRETE))
  // Recessed glazed bays between the concrete piers.
  g.add(slab(w * 0.92, h - 8, d * 0.92, 4, GLASS))
  g.add(piers(w, h - 6, d, 3, Math.max(5, Math.round(w / 4.5)), CONCRETE, 0.7))
  g.add(band(w, d, h - 2, 2, 0.8, CONCRETE))
  return g
}

/**
 * 1000 North Lake Shore Drive — 1000 Lake Shore Plaza, 1964.
 *
 * A white modernist tower on the Drive, all horizontal balcony banding — which
 * is the opposite rhythm to everything else on this list and reads instantly
 * against the masonry towers inland.
 */
function lakeShorePlaza(site: LandmarkSite): THREE.Object3D {
  const g = new THREE.Group()
  const [w, d] = site.size
  const h = site.height
  const WHITE = 0xd6d4cc

  g.add(slab(w, h, d, 0, WHITE))
  g.add(slab(w * 0.94, h - 6, d * 0.94, 3, 0x5b6d7c))
  // Balcony slabs every storey — the defining feature.
  const rows = Math.floor((h - 8) / STOREY)
  for (let i = 1; i <= rows; i++) {
    g.add(band(w, d, 3 + i * STOREY, 0.55, 0.55, WHITE))
  }
  g.add(band(w, d, h - 2.5, 2.5, 0.9, WHITE))
  return g
}

/** A tower archetype, curried so the registry stays a table. */
const tower = (o: TowerOptions) => (site: LandmarkSite) => towerBlock(site, o)
const shop = (o: ShopOptions) => (site: LandmarkSite) => shopFront(site, o)
const hotel = (brick: number, trim?: number) => (site: LandmarkSite) =>
  prewarHotel(site, brick, trim)

/**
 * Every hand-authored building on the route.
 *
 * Read as a table on purpose. The interesting information is which typology
 * each building is and what makes it itself — not the arithmetic of its
 * massing, which lives in the archetypes.
 */
export const LANDMARK_BUILDINGS: Record<number, LandmarkBuilding> = {
  // — Michigan Avenue —
  31064573: { name: 'The Hancork', build: hancock },
  143756601: { name: 'Palmolive Building', build: palmolive },
  31064552: { name: '900 North Michigan', levels: 66, build: nineHundred },
  143758386: { name: 'One Magnificent Mile', build: oneMagnificentMile },
  129575948: { name: 'Fourth Presbyterian Church', levels: 5, build: fourthPresbyterian },
  148554645: {
    name: 'The Westin Michigan Avenue',
    build: tower({ color: 0x8f8b80, trim: PALE_CONCRETE, crown: 'flat', base: 0.09 }),
  },
  144020993: {
    name: 'The Walton Residence',
    build: tower({ color: LIMESTONE, trim: LIMESTONE_SHADE, crown: 'stepped', setback: 0.9 }),
  },
  144018863: { name: 'Millennium Knickerbocker', build: knickerbocker },

  // — East Lake Shore Drive —
  201603717: { name: '1000 Lake Shore Plaza', build: lakeShorePlaza },
  143773461: { name: 'The Drake Hotel', levels: 13, build: drakeHotel },
  144016878: { name: 'Drake Tower', levels: 30, build: drakeTower },

  // — Oak Street Beach —
  220408416: { name: 'Oak Street Beach Cafe', levels: 1, build: beachCafe },
  153734156: {
    name: '199 East Lake Shore Drive',
    build: hotel(BROWN_BRICK),
  },
  144016876: {
    name: 'The Mayfair',
    levels: 22,
    build: tower({ color: BROWN_BRICK, trim: LIMESTONE, crown: 'cornice' }),
  },

  // — The underpass —
  210680521: { name: 'The Carlyle', build: carlyle },
  210679333: { name: 'Fortnightly of Chicago', levels: 4, build: fortnightly },

  // — Delaware Place —
  144124764: {
    name: 'Michigan Place',
    build: tower({ color: PALE_CONCRETE, trim: 0xa8a498, balconies: true, crown: 'flat' }),
  },
  144015975: { name: 'The Whitehall Hotel', build: hotel(RED_BRICK) },
  144015987: {
    name: 'The Bristol',
    build: tower({ color: 0xb8b0a2, trim: LIMESTONE_SHADE, crown: 'stepped', setback: 0.88 }),
  },
  144015994: {
    name: '50 East Chestnut',
    build: tower({ color: 0x9b968a, trim: PALE_CONCRETE, balconies: true, crown: 'flat' }),
  },
  144016013: {
    name: 'Delaware Towers',
    build: tower({ color: BROWN_BRICK, trim: LIMESTONE, crown: 'cornice' }),
  },
  144015980: { name: 'Selina Hotel', build: hotel(RED_BRICK) },
  144015977: {
    name: 'Tremont Studios',
    levels: 12,
    build: tower({ color: BROWN_BRICK, trim: LIMESTONE, crown: 'cornice' }),
  },
  144016002: { name: 'Sofitel Chicago', build: sofitel },
  210680482: {
    name: 'One East Delaware',
    build: tower({ color: 0xa8a196, trim: PALE_CONCRETE, balconies: true, crown: 'flat' }),
  },
  144015971: {
    name: 'Elysees Condominiums',
    levels: 40,
    build: tower({ color: 0xb4ada0, trim: PALE_CONCRETE, balconies: true, crown: 'flat' }),
  },
  144015992: { name: 'Quigley Seminary', levels: 4, build: quigley },
  144016003: {
    name: 'America-Fore Building',
    build: tower({ color: LIMESTONE, trim: LIMESTONE_SHADE, crown: 'cornice', base: 0.16 }),
  },
  385480271: { name: "Jeni's Ice Creams", levels: 2, build: shop({ color: 0xd8ccb8, trim: LIMESTONE_SHADE, awning: 0xc4566a }) },

  // — Rush Street —
  153966977: { name: 'Waldorf Astoria', build: waldorfAstoria },
  210679211: { name: 'Newberry Plaza', build: newberryPlaza },
  210680490: { name: 'Prada', levels: 4, build: shop({ color: 0x2f3238, trim: 0x4a4e56 }) },
  210680518: {
    name: 'Thompson Chicago',
    build: tower({ color: 0x6f6a62, trim: 0x4f4b45, crown: 'flat', base: 0.12 }),
  },
  210679593: { name: 'Lululemon', levels: 2, build: shop({ color: 0xd4cdbb, trim: LIMESTONE_SHADE, awning: 0x3f6b8f }) },
  144124765: { name: 'The Talbott Hotel', build: hotel(RED_BRICK) },
  210680702: {
    name: '40 East Oak',
    build: tower({ color: 0xb0a898, trim: LIMESTONE_SHADE, crown: 'cornice' }),
  },
  210679144: { name: 'Esquire Theater', levels: 3, build: esquire },
  210679812: {
    name: '30 West Oak',
    build: tower({ color: 0x8e8a80, trim: PALE_CONCRETE, balconies: true, crown: 'flat' }),
  },

  // — The Triangle —
  210679228: { name: "Dublin's", levels: 2, build: shop({ color: 0x6b4a30, trim: 0x8f6c46, blade: 0x2f6f4f }) },
  380663491: { name: 'Urban Outfitters', levels: 3, build: shop({ color: 0xc4b8a2, trim: LIMESTONE_SHADE, awning: 0x24282c }) },
  445817830: {
    name: 'Viceroy Chicago',
    levels: 18,
    build: tower({ color: 0x8a7f6e, trim: LIMESTONE, crown: 'cornice', base: 0.14 }),
  },
  210679116: { name: 'Dearborn North Apartments', build: hotel(RED_BRICK) },
  210680450: {
    name: 'Maple Tower',
    build: tower({ color: 0x9c9182, trim: PALE_CONCRETE, balconies: true, crown: 'flat' }),
  },
  210680685: {
    name: '1111 North Dearborn',
    build: tower({ color: 0x8f8a7e, trim: PALE_CONCRETE, balconies: true, crown: 'flat' }),
  },
  210679635: { name: 'Elms Hotel', build: hotel(BROWN_BRICK) },
  210680687: {
    name: '1133 North Dearborn',
    build: tower({ color: 0xa39a8a, trim: PALE_CONCRETE, balconies: true, crown: 'flat' }),
  },
  304799197: {
    name: '4 East Elm',
    build: tower({ color: 0xb0a696, trim: LIMESTONE_SHADE, crown: 'stepped', setback: 0.9 }),
  },
  210679164: {
    name: '10 West Elm',
    build: tower({ color: 0x968f82, trim: PALE_CONCRETE, balconies: true, crown: 'flat' }),
  },

  // — The alley, and the block it runs behind —
  210679704: { name: 'The Original Pancake House', levels: 2, build: shop({ color: 0xb8845e, trim: LIMESTONE_SHADE, awning: 0xc23a35 }) },
  210680703: {
    name: '50 East Bellevue',
    build: tower({ color: 0x9a9284, trim: PALE_CONCRETE, balconies: true, crown: 'flat' }),
  },
  210680701: {
    name: '40 East Cedar',
    build: tower({ color: BROWN_BRICK, trim: LIMESTONE, crown: 'cornice' }),
  },
  210680695: {
    name: '20 East Cedar',
    build: tower({ color: RED_BRICK, trim: LIMESTONE, crown: 'cornice' }),
  },
}

/**
 * OSM ids the extruded city must skip, because a model stands there instead.
 *
 * Lives here rather than beside the scene builder to keep the import graph
 * acyclic: `city` needs this list, `landmarkSites` needs `city`, and the scene
 * builder needs both. This module reaches `landmarkSites` for a type only,
 * which is erased — so `city -> landmarkBuildings` adds no runtime edge.
 *
 * A cycle here would not fail loudly. Last time one appeared in this codebase
 * Vitest reported "no tests" for the file rather than an error, and the suite
 * quietly shrank by two.
 */
export const LANDMARK_IDS: ReadonlySet<number> = new Set(
  Object.keys(LANDMARK_BUILDINGS).map(Number),
)

/** Height a landmark should stand at, preferring an authored level count. */
export function heightOf(entry: LandmarkBuilding, site: LandmarkSite): number {
  return entry.levels ? entry.levels * STOREY : site.height
}

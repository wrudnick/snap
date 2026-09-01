import * as THREE from 'three'

import {
  band,
  extrudeRing,
  floorBands,
  gable,
  mat,
  piers,
  slab,
  spire,
  taperedSlab,
} from './landmarkKit'
import {
  BROWN_BRICK,
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

  /**
   * Worked from photographs, and they corrected two things.
   *
   * The shaft runs unbroken for about three fifths of the height rather than a
   * third, and its piers are continuous the whole way — full-height flutes, not
   * a banded base with a stack of boxes on top.
   *
   * And the setbacks cut the *corners*. The centre bays carry straight up while
   * the corners step in, which is what gives it the buttressed, candle-like
   * profile the building is known for. Concentric boxes shrinking uniformly —
   * which is what this was — read as a wedding cake, which is a different
   * building entirely.
   */
  const SHAFT = 0.6
  const shaftH = h * SHAFT
  const baseH = Math.min(h * 0.06, 9)

  g.add(extrudeRing(site.localRing, 0, baseH, LIMESTONE_SHADE))
  g.add(slab(w, shaftH, d, 0, LIMESTONE))
  g.add(piers(w, shaftH - baseH, d, baseH, Math.max(5, Math.round(w / 4.5)), LIMESTONE_SHADE, 0.6))
  g.add(band(w, d, shaftH, 1.2, 0.7, LIMESTONE_SHADE))

  /**
   * Four corner steps, each taking a bite out of the plan while the centre
   * continues. Each tier is shorter than the last, which is what makes the
   * profile accelerate toward the crown instead of stepping evenly.
   */
  let tierW = w
  let tierD = d
  let y = shaftH
  let remaining = h - shaftH
  for (let tier = 0; tier < 4; tier++) {
    const share = remaining * (tier === 3 ? 1 : 0.42)
    tierW *= 0.82
    tierD *= 0.86
    g.add(slab(tierW, share, tierD, y, LIMESTONE))
    g.add(piers(tierW, share - 1, tierD, y, Math.max(3, Math.round(tierW / 4.5)), LIMESTONE_SHADE, 0.5))
    g.add(band(tierW, tierD, y + share - 0.8, 0.9, 0.6, LIMESTONE_SHADE))
    y += share
    remaining -= share
  }

  // The crown: a slim shaft carrying the Lindbergh beacon, which swept the sky
  // for aircraft and is the half of its identity that is not the setbacks.
  const crownW = tierW * 0.42
  g.add(slab(crownW, 10, crownW, h, LIMESTONE))
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(crownW * 0.34, crownW * 0.42, 4, 8), mat(LIMESTONE_SHADE))
  drum.position.y = h + 12
  g.add(drum)
  const lens = new THREE.Mesh(new THREE.SphereGeometry(crownW * 0.28, 10, 8), mat(0xffe9b0))
  lens.position.y = h + 15
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
  g.add(extrudeRing(site.localRing, 0, baseH, LIMESTONE))
  g.add(band(w, d, baseH, 1.0, 0.6, LIMESTONE_SHADE))
  /**
   * Buff brick, not red.
   *
   * Photographs settle it: the Drake is a warm cream-tan, close to its
   * limestone base rather than contrasting with it. Modelled in red brick it
   * read as a different and much cheaper building.
   */
  const DRAKE_BRICK = 0xc9b492
  g.add(slab(w * 0.98, h - baseH, d * 0.98, baseH, DRAKE_BRICK))
  g.add(floorBands(w * 0.98, h - baseH - 4, d * 0.98, baseH, 3.6, 0xac9878))

  // A light court cut into the long faces: the plan is a U, not a block.
  g.add(slab(w * 0.34, h - baseH - 2, d * 0.42, baseH, DRAKE_BRICK, [0, d * 0.28]))

  /**
   * The cornice, oversized on purpose — it is the whole silhouette, and
   * modelled to scale it vanishes at the distance this is looked at from. Dark
   * rather than pale: it reads as a deep shadow under a heavy overhang.
   */
  g.add(band(w, d, h - 3.4, 3.4, 2.6, 0x6b5f4c))
  g.add(band(w, d, h, 1.2, 1.2, LIMESTONE_SHADE))

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
  g.add(extrudeRing(site.localRing, 0, podiumH, LIMESTONE))
  g.add(band(w, d, podiumH, 1.4, 1.0, LIMESTONE_SHADE))

  // The OSM outline is the whole block; the tower's plate is a fraction of it.
  const plate = floorplate(site)
  const towerW = plate.width
  const towerD = plate.depth
  /**
   * Pale stone, not dark granite.
   *
   * The photographs are unambiguous and I had it wrong: it is a light grey-beige
   * limestone with darker recessed window bands, which is why it reads as part
   * of the avenue's masonry rather than as a black tower.
   */
  const STONE = 0xbfb8a8
  const towerH = h - podiumH
  g.add(slab(towerW, towerH, towerD, podiumH, STONE))
  g.add(slab(towerW * 0.9, towerH - 6, towerD * 0.9, podiumH, 0x6e7480))
  g.add(piers(towerW, towerH - 8, towerD, podiumH, Math.max(4, Math.round(towerW / 5)), STONE, 0.7))
  g.add(floorBands(towerW, towerH - 10, towerD, podiumH, 10.8, STONE))
  // A setback near the top, then the lanterns above it.
  g.add(band(towerW, towerD, h - 18, 2.2, 1.4, STONE))

  /**
   * The four corner lanterns, which are what picks it out of the skyline at
   * night — taller and heavier than the first pass had them, because at this
   * scale a small one disappears.
   */
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = sx * (towerW / 2 - 2.5)
      const z = sz * (towerD / 2 - 2.5)
      g.add(slab(6.5, 24, 6.5, h - 18, STONE, [x, z]))
      g.add(slab(5.0, 7, 5.0, h + 6, 0xffe2a8, [x, z]))
      g.add(slab(3.0, 3, 3.0, h + 13, STONE, [x, z]))
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
  // Rose granite, but far paler in daylight than the first pass had it — the
  // photographs read as a warm beige-grey, not a brown.
  const ROSE = 0xc0a89c

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
        mat(0xa89086),
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
  /**
   * Worked from photographs of the Michigan Avenue front, which corrected the
   * two things that decide whether it reads as a church at all.
   *
   * The tower ends in a *spire* over an open lantern, not the crenellated
   * parapet the first version had — that is a castle. And the street front is a
   * gable end with one great pointed arch and a deep recessed portal under it,
   * which is the face the player actually walks past; the long flank with its
   * buttresses is the side you see afterwards.
   *
   * The stone is a weathered grey-green rather than clean limestone: the real
   * one is half covered in ivy.
   */
  const STONE = 0xc6c3ac
  const naveH = 17
  // Sized from what the building actually covers, not from the rectangle that
  // fits inside it — a roof has to span the walls it sits on.
  const [fullW, fullD] = site.bounds
  const naveD = Math.min(fullD, fullW * 0.5)

  g.add(extrudeRing(site.localRing, 0, naveH, STONE))
  g.add(gable(fullW * 0.98, naveD, naveH, 8, 0x6b6152))

  // Buttresses down the flanks, dying into the wall below the eaves.
  const bays = Math.max(4, Math.round(fullW / 6))
  g.add(piers(fullW * 0.96, naveH * 0.84, naveD, 0, bays, 0xb4b199, 0.75))

  /**
   * The west front: a gable wall carrying a great arch, stepped forward of the
   * nave so it casts its own shadow.
   */
  const frontZ = -naveD / 2
  g.add(slab(fullW * 0.5, naveH + 8, 1.8, 0, STONE, [0, frontZ]))
  // The arch, as a recess rather than a true opening — at this scale the
  // shadow is the whole of it.
  g.add(slab(fullW * 0.28, naveH * 0.74, 0.8, 2, 0x6f6a5c, [0, frontZ - 0.7]))
  g.add(slab(fullW * 0.16, naveH * 0.34, 0.8, 0, 0x4a4438, [0, frontZ - 1.0]))
  // Pinnacles along the front parapet.
  for (const sx of [-1, 1]) {
    g.add(slab(1.8, 6, 1.8, naveH + 8, STONE, [sx * fullW * 0.23, frontZ]))
  }

  /**
   * The tower, at the street corner beside the front, with the lantern and
   * spire that make the silhouette.
   */
  const towerW = Math.min(naveD * 0.8, 12)
  const towerH = 38
  const towerX = -fullW / 2 + towerW * 0.6
  g.add(slab(towerW, towerH, towerW, 0, STONE, [towerX, frontZ * 0.4]))
  g.add(
    band(towerW, towerW, towerH * 0.55, 0.9, 0.5, 0xb4b199).translateX(towerX)
      .translateZ(frontZ * 0.4),
  )
  // Tall lancet recesses, which is most of what says Gothic at a distance.
  for (const [ox, oz] of [[towerW / 2, 0], [-towerW / 2, 0], [0, towerW / 2], [0, -towerW / 2]] as const) {
    g.add(
      slab(ox === 0 ? towerW * 0.3 : 0.5, towerH * 0.28, oz === 0 ? 0.5 : towerW * 0.3,
        towerH * 0.34, 0x8f8a76, [towerX + ox, frontZ * 0.4 + oz]),
    )
  }
  const crown = spire(towerW, towerH, 6, 13, STONE)
  crown.position.set(towerX, 0, frontZ * 0.4)
  g.add(crown)
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

  /**
   * From photographs, and the first version had the crown wrong and was missing
   * the feature that actually identifies it.
   *
   * It is pale limestone with *dark projecting bay windows* running in
   * continuous vertical stripes up the shaft — that contrast is what you see
   * from the street, far more than any moulding. And the top is a series of
   * setbacks with the corners cut away, stepping to a chamfered cap. A mansard,
   * which is what I gave it, belongs on a different building.
   */
  const BAY = 0x4e5158
  const baseH = Math.min(h * 0.09, 12)

  g.add(extrudeRing(site.localRing, 0, baseH, LIMESTONE))
  g.add(band(w, d, baseH, 1.2, 0.9, LIMESTONE_SHADE))

  // Two tiers of setback, each cutting the corners.
  const tiers: Array<[number, number, number]> = [
    [1.0, baseH, h * 0.46],
    [0.78, h * 0.46, h * 0.82],
    [0.6, h * 0.82, h],
  ]
  for (const [scale, from, to] of tiers) {
    const tw = w * scale
    const td = d * scale
    g.add(slab(tw, to - from, td, from, LIMESTONE))
    g.add(piers(tw, to - from - 1, td, from, Math.max(4, Math.round(tw / 4.5)), LIMESTONE_SHADE, 0.5))
    // Dark bays: continuous vertical stripes, four to a face.
    for (let i = 0; i < 4; i++) {
      const x = -tw / 2 + (tw * (i + 0.5)) / 4
      for (const z of [td / 2, -td / 2]) {
        g.add(slab(tw * 0.1, to - from - 2, 1.1, from + 1, BAY, [x, z]))
      }
    }
    // Chamfered corners: a diagonal post at each, so the step reads as cut.
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const post = slab(tw * 0.16, to - from, tw * 0.16, from, LIMESTONE, [
          (sx * tw) / 2,
          (sz * td) / 2,
        ])
        post.rotation.y = Math.PI / 4
        g.add(post)
      }
    }
    g.add(band(tw, td, to - 1.2, 1.4, 1.0, LIMESTONE_SHADE))
  }

  // A chamfered cap rather than a pitched roof.
  g.add(taperedSlab(w * 0.6, 7, d * 0.6, h, 0.55, LIMESTONE_SHADE))
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

  g.add(extrudeRing(site.localRing, 0, 5, CONCRETE))
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

  g.add(extrudeRing(site.localRing, 0, 5, WHITE))
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

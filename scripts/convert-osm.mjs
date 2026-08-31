/**
 * Convert an Overpass export into the compact local-coordinate form the game
 * loads.
 *
 * OSM gives WGS84 lat/lon; the game works in metres with the origin at Michigan
 * Avenue & Oak Street, +X east and −Z north. The projection is a local
 * equirectangular approximation, which over the ~2 km this route spans is
 * accurate to well under a metre — far below the scale anything here is
 * modelled at.
 *
 * Run: node scripts/convert-osm.mjs <overpass.json> <out.json>
 *
 * Takes one Overpass export containing both buildings and highways, queried
 * with `out body geom` so ways carry their coordinates inline.
 */
import { readFileSync, writeFileSync } from 'node:fs'

// Michigan Avenue & Oak Street. Verified against OSM: the two ways share a node.
const LAT0 = 41.900814
const LON0 = -87.624279

const M_PER_DEG_LAT = 111320
const M_PER_DEG_LON = 111320 * Math.cos((LAT0 * Math.PI) / 180)

const toLocal = (lat, lon) => [
  (lon - LON0) * M_PER_DEG_LON,
  -(lat - LAT0) * M_PER_DEG_LAT,
]

/** Metres of storey height when only `building:levels` is tagged. */
const STOREY = 3.6

function heightOf(tags = {}) {
  const raw = tags.height ?? tags['building:height']
  if (raw) {
    const n = parseFloat(String(raw).replace(/[^0-9.]/g, ''))
    if (Number.isFinite(n) && n > 0) return n
  }
  const levels = parseFloat(tags['building:levels'])
  if (Number.isFinite(levels) && levels > 0) return levels * STOREY
  // Unknown: a low commercial block. Better than omitting the building.
  return 11
}

/** Drop points that barely change the outline, and cap the vertex count. */
function simplify(points, tolerance = 1.2, maxPoints = 24) {
  const out = []
  for (const p of points) {
    const last = out[out.length - 1]
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > tolerance) out.push(p)
  }
  // OSM closes rings by repeating the first point; the extruder doesn't want it.
  if (out.length > 1) {
    const [fx, fz] = out[0]
    const [lx, lz] = out[out.length - 1]
    if (Math.hypot(fx - lx, fz - lz) < tolerance) out.pop()
  }
  if (out.length <= maxPoints) return out
  // Keep shape by sampling evenly rather than truncating.
  const step = out.length / maxPoints
  return Array.from({ length: maxPoints }, (_, i) => out[Math.floor(i * step)])
}

function signedArea(ring) {
  let a = 0
  for (let i = 0; i < ring.length; i++) {
    const [x1, z1] = ring[i]
    const [x2, z2] = ring[(i + 1) % ring.length]
    a += x1 * z2 - x2 * z1
  }
  return a / 2
}

const [, , rawPath, outPath] = process.argv

const elements = JSON.parse(readFileSync(rawPath, 'utf8')).elements ?? []
const buildings = elements.filter((e) => e.tags?.building)
const streets = elements.filter((e) => e.tags?.highway)

/**
 * A relation's outline.
 *
 * Multipolygon buildings carry their geometry on their members rather than on
 * themselves; the outer way is the outline. Courtyards are ignored — the
 * extruder takes a single ring, and a hole in a footprint is invisible from the
 * street anyway.
 */
function outline(el) {
  if (el.geometry) return el.geometry
  const outer = (el.members ?? []).find((m) => m.role === 'outer' && m.geometry)
  return outer?.geometry ?? null
}

/**
 * The building's kind, reduced to the handful the facade archetypes care about.
 *
 * OSM's `building` key is open-ended and its long tail is noise for our
 * purposes: `yes` is half of everything and means only "a building is here".
 * Mapping to a closed set keeps the archetype table honest, and anything
 * unrecognised falls through to the generic filler on purpose.
 */
function kindOf(tags) {
  const b = tags.building
  if (b === 'apartments' || b === 'residential' || b === 'terrace') return 'apartments'
  if (b === 'hotel') return 'hotel'
  if (b === 'office' || b === 'commercial') return 'office'
  if (b === 'retail') return 'retail'
  if (b === 'church' || b === 'cathedral' || b === 'chapel') return 'church'
  if (b === 'house' || b === 'detached') return 'house'
  if (b === 'university' || b === 'college' || b === 'school') return 'institution'
  if (b === 'parking' || b === 'garage' || b === 'service') return 'utility'
  return 'generic'
}

function levelsOf(tags) {
  const n = parseFloat(tags['building:levels'])
  return Number.isFinite(n) && n > 0 && n < 150 ? Math.round(n) : undefined
}

// Keep what the route can actually see. Generous east/west, and far enough
// south to include the river towers the Michigan corridor looks toward.
const BOUNDS = { minX: -700, maxX: 700, minZ: -400, maxZ: 1600 }

const outBuildings = []
for (const el of buildings) {
  // A roof-only structure — a canopy, a bus shelter, a petrol station awning.
  // Extruding it from the ground makes a solid box where there is open air.
  if (el.tags.building === 'roof') continue

  const geometry = outline(el)
  if (!geometry || geometry.length < 4) continue

  const ring = simplify(geometry.map((p) => toLocal(p.lat, p.lon)))
  if (ring.length < 3) continue

  let cx = 0
  let cz = 0
  for (const [x, z] of ring) {
    cx += x
    cz += z
  }
  cx /= ring.length
  cz /= ring.length

  if (cx < BOUNDS.minX || cx > BOUNDS.maxX || cz < BOUNDS.minZ || cz > BOUNDS.maxZ) continue

  const area = Math.abs(signedArea(ring))
  // Sheds, kiosks and mapping noise; below this they are visual clutter.
  if (area < 40) continue

  const tags = el.tags ?? {}
  outBuildings.push({
    i: el.id,
    n: tags.name ?? undefined,
    h: Math.round(heightOf(tags) * 10) / 10,
    // Storeys as tagged, where they are. The single most useful facade fact in
    // OSM: it puts every window row on a real floor instead of on a guess made
    // by dividing height by an assumed storey.
    l: levelsOf(tags),
    // What kind of building it is, for picking an archetype.
    t: kindOf(tags),
    // Notable enough to have an encyclopaedia entry — a cheap, honest signal
    // for which buildings are worth hand-authoring a likeness of.
    k: tags.wikidata || tags.wikipedia ? 1 : undefined,
    // Winding normalised so the extruder always sees the same orientation.
    r: (signedArea(ring) < 0 ? [...ring].reverse() : ring).map(([x, z]) => [
      Math.round(x * 10) / 10,
      Math.round(z * 10) / 10,
    ]),
  })
}

const KEEP_STREETS =
  /^(North Michigan Avenue|East Oak Street|West Oak Street|North Rush Street|East Walton Place|East Walton Street|East Bellevue Place|North State Street|North State Parkway|North Wabash Avenue|East Chestnut Street|East Delaware Place|East Superior Street|East Huron Street|East Erie Street|East Ontario Street|East Ohio Street|East Grand Avenue|East Illinois Street|North Jean Baptiste Point DuSable Lake Shore Drive|East Lake Shore Drive|East Cedar Street|East Elm Street|East Division Street)$/

const outStreets = []
for (const el of streets) {
  const name = el.tags?.name
  if (!name || !KEEP_STREETS.test(name)) continue
  if (!el.geometry || el.geometry.length < 2) continue

  const line = simplify(el.geometry.map((p) => toLocal(p.lat, p.lon)), 3, 64)
  if (line.length < 2) continue

  outStreets.push({
    n: name,
    p: line.map(([x, z]) => [Math.round(x * 10) / 10, Math.round(z * 10) / 10]),
  })
}

const result = {
  origin: { lat: LAT0, lon: LON0 },
  note: 'Local metres. +X east, -Z north. Origin: Michigan Ave & Oak St.',
  buildings: outBuildings,
  streets: outStreets,
}

writeFileSync(outPath, JSON.stringify(result))
const named = outBuildings.filter((b) => b.n).length
console.log(
  `buildings ${outBuildings.length} (named ${named}) · streets ${outStreets.length} · ` +
    `${(JSON.stringify(result).length / 1024).toFixed(0)} KB`,
)

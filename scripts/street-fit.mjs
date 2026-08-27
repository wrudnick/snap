/**
 * Fit route legs to real street centrelines.
 *
 * The route was authored by address arithmetic before the OSM import, so its
 * waypoints sit close to the right streets but not on them — close enough that
 * several fall inside real building footprints. This walks the actual
 * centrelines instead and prints waypoints that follow them.
 */
import { readFileSync } from 'node:fs'

const city = JSON.parse(readFileSync('src/content/geo/goldcoast.json', 'utf8'))

/** All points of every way carrying a given street name. */
const ptsFor = (...names) =>
  city.streets.filter((s) => names.includes(s.n)).flatMap((s) => s.p)

/** Nearest point between two streets — their intersection. */
function intersection(a, b) {
  let best = null
  for (const p of a) {
    for (const q of b) {
      const d = Math.hypot(p[0] - q[0], p[1] - q[1])
      if (!best || d < best.d) best = { d, x: (p[0] + q[0]) / 2, z: (p[1] + q[1]) / 2 }
    }
  }
  return best
}

/**
 * Sample a street between two points.
 *
 * Streets arrive as many unordered ways, so ordering by projection onto the
 * start→end vector is more reliable than trying to stitch the ways together.
 */
function legAlong(streetPts, from, to, count) {
  const dx = to.x - from.x
  const dz = to.z - from.z
  const len = Math.hypot(dx, dz)
  const ux = dx / len
  const uz = dz / len

  const onLeg = streetPts
    .map((p) => {
      const t = (p[0] - from.x) * ux + (p[1] - from.z) * uz
      const perp = Math.abs(-(p[0] - from.x) * uz + (p[1] - from.z) * ux)
      return { p, t, perp }
    })
    // Keep points that lie between the ends and close to the line: this drops
    // the parallel service roads and lower-level roadways sharing the name.
    .filter((e) => e.t > -6 && e.t < len + 6 && e.perp < 22)
    .sort((a, b) => a.t - b.t)

  const out = []
  for (let i = 0; i < count; i++) {
    const target = (len * i) / (count - 1)
    let nearest = onLeg[0]
    for (const e of onLeg) {
      if (Math.abs(e.t - target) < Math.abs(nearest.t - target)) nearest = e
    }
    out.push(nearest ? nearest.p : [from.x + ux * target, from.z + uz * target])
  }
  return out
}

const michigan = ptsFor('North Michigan Avenue')
const oak = ptsFor('East Oak Street', 'West Oak Street')
const walton = ptsFor('East Walton Place', 'East Walton Street')
const rush = ptsFor('North Rush Street')
const bellevue = ptsFor('East Bellevue Place')
const state = ptsFor('North State Street', 'North State Parkway')

const michOak = intersection(michigan, oak)
const michWalton = intersection(michigan, walton)
const rushWalton = intersection(rush, walton)
const rushOak = intersection(rush, oak)
const rushBellevue = intersection(rush, bellevue)
const stateBellevue = intersection(state, bellevue)

const show = (label, p) =>
  console.log(`${label.padEnd(22)} x=${p.x.toFixed(1).padStart(7)} z=${p.z.toFixed(1).padStart(7)}  (gap ${p.d.toFixed(1)}m)`)

console.log('--- intersections ---')
show('Michigan × Oak', michOak)
show('Michigan × Walton', michWalton)
show('Rush × Walton', rushWalton)
show('Rush × Oak', rushOak)
show('Rush × Bellevue', rushBellevue)
show('State × Bellevue', stateBellevue)

const fmt = (pts, comment) =>
  pts
    .map(([x, z]) => `    [${x.toFixed(0)}, 1.7, ${z.toFixed(0)}], // ${comment}`)
    .join('\n')

console.log('\n--- Michigan Ave southbound, Oak -> Walton ---')
console.log(fmt(legAlong(michigan, michOak, michWalton, 6), 'Michigan'))
console.log('\n--- Walton westbound, Michigan -> Rush ---')
console.log(fmt(legAlong(walton, michWalton, rushWalton, 5), 'Walton'))
console.log('\n--- Rush northbound, Walton -> Bellevue ---')
console.log(fmt(legAlong(rush, rushWalton, rushBellevue, 7), 'Rush'))

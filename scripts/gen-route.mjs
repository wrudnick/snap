/**
 * Emit route waypoints derived from real street intersections.
 *
 * Every junction below comes from OSM ways sharing a node, so the corners are
 * exact. Legs interpolate between them: a Chicago block between two
 * intersections is straight, so sampling the noisy centreline points adds
 * jitter without adding accuracy.
 *
 * Waypoints are offset laterally onto the sidewalk — walking down the middle of
 * Michigan Avenue would be both wrong and a poor vantage point.
 */
import { readFileSync } from 'node:fs'

const city = JSON.parse(readFileSync('src/content/geo/goldcoast.json', 'utf8'))
const ptsFor = (...names) =>
  city.streets.filter((s) => names.includes(s.n)).flatMap((s) => s.p)

function intersection(a, b) {
  let best = null
  for (const p of a) for (const q of b) {
    const d = Math.hypot(p[0] - q[0], p[1] - q[1])
    if (!best || d < best.d) best = { d, x: (p[0] + q[0]) / 2, z: (p[1] + q[1]) / 2 }
  }
  return best
}

const michigan = ptsFor('North Michigan Avenue')
const oak = ptsFor('East Oak Street', 'West Oak Street')
const walton = ptsFor('East Walton Place', 'East Walton Street')
const rush = ptsFor('North Rush Street')
const bellevue = ptsFor('East Bellevue Place')
const state = ptsFor('North State Street', 'North State Parkway')
const elsd = ptsFor('East Lake Shore Drive')

const J = {
  michOak: intersection(michigan, oak),
  michWalton: intersection(michigan, walton),
  rushWalton: intersection(rush, walton),
  rushOak: intersection(rush, oak),
  rushBellevue: intersection(rush, bellevue),
  stateBellevue: intersection(state, bellevue),
  michElsd: intersection(michigan, elsd),
}

/** Points along a leg, pushed `side` metres to the left of travel. */
function leg(from, to, count, side = 0) {
  const dx = to.x - from.x
  const dz = to.z - from.z
  const len = Math.hypot(dx, dz)
  const ux = dx / len
  const uz = dz / len
  // Left of travel in a +X-east / +Z-south frame.
  const nx = uz
  const nz = -ux
  const out = []
  for (let i = 0; i < count; i++) {
    const t = (len * i) / (count - 1)
    out.push([
      +(from.x + ux * t + nx * side).toFixed(1),
      +(from.z + uz * t + nz * side).toFixed(1),
    ])
  }
  return out
}

const elsdEast = Math.max(...elsd.map((p) => p[0]))

const legs = {
  // Sand, then under the Drive. No street data out here — the beach is east of
  // everything OSM maps, so these are placed relative to the Drive's east end.
  beach: [[elsdEast + 116, -26], [elsdEast + 78, -18], [elsdEast + 44, -10]],
  tunnel: [[elsdEast + 24, -2], [elsdEast + 8, -1.4], [elsdEast - 10, -1.4], [elsdEast - 26, -0.4]],
  lakeshore: leg({ x: elsdEast - 46, z: 4 }, { x: J.michElsd.x + 26, z: 4 }, 5, 0),
  michigan: leg(J.michOak, J.michWalton, 5, 12),
  walton: leg(J.michWalton, J.rushWalton, 4, 9),
  rushLower: leg(J.rushWalton, J.rushOak, 3, -9),
  rushUpper: leg(J.rushOak, J.rushBellevue, 4, -9),
  triangle: [
    [J.rushBellevue.x - 12, J.rushBellevue.z - 6],
    [(J.rushBellevue.x + J.stateBellevue.x) / 2 - 4, J.rushBellevue.z - 14],
    [(J.rushBellevue.x + J.stateBellevue.x) / 2 + 12, J.rushBellevue.z - 20],
  ],
  bellevue: [
    [J.rushBellevue.x + 4, J.rushBellevue.z - 14],
    [J.rushBellevue.x + 16, J.rushBellevue.z - 8],
  ],
}

console.log('--- junctions (gap 0 = shared OSM node) ---')
for (const [k, v] of Object.entries(J)) {
  console.log(`${k.padEnd(14)} x=${v.x.toFixed(1).padStart(7)} z=${v.z.toFixed(1).padStart(7)}  gap ${v.d.toFixed(1)}m`)
}

let index = 0
console.log('\n--- waypoints ---')
for (const [name, pts] of Object.entries(legs)) {
  console.log(`    // ${name}`)
  for (const [x, z] of pts) {
    console.log(`    [${x}, 1.7, ${z}], // ${index++}`)
  }
}
console.log(`\ntotal waypoints: ${index}`)

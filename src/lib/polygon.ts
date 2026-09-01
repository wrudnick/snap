/**
 * Convex polygons in two dimensions, for measuring a silhouette against a frame.
 *
 * Pure arithmetic on plain arrays, so the three questions scoring asks of a
 * building — how big is it, how much of it is inside the frame, where is it —
 * can be tested without a renderer.
 */

export type Point = readonly [number, number]

/** Signed area, doubled. Positive when the winding is counter-clockwise. */
function cross(o: Point, a: Point, b: Point): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
}

/**
 * Convex hull, monotone chain.
 *
 * The support points a silhouette is built from are already hull corners, but
 * they arrive in the order the directions were sampled rather than around the
 * outline — and area and clipping both need them in order.
 */
export function convexHull(points: Point[]): Point[] {
  if (points.length < 3) return [...points]
  const sorted = [...points].sort((p, q) => (p[0] - q[0]) || (p[1] - q[1]))

  const half = (input: Point[]): Point[] => {
    const out: Point[] = []
    for (const p of input) {
      while (out.length >= 2 && cross(out[out.length - 2]!, out[out.length - 1]!, p) <= 0) {
        out.pop()
      }
      out.push(p)
    }
    out.pop()
    return out
  }

  return [...half(sorted), ...half([...sorted].reverse())]
}

/** Area of a simple polygon. Always positive. */
export function area(polygon: Point[]): number {
  if (polygon.length < 3) return 0
  let sum = 0
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    sum += polygon[j]![0] * polygon[i]![1] - polygon[i]![0] * polygon[j]![1]
  }
  return Math.abs(sum) / 2
}

/**
 * Clip a convex polygon to an axis-aligned box. Sutherland–Hodgman.
 *
 * Used to ask how much of a building is actually inside the frame, which is the
 * term that gates every other one — so it has to be the real intersected area
 * rather than a bounding-box guess. A tower can have its bounding box half out
 * of frame while the tower itself is entirely inside it.
 */
export function clipToBox(
  polygon: Point[],
  min: Point,
  max: Point,
): Point[] {
  const edges: Array<(p: Point) => number> = [
    (p) => p[0] - min[0],
    (p) => max[0] - p[0],
    (p) => p[1] - min[1],
    (p) => max[1] - p[1],
  ]

  let output = [...polygon]
  for (const inside of edges) {
    if (output.length === 0) return []
    const input = output
    output = []
    for (let i = 0; i < input.length; i++) {
      const current = input[i]!
      const previous = input[(i + input.length - 1) % input.length]!
      const dCurrent = inside(current)
      const dPrevious = inside(previous)

      if (dCurrent >= 0) {
        if (dPrevious < 0) output.push(crossing(previous, current, dPrevious, dCurrent))
        output.push(current)
      } else if (dPrevious >= 0) {
        output.push(crossing(previous, current, dPrevious, dCurrent))
      }
    }
  }
  return output
}

/** Where a segment crosses an edge, from the signed distance at each end. */
function crossing(from: Point, to: Point, dFrom: number, dTo: number): Point {
  const t = dFrom / (dFrom - dTo)
  return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t]
}

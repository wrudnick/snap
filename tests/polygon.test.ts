import { describe, expect, it } from 'vitest'

import { area, clipToBox, convexHull, type Point } from '../src/lib/polygon'

const FRAME_MIN: Point = [-1, -1]
const FRAME_MAX: Point = [1, 1]

describe('polygons', () => {
  describe('convex hull', () => {
    it('orders scattered support points around the outline', () => {
      // Deliberately shuffled: the points arrive in the order the sampling
      // directions were tried, not around the shape.
      const hull = convexHull([[1, 1], [-1, -1], [1, -1], [-1, 1], [0, 0]])
      expect(hull).toHaveLength(4)
      expect(area(hull)).toBeCloseTo(4, 10)
    })

    it('drops interior points', () => {
      const hull = convexHull([[0, 0], [4, 0], [4, 4], [0, 4], [2, 2], [1, 3]])
      expect(hull).toHaveLength(4)
      expect(area(hull)).toBeCloseTo(16, 10)
    })
  })

  describe('clipping to the frame', () => {
    it('leaves a polygon that is wholly inside alone', () => {
      const p = convexHull([[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]])
      expect(area(clipToBox(p, FRAME_MIN, FRAME_MAX))).toBeCloseTo(area(p), 10)
    })

    it('returns nothing for a polygon wholly outside', () => {
      const p = convexHull([[2, 2], [3, 2], [3, 3], [2, 3]])
      expect(clipToBox(p, FRAME_MIN, FRAME_MAX)).toEqual([])
    })

    /**
     * The measurement Fit is built on.
     *
     * Half a building outside the frame has to read as half, not as "the
     * bounding box overlaps" — Fit gates every other term, so a rough answer
     * here mis-scores the whole photograph.
     */
    it('measures how much is inside', () => {
      const p = convexHull([[0, -0.5], [2, -0.5], [2, 0.5], [0, 0.5]])
      const inside = area(clipToBox(p, FRAME_MIN, FRAME_MAX))
      expect(inside / area(p)).toBeCloseTo(0.5, 10)
    })

    /**
     * A bounding box would get this wrong, which is why this is polygon work.
     *
     * A diamond touching all four frame edges is entirely inside the frame, but
     * its corners sit exactly on the boundary — a box test on a slightly larger
     * diamond would call it clipped when nothing is missing.
     */
    it('does not confuse a bounding box for the shape', () => {
      const diamond = convexHull([[0, -1], [1, 0], [0, 1], [-1, 0]])
      const inside = area(clipToBox(diamond, FRAME_MIN, FRAME_MAX))
      expect(inside / area(diamond)).toBeCloseTo(1, 10)
      expect(area(diamond)).toBeCloseTo(2, 10)
    })

    it('clips a corner without losing the rest', () => {
      const p = convexHull([[0.5, 0.5], [1.5, 0.5], [1.5, 1.5], [0.5, 1.5]])
      const clipped = clipToBox(p, FRAME_MIN, FRAME_MAX)
      expect(area(clipped) / area(p)).toBeCloseTo(0.25, 10)
    })
  })
})

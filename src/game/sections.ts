import * as THREE from 'three'

import type { LightingProfile, RouteDef, RouteSection } from '@/content/routes/types'

import type { Rail } from './rail'

/**
 * Sections resolved onto the spline.
 *
 * Route data names sections by waypoint index because that's what's readable to
 * author. The game needs them as `t` ranges, which only the built curve can
 * supply — so resolution happens once at load and everything downstream works in
 * route progress.
 */

export interface ResolvedSection extends RouteSection {
  tStart: number
  tEnd: number
}

export interface ResolvedCheckpoint {
  id: string
  title: string
  t: number
}

export interface ResolvedRoute {
  sections: ResolvedSection[]
  checkpoints: ResolvedCheckpoint[]
}

export function resolveRoute(route: RouteDef, rail: Rail): ResolvedRoute {
  const v = new THREE.Vector3()

  const tAtWaypoint = (index: number): number => {
    const w = route.waypoints[index]
    if (!w) return 0
    v.set(w[0], w[1], w[2])
    return rail.tNearest(v)
  }

  const sections: ResolvedSection[] = route.sections.map((section) => ({
    ...section,
    tStart: tAtWaypoint(section.waypoints[0]),
    tEnd: tAtWaypoint(section.waypoints[1]),
  }))

  // Close the gaps between consecutive sections so no `t` falls between two of
  // them — otherwise lighting briefly has nothing to blend toward.
  for (let i = 0; i < sections.length - 1; i++) {
    const mid = (sections[i]!.tEnd + sections[i + 1]!.tStart) / 2
    sections[i]!.tEnd = mid
    sections[i + 1]!.tStart = mid
  }
  if (sections.length > 0) {
    sections[0]!.tStart = 0
    sections[sections.length - 1]!.tEnd = 1
  }

  const checkpoints: ResolvedCheckpoint[] = route.checkpoints.map((cp) => ({
    id: cp.id,
    title: cp.title,
    t: tAtWaypoint(cp.waypoint),
  }))

  return { sections, checkpoints }
}

/** The section containing `t`. Falls back to the last one at the very end. */
export function sectionAt(sections: ResolvedSection[], t: number): ResolvedSection {
  for (const s of sections) {
    if (t >= s.tStart && t < s.tEnd) return s
  }
  return sections[sections.length - 1]!
}

const _color = new THREE.Color()
const _other = new THREE.Color()

function mixHex(a: number, b: number, amount: number): THREE.Color {
  _color.setHex(a)
  _other.setHex(b)
  return _color.lerp(_other, amount)
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/**
 * Lighting for a point on the route, blended across section boundaries.
 *
 * `blend` is the fraction of a section spent easing in from the previous one. A
 * hard cut at the boundary is jarring — but the tunnel is the exception that
 * proves the rule: it wants a *fast* transition, which falls out naturally
 * because it's the section either side of the ramp and the blend window is a
 * fraction of a short section.
 */
export function lightingAt(
  sections: ResolvedSection[],
  t: number,
  blend = 0.35,
): LightingProfile {
  const index = sections.findIndex((s) => t >= s.tStart && t < s.tEnd)
  const i = index === -1 ? sections.length - 1 : index
  const current = sections[i]!
  const previous = sections[i - 1]

  const span = Math.max(current.tEnd - current.tStart, 1e-6)
  const progress = (t - current.tStart) / span

  if (!previous || progress >= blend) return current.lighting

  // Ease so the transition doesn't start and stop abruptly.
  const raw = progress / blend
  const amount = raw * raw * (3 - 2 * raw)

  const from = previous.lighting
  const to = current.lighting

  return {
    sky: mixHex(from.sky, to.sky, amount).getHex(),
    fogNear: lerp(from.fogNear, to.fogNear, amount),
    fogFar: lerp(from.fogFar, to.fogFar, amount),
    key: mixHex(from.key, to.key, amount).getHex(),
    keyIntensity: lerp(from.keyIntensity, to.keyIntensity, amount),
    skyFill: mixHex(from.skyFill, to.skyFill, amount).getHex(),
    groundFill: mixHex(from.groundFill, to.groundFill, amount).getHex(),
    fillIntensity: lerp(from.fillIntensity, to.fillIntensity, amount),
    shadowTint: mixHex(from.shadowTint, to.shadowTint, amount).getHex(),
    shadowTintStrength: lerp(from.shadowTintStrength, to.shadowTintStrength, amount),
    // Boolean, so it flips at the midpoint rather than blending.
    castShadows: amount < 0.5 ? from.castShadows : to.castShadows,
  }
}

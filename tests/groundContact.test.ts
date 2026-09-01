import { describe, expect, it } from 'vitest'
import * as THREE from 'three'

import { SUBJECTS } from '../src/content/subjects'
import { buildModel } from '../src/content/models/procedural'

/**
 * Nothing sinks into the pavement further than it already does.
 *
 * This started as a throwaway probe and found that every one of the twelve
 * humanoids buried itself between half a metre and eighty-five centimetres in
 * `lounge`, and a third of a metre in `sunbathe` — reported to me as "the
 * tourist is below ground", which is one species and one clip of twenty-four
 * broken ones. Being told about a symptom is not the same as knowing the extent
 * of it, and the sweep is what turned one report into the whole list.
 *
 * So it lives here now rather than being rewritten each time. It is a ratchet:
 * the allowances below are what was wrong on the day it was written, and they
 * exist to stop anything getting worse while they are worked off. Entries may
 * be lowered or deleted. Adding one, or raising one, means something regressed.
 */

/** Clips whose whole purpose is to be under the ground. */
const DELIBERATELY_BURIED = new Set(['hidden'])

/**
 * Known penetration, in metres, at the scale each subject is rendered.
 *
 * The quadrupeds are legs and tails that reach through the floor in their
 * faster clips; the vehicles are wheels dipping below the axle line. Neither is
 * fixed yet.
 */
const ALLOWANCE: Record<string, number> = {
  'dog:prowl': 0.21,
  'dog:scurry': 0.17,
  'dog:stretch': 0.43,
  'cat:prowl': 0.1,
  'cat:scurry': 0.08,
  'cat:stretch': 0.21,
  'taxi:cruise': 0.14,
  'taxi:turn': 0.14,
  'sedan:cruise': 0.14,
  'sedan:turn': 0.14,
  'suv:cruise': 0.06,
  'suv:turn': 0.06,
  'rideshare:cruise': 0.14,
  'rideshare:turn': 0.14,
  'delivery-car:cruise': 0.14,
  'delivery-car:turn': 0.14,
  'police-car:cruise': 0.14,
  'police-car:turn': 0.14,
  'bus:cruise': 0.22,
  'cyclist:ride': 0.13,
  'cyclist:sprint': 0.13,
  'delivery-rider:ride': 0.13,
  'delivery-rider:sprint': 0.13,
}

/** A few centimetres of paw or tyre is contact, not penetration. */
const TOLERANCE = 0.05

describe('ground contact', () => {
  it('no subject sinks further than it is allowed to', () => {
    const worse: string[] = []

    for (const [species, def] of Object.entries(SUBJECTS)) {
      for (const clip of buildModel(def, 1, false).clips) {
        if (DELIBERATELY_BURIED.has(clip.name)) continue

        // A fresh model per clip: a mixer leaves the pose it finished in, and
        // reusing one model across clips reports the previous clip's damage.
        const model = buildModel(def, 1, false)
        const mixer = new THREE.AnimationMixer(model.group)
        const active = model.clips.find((c) => c.name === clip.name)!
        mixer.clipAction(active).reset().play()

        let lowest = 0
        for (let i = 0; i <= 16; i++) {
          mixer.setTime((i / 16) * active.duration)
          model.group.updateMatrixWorld(true)
          lowest = Math.min(lowest, new THREE.Box3().setFromObject(model.group).min.y)
        }

        const sunk = -lowest * (def.scale ?? 1)
        const allowed = (ALLOWANCE[`${species}:${clip.name}`] ?? 0) + TOLERANCE
        if (sunk > allowed) {
          worse.push(`${species}:${clip.name} sinks ${sunk.toFixed(2)}m, allowed ${allowed.toFixed(2)}m`)
        }
      }
    }

    expect(worse).toEqual([])
  })
})

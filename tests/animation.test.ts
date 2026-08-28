import { describe, expect, it } from 'vitest'
import * as THREE from 'three'

import { buildModel } from '../src/content/models/procedural'
import { SUBJECTS } from '../src/content/subjects'

/**
 * Animation binding cover.
 *
 * three resolves clip tracks against node *names* at runtime. A track naming a
 * node that doesn't exist doesn't throw — it silently does nothing. So a
 * renamed or restructured part leaves an animation quietly half-broken, which is
 * exactly what happened when limbs moved onto pivot groups: the shoe tracks kept
 * pointing at meshes that were no longer top-level.
 *
 * These assert every track binds, and that every behaviour names a clip that
 * exists — the two failure modes that are invisible until someone notices a
 * subject isn't moving right.
 */

const species = Object.values(SUBJECTS)

/** `hips.position[y]` -> { node: 'hips', property: 'position' } */
function parseTrack(name: string): { node: string; property: string } {
  const [node = '', rest = ''] = name.split('.')
  const property = rest.replace(/\[.*\]$/, '')
  return { node, property }
}

describe('subject animation clips', () => {
  for (const def of species) {
    describe(def.species, () => {
      const built = buildModel(def, 7)

      it('binds every animation track to a node that exists', () => {
        const missing: string[] = []

        for (const clip of built.clips) {
          for (const track of clip.tracks) {
            const { node } = parseTrack(track.name)
            if (!built.group.getObjectByName(node)) {
              missing.push(`${clip.name}: ${track.name}`)
            }
          }
        }

        expect(missing).toEqual([])
      })

      it('targets properties the node actually has', () => {
        const bad: string[] = []

        for (const clip of built.clips) {
          for (const track of clip.tracks) {
            const { node, property } = parseTrack(track.name)
            const target = built.group.getObjectByName(node)
            if (!target) continue
            if (!(property in target)) bad.push(`${clip.name}: ${track.name}`)
          }
        }

        expect(bad).toEqual([])
      })

      it('names a clip for every behaviour', () => {
        const clipNames = new Set(built.clips.map((c) => c.name))
        const orphans = def.behaviors.filter((b) => !clipNames.has(b.clip)).map((b) => b.clip)
        expect(orphans).toEqual([])
      })

      it('scores a pose for every clip a behaviour can reach', () => {
        // A behaviour that plays a clip with no pose entry falls back to a flat
        // value, which quietly makes that animation worth nothing to photograph.
        const unscored = def.behaviors
          .filter((b) => !b.trigger && !(b.clip in def.poses))
          .map((b) => b.clip)
        expect(unscored).toEqual([])
      })

      it('has clips with non-zero duration and at least one track', () => {
        for (const clip of built.clips) {
          expect(clip.duration, `${clip.name} duration`).toBeGreaterThan(0)
          expect(clip.tracks.length, `${clip.name} tracks`).toBeGreaterThan(0)
        }
      })

      it('keeps every part within a plausible bounding box', () => {
        // Catches a limb or accessory placed far from the body — the class of
        // mistake that produced a head floating 16cm above its neck.
        const box = new THREE.Box3().setFromObject(built.group)
        const size = box.getSize(new THREE.Vector3())
        expect(size.y).toBeGreaterThan(0)

        // Vehicles are exempt: a car really is three times longer than it is
        // tall, so the ratio that catches a stray limb on a creature says
        // nothing useful about a taxi.
        if (def.model === 'vehicle') return

        expect(size.x).toBeLessThan(size.y * 3)
        expect(size.z).toBeLessThan(size.y * 3)
      })
    })
  }
})

describe('humanoid construction', () => {
  const humans = species.filter((s) => s.model === 'humanoid')

  it('covers every human class', () => {
    expect(humans.length).toBeGreaterThanOrEqual(5)
  })

  for (const def of humans) {
    it(`${def.species}: head sits on the neck with no gap`, () => {
      const built = buildModel(def, 3)
      const head = built.group.getObjectByName('head')
      const neck = built.group.getObjectByName('neck')
      expect(head, 'head').toBeDefined()
      expect(neck, 'neck').toBeDefined()

      const headBox = new THREE.Box3().setFromObject(head!)
      const neckBox = new THREE.Box3().setFromObject(neck!)

      // The head's underside must not float above the neck's top.
      expect(headBox.min.y).toBeLessThanOrEqual(neckBox.max.y + 1e-6)
    })

    it(`${def.species}: arms reach from the shoulder without detaching`, () => {
      const built = buildModel(def, 5)
      const torso = built.group.getObjectByName('torso')
      const arm = built.group.getObjectByName('armL')
      expect(torso, 'torso').toBeDefined()
      expect(arm, 'armL').toBeDefined()

      const torsoBox = new THREE.Box3().setFromObject(torso!)
      const armBox = new THREE.Box3().setFromObject(arm!)

      // Arm top should overlap the torso's upper half, not hover beside it.
      expect(armBox.max.y).toBeGreaterThan(torsoBox.min.y + (torsoBox.max.y - torsoBox.min.y) * 0.5)
      // And it must not be flung out sideways. armL sits at negative x, so the
      // gap is between the torso's left edge and the arm's right edge.
      const gap = torsoBox.min.x - armBox.max.x
      expect(gap, 'shoulder gap').toBeLessThan(0.02)
      expect(gap, 'arm buried in torso').toBeGreaterThan(-0.2)
    })

    it(`${def.species}: chest reaches the shoulders`, () => {
      // The torso must span hip to shoulder. A pivot helper that overwrote the
      // mesh offset dropped it half its own height, leaving the chest at the
      // hip — visible in game on every class that didn't take the striped path.
      const built = buildModel(def, 5)
      const torso = built.group.getObjectByName('torso')!
      const neck = built.group.getObjectByName('neck')!
      const torsoBox = new THREE.Box3().setFromObject(torso)
      const neckBox = new THREE.Box3().setFromObject(neck)
      const whole = new THREE.Box3().setFromObject(built.group)
      const height = whole.max.y - whole.min.y

      // Torso top should be near the neck's base, not a torso-length below it.
      const gap = neckBox.min.y - torsoBox.max.y
      expect(gap, 'gap between chest and neck').toBeLessThan(height * 0.06)

      // And the torso should occupy roughly its share of the figure.
      const torsoHeight = torsoBox.max.y - torsoBox.min.y
      expect(torsoHeight).toBeGreaterThan(height * 0.2)
    })

    it(`${def.species}: stands on the ground`, () => {
      const built = buildModel(def, 11)
      const box = new THREE.Box3().setFromObject(built.group)
      // Feet at or just above y=0; nothing sunk or floating.
      expect(box.min.y).toBeGreaterThan(-0.05)
      expect(box.min.y).toBeLessThan(0.12)
    })
  }
})

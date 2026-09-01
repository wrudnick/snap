import { beforeEach, describe, expect, it } from 'vitest'
import * as THREE from 'three'

import { SUBJECTS } from '../src/content/subjects'
import { clearSubjects, registerSubject } from '../src/game/capture/registry'
import { emitSignal } from '../src/game/signals'

function listener(id: string, species: string, at: [number, number, number], answers: string[]) {
  const object = new THREE.Object3D()
  object.position.set(...at)
  object.updateMatrixWorld(true)
  const heard: Array<{ trigger: string; distance: number }> = []
  registerSubject({
    id,
    species,
    object,
    bounds: new THREE.Box3(),
    readPose: () => ({ clip: 'idle', time: 0 }),
    react: (trigger, _from, distance) => {
      if (!answers.includes(trigger)) return false
      heard.push({ trigger, distance })
      return true
    },
  })
  return heard
}

describe('signals', () => {
  beforeEach(clearSubjects)

  /**
   * The chain the whole thing exists for.
   *
   * A hot dog gathers pigeons; the pigeons announce themselves; the cat comes.
   * Nothing was thrown at the cat, and the cat is the rarest subject on the
   * street — so the reliable way to photograph one is two steps removed from
   * the player's hand.
   */
  it('carries to a listener that is interested', () => {
    const cat = listener('cat-1', 'cat', [0, 0, 20], ['birds'])
    emitSignal('birds', new THREE.Vector3(0, 0, 0), 'pigeon-1')
    expect(cat).toHaveLength(1)
    expect(cat[0]!.distance).toBeCloseTo(20, 0)
  })

  it('never answers itself', () => {
    const self = listener('pigeon-1', 'pigeon', [0, 0, 0], ['birds'])
    emitSignal('birds', new THREE.Vector3(0, 0, 0), 'pigeon-1')
    expect(self, 'the emitter is excluded by id').toEqual([])
  })

  it('leaves the uninterested alone', () => {
    const bus = listener('bus-1', 'bus', [0, 0, 4], ['nothing'])
    emitSignal('birds', new THREE.Vector3(0, 0, 0), 'pigeon-1')
    expect(bus).toEqual([])
  })

  it('caps how many answer, nearest first', () => {
    const heard = Array.from({ length: 10 }, (_, i) =>
      listener(`c${i}`, 'cat', [i * 0.5, 0, 3], ['birds']),
    )
    emitSignal('birds', new THREE.Vector3(0, 0, 0), 'source', 4)
    expect(heard.filter((h) => h.length > 0)).toHaveLength(4)
    expect(heard.slice(0, 4).every((h) => h.length === 1), 'the nearest four').toBe(true)
  })

  /**
   * The data has to actually wire up, not just the mechanism.
   *
   * A broadcast whose trigger nothing answers to is a silent no-op, and the
   * chain is three separate files agreeing on two strings.
   */
  it('has a species listening for everything that is broadcast', () => {
    const broadcasts = new Set<string>()
    const listens = new Set<string>()
    for (const def of Object.values(SUBJECTS)) {
      for (const reaction of def.reactions ?? []) {
        listens.add(reaction.trigger)
        for (const step of reaction.steps) if (step.broadcast) broadcasts.add(step.broadcast)
      }
      for (const behavior of def.behaviors) if (behavior.trigger) listens.add(behavior.trigger)
    }
    const unheard = [...broadcasts].filter((t) => !listens.has(t))
    expect(unheard, 'broadcast with nothing listening').toEqual([])
  })
})

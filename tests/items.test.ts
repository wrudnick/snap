import { beforeEach, describe, expect, it } from 'vitest'
import * as THREE from 'three'

import { HOT_DOG } from '../src/content/items'
import { clearSubjects, registerSubject } from '../src/game/capture/registry'
import { activeItems, clearItems, stepItems, throwItem } from '../src/game/items'

/**
 * A subject that records what it was told to do.
 *
 * `react` returns whether the species has anything to say about a trigger,
 * which is the same contract the real one has — a parked car has no opinion
 * about a dropped hot dog, and the thrower has to be able to tell that from a
 * reaction that failed.
 */
function fake(id: string, at: [number, number, number], answers: string[]) {
  const object = new THREE.Object3D()
  object.position.set(...at)
  object.updateMatrixWorld(true)
  const heard: Array<{ trigger: string; from: [number, number, number]; distance: number }> = []
  registerSubject({
    id,
    species: 'pigeon',
    object,
    bounds: new THREE.Box3(new THREE.Vector3(-0.1, 0, -0.1), new THREE.Vector3(0.1, 0.2, 0.1)),
    readPose: () => ({ clip: 'idle', time: 0 }),
    react: (trigger, from, distance) => {
      if (!answers.includes(trigger)) return false
      heard.push({ trigger, from: [from.x, from.y, from.z], distance })
      return true
    },
  })
  return heard
}

/** Run the item to ground. */
function land(from: THREE.Vector3, direction: THREE.Vector3) {
  throwItem(HOT_DOG, from, direction, 0)
  for (let i = 0; i < 600 && activeItems().some((x) => x.restingFor === null); i++) {
    stepItems(1 / 60)
  }
}

describe('thrown items', () => {
  beforeEach(() => {
    clearItems()
    clearSubjects()
  })

  it('flies on an arc and comes to rest on the ground', () => {
    const start = new THREE.Vector3(0, 1.7, 0)
    land(start, new THREE.Vector3(0, 0, -1))
    const item = activeItems()[0]!
    expect(item.restingFor, 'it lands').not.toBeNull()
    expect(item.position.y).toBeLessThan(start.y)
    // Thrown forward, so it must have travelled — a throw that lands at your
    // feet is a dropped hot dog.
    expect(Math.abs(item.position.z)).toBeGreaterThan(3)
  })

  /**
   * It falls to the floor it was thrown from, not to wherever it happens to be.
   *
   * `groundHeightAt` takes a hint meaning "where the caller believes the ground
   * is" and returns *the hint itself* when no surface is within three metres of
   * it. Passing the item's own altitude therefore made the ground follow the
   * item down: every throw landed on the frame it was thrown, at head height,
   * and hung in the air a metre in front of the player.
   *
   * The other tests here did not catch it, because they throw over a spot where
   * a surface is found and the hint never has to stand in. This one asserts the
   * thing that was actually wrong — that it descends at all.
   */
  it('falls, rather than landing where it was released', () => {
    const start = new THREE.Vector3(0, 1.7, 0)
    // A floor well below, and far from any mapped surface, so the hint has to
    // stand in — which is exactly the case that broke.
    throwItem(HOT_DOG, start, new THREE.Vector3(0, 0, -1), -50)
    for (let i = 0; i < 600 && activeItems().some((x) => x.restingFor === null); i++) {
      stepItems(1 / 60)
    }
    const item = activeItems()[0]!
    expect(item.restingFor).not.toBeNull()
    expect(item.position.y, 'lands on the floor it was aimed at, not in mid-air')
      .toBeLessThan(-49)
    expect(Math.abs(item.position.z), 'and travels while it falls').toBeGreaterThan(3)
  })

  /**
   * The whole mechanic: near gathers, on top startles.
   *
   * Aiming only matters if the two radii give different answers, so this is the
   * behaviour worth pinning rather than the arithmetic of the arc.
   */
  it('startles what it lands on and attracts what it lands near', () => {
    const start = new THREE.Vector3(0, 1.7, 0)
    // Where it will land, so the two birds can be placed either side of the
    // startle radius rather than guessed at.
    land(start, new THREE.Vector3(0, 0, -1))
    const at = activeItems()[0]!.position.clone()
    clearItems()

    const onIt = fake('close', [at.x, 0, at.z + 1], ['startle', 'food'])
    const nearIt = fake('near', [at.x, 0, at.z + 6], ['startle', 'food'])
    const far = fake('far', [at.x, 0, at.z + 40], ['startle', 'food'])

    land(start, new THREE.Vector3(0, 0, -1))

    expect(onIt.map((h) => h.trigger), 'inside the startle radius').toEqual(['startle'])
    expect(nearIt.map((h) => h.trigger), 'outside it but within attract').toEqual(['food'])
    expect(far, 'well out of range').toEqual([])
  })

  it('tells a subject where the thing landed, so it can turn to it', () => {
    const start = new THREE.Vector3(0, 1.7, 0)
    land(start, new THREE.Vector3(0, 0, -1))
    const at = activeItems()[0]!.position.clone()
    clearItems()

    const heard = fake('bird', [at.x, 0, at.z + 5], ['food'])
    land(start, new THREE.Vector3(0, 0, -1))
    expect(heard).toHaveLength(1)
    expect(heard[0]!.from[0]).toBeCloseTo(at.x, 1)
    expect(heard[0]!.from[2]).toBeCloseTo(at.z, 1)
  })

  /**
   * Far-off things still get asked.
   *
   * The item's attract radius is what a *pigeon* notices from — nine metres. A
   * dog smells one from thirty-four, and the hot dog has no business knowing
   * which species is which, so everything plausibly within earshot is
   * consulted and each answers with its own senses. Filtering on the item's
   * radius here would have made the dog's nose unreachable no matter what its
   * data said.
   */
  it('consults subjects well beyond the item\'s own radius', () => {
    const start = new THREE.Vector3(0, 1.7, 0)
    land(start, new THREE.Vector3(0, 0, -1))
    const at = activeItems()[0]!.position.clone()
    clearItems()

    const nose = fake('dog', [at.x, 0, at.z + 30], ['food'])
    const tooFar = fake('miles', [at.x, 0, at.z + 60], ['food'])
    land(start, new THREE.Vector3(0, 0, -1))

    expect(nose, 'thirty metres away, and asked').toHaveLength(1)
    expect(nose[0]!.distance, 'told how far, so it can decide').toBeCloseTo(30, 0)
    expect(tooFar, 'past any plausible sense').toEqual([])
  })

  /**
   * A landing in a crowd must not animate the whole crowd.
   *
   * Michigan Avenue has more people within nine metres of a hot dog than it is
   * interesting to watch react, and the ones nearest it are the ones the player
   * is pointing at.
   */
  it('caps how many react, nearest first', () => {
    const start = new THREE.Vector3(0, 1.7, 0)
    land(start, new THREE.Vector3(0, 0, -1))
    const at = activeItems()[0]!.position.clone()
    clearItems()

    const heard = Array.from({ length: HOT_DOG.maxReactions + 6 }, (_, i) =>
      fake(`b${i}`, [at.x + i * 0.3, 0, at.z + 4], ['food', 'startle']),
    )
    land(start, new THREE.Vector3(0, 0, -1))

    const reacted = heard.filter((h) => h.length > 0)
    expect(reacted).toHaveLength(HOT_DOG.maxReactions)
    // Nearest first: the ones that reacted are the low indices.
    expect(heard.slice(0, HOT_DOG.maxReactions).every((h) => h.length === 1)).toBe(true)
  })
})

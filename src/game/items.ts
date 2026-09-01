import * as THREE from 'three'

import { groundHeightAt } from '@/content/models/groundHeight'
import type { ItemDef } from '@/content/items'
import { activeSubjects } from '@/game/capture/registry'

/**
 * Things in flight, and where they landed.
 *
 * A module-level list rather than React state, for the same reason the subject
 * registry is one: this is stepped inside a frame callback and read by the
 * capture pipeline, and routing it through React would re-render the tree
 * sixty times a second to move a sausage.
 *
 * No physics engine. A thrown object in this game is a parabola that stops when
 * it reaches the pavement; adding a solver for that would be adding a dependency
 * to avoid writing two lines of arithmetic.
 */
export interface ThrownItem {
  id: string
  def: ItemDef
  position: THREE.Vector3
  velocity: THREE.Vector3
  /** Seconds since it came to rest, or null while still in the air. */
  restingFor: number | null
  /**
   * Which floor this thing is falling towards, fixed when it left the hand.
   *
   * `groundHeightAt` takes a hint meaning "where the caller believes the ground
   * is", picks the surface nearest it, and — crucially — *returns the hint* when
   * nothing is within three metres. Passing the item's own altitude therefore
   * made the ground follow the item down, so every throw landed instantly at
   * head height and sat in mid-air a metre in front of the player.
   *
   * The floor the thrower is standing on is the right answer, and it is also
   * what keeps a hot dog thrown in the underpass landing on the tunnel floor
   * rather than on Lake Shore Drive's deck overhead.
   */
  groundHint: number
  spin: number
}

/** How long a landed item stays before it is cleared away. */
const LINGER_SECONDS = 22

let items: ThrownItem[] = []
let counter = 0

export const activeItems = (): ThrownItem[] => items
export const clearItems = (): void => {
  items = []
}

export function throwItem(
  def: ItemDef,
  from: THREE.Vector3,
  direction: THREE.Vector3,
  groundHint: number,
): ThrownItem {
  const velocity = direction.clone().normalize().multiplyScalar(def.throwSpeed)
  velocity.y += def.loft
  const item: ThrownItem = {
    id: `item-${++counter}`,
    def,
    position: from.clone(),
    velocity,
    restingFor: null,
    groundHint,
    spin: 0,
  }
  items.push(item)
  return item
}

/**
 * Who noticed, and how much.
 *
 * Nearest first and capped, because a landing in the middle of Michigan Avenue
 * is within nine metres of more people than it is interesting to animate, and
 * because the ones closest to it are the ones the player is pointing at.
 */
function resolveImpact(item: ThrownItem): void {
  const { def } = item
  const at = new THREE.Vector3()

  const byDistance = activeSubjects()
    .map((subject) => {
      subject.object.getWorldPosition(at)
      return { subject, distance: at.distanceTo(item.position) }
    })
    .filter((entry) => entry.distance <= def.attract.radius)
    .sort((a, b) => a.distance - b.distance)

  let reacted = 0
  for (const { subject, distance } of byDistance) {
    if (reacted >= def.maxReactions) break
    const trigger = distance <= def.startle.radius ? def.startle.trigger : def.attract.trigger
    // Falls back to the other reaction: a species that flees but does not eat
    // should still flee when the thing lands beside it rather than on it.
    const fired =
      subject.react(trigger, item.position) ||
      subject.react(
        trigger === def.startle.trigger ? def.attract.trigger : def.startle.trigger,
        item.position,
      )
    if (fired) reacted += 1
  }
}

export function stepItems(dt: number): void {
  if (items.length === 0) return

  for (const item of items) {
    if (item.restingFor !== null) {
      item.restingFor += dt
      continue
    }

    item.velocity.y -= item.def.gravity * dt
    item.position.addScaledVector(item.velocity, dt)
    item.spin += dt * 9

    const ground = groundHeightAt(item.position.x, item.position.z, item.groundHint)
    if (item.position.y <= ground + 0.08) {
      item.position.y = ground + 0.08
      item.velocity.set(0, 0, 0)
      item.restingFor = 0
      resolveImpact(item)
    }
  }

  items = items.filter((item) => (item.restingFor ?? 0) < LINGER_SECONDS)
}

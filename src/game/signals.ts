import * as THREE from 'three'

import { activeSubjects } from '@/game/capture/registry'

/**
 * One subject telling the others that something is happening.
 *
 * Throwing a hot dog is a first-order event: the thing lands and whatever is
 * near it responds. The interesting ones are second-order — food gathers
 * pigeons, and a gathered flock is what brings the cat. The player caused the
 * cat two steps back and never threw anything at it.
 *
 * Deliberately the same shape as an item landing: a position, a trigger, and
 * every species deciding for itself whether that is close enough to notice. A
 * cat's interest in birds reaches further than a pigeon's interest in food, and
 * neither the pigeon nor the hot dog has any business knowing that.
 *
 * Signals do not cascade. A subject already running an errand ignores them, so
 * the flock the cat scatters cannot call the cat back — the guard is in
 * `Subject`, where the errand lives, rather than in a depth counter here.
 */
const NOTICE_LIMIT = 40

export function emitSignal(
  trigger: string,
  at: THREE.Vector3,
  exceptId: string,
  max = 6,
): number {
  const position = new THREE.Vector3()
  const heard = activeSubjects()
    .filter((subject) => subject.id !== exceptId)
    .map((subject) => {
      subject.object.getWorldPosition(position)
      return { subject, distance: position.distanceTo(at) }
    })
    .filter((entry) => entry.distance <= NOTICE_LIMIT)
    .sort((a, b) => a.distance - b.distance)

  let fired = 0
  for (const { subject, distance } of heard) {
    if (fired >= max) break
    if (subject.react(trigger, at, distance)) fired += 1
  }
  return fired
}

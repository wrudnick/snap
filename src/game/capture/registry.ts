import type * as THREE from 'three'

/**
 * Live registry of subjects currently in the world.
 *
 * A plain module-level Map rather than React state: subjects mount and unmount
 * as rail segments activate, and the capture pipeline needs to walk them
 * synchronously inside a single frame. Routing this through React would both
 * re-render the tree and risk reading a stale list at shutter time.
 */

export interface SubjectInstance {
  id: string
  species: string
  object: THREE.Object3D
  /** Local-space bounds of the model, projected at capture time. */
  bounds: THREE.Box3
  /** Reads the live animation state straight off the mixer. */
  readPose: () => { clip: string; time: number }
  /**
   * Make this subject respond to something that happened in the world.
   *
   * The seam the plan reserved for throwables: behaviours can carry a
   * `trigger`, and until now that only ever filtered them *out* of the idle
   * rotation — nothing could ever fire one. Returns false when the species has
   * nothing to say about this trigger, which is normal and not a failure: a
   * parked car has no opinion about a dropped hot dog.
   *
   * `from` is where the thing happened, so the subject can turn towards it, or
   * go to it. Turning to look is most of what sells a reaction, and for a game
   * about photographs it is the reaction that makes the picture.
   *
   * `distance` is how far away that was, and the subject decides for itself
   * whether that is close enough — a dog's nose reaches much further than a
   * pigeon's eye, and the thrower has no business knowing which is which.
   */
  react: (trigger: string, from: THREE.Vector3, distance: number) => boolean
}

const registry = new Map<string, SubjectInstance>()

export const registerSubject = (s: SubjectInstance): void => {
  registry.set(s.id, s)
}

export const unregisterSubject = (id: string): void => {
  registry.delete(id)
}

export const activeSubjects = (): SubjectInstance[] => [...registry.values()]

export const clearSubjects = (): void => registry.clear()

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

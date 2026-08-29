import type * as THREE from 'three'

import overrides from './partOverrides.json'

/**
 * Hand adjustments to procedural models, by species and part name.
 *
 * The models are built from code, which is right for variation — every tourist
 * rolls their own outfit, hair and proportions from a seed — and wrong for
 * getting a shape *correct*. Nudging a horse's rider two centimetres by editing
 * a literal, rebuilding, and looking again is a terrible loop, and every model
 * in this game has needed several rounds of exactly that.
 *
 * So the builders stay parametric and this sits on top: a transform applied to
 * a named part after the model is built, authored by dragging a gizmo in the
 * inspector. It applies to every instance and every seed, so variation survives
 * — which a hand-edited mesh would not.
 *
 * Only the fields present are applied, so an override that only moves something
 * leaves its scale and rotation to the builder.
 */

export interface PartOverride {
  position?: [number, number, number]
  rotation?: [number, number, number]
  scale?: [number, number, number]
}

export type PartOverrides = Record<string, Record<string, PartOverride>>

// Through `unknown`: TypeScript infers `number[]` for the arrays in a JSON
// import, which is not assignable to the fixed-length tuples here, and the
// shape is guaranteed by the editor that writes the file rather than by the
// import.
const table = overrides as unknown as PartOverrides

export function partOverridesFor(species: string): Record<string, PartOverride> {
  return table[species] ?? {}
}

/**
 * Apply a species' overrides to a freshly built model.
 *
 * Walks by name. `pivot()` renames the mesh it wraps to `<joint>_mesh`, so both
 * the joint and its mesh are addressable — which matters, because moving a
 * joint moves everything hanging off it and moving the mesh moves only the
 * shape.
 */
export function applyPartOverrides(group: THREE.Object3D, species: string): void {
  const forSpecies = table[species]
  if (!forSpecies) return

  group.traverse((node) => {
    const override = forSpecies[node.name]
    if (!override) return
    if (override.position) node.position.fromArray(override.position)
    if (override.rotation) node.rotation.fromArray(override.rotation)
    if (override.scale) node.scale.fromArray(override.scale)
  })
}

import { useEffect, useMemo } from 'react'
import * as THREE from 'three'

import { toonRamp } from './palette'
import { patchToonMaterial, type ToonPatchOptions } from './toonPatch'

/**
 * A patched toon material owned by the calling component.
 *
 * Deliberately *not* the shared cache from `toonPatch.ts`. R3F disposes attached
 * resources when a component unmounts, and rail segments mount and unmount
 * constantly — so a cached material shared between several `<Instances>` groups
 * gets disposed the first time any one of them leaves the active window, and
 * every other group silently stops rendering.
 *
 * Owning the material per component makes that lifecycle unambiguous. It costs
 * nothing in draw calls: each InstancedMesh is its own draw call regardless of
 * whether it shares a material.
 *
 * Always render it with `<primitive object={material} attach="material" dispose={null} />`.
 */
export function useToonMaterial(
  color: number,
  options: ToonPatchOptions = {},
): THREE.MeshToonMaterial {
  const key = JSON.stringify(options)

  const material = useMemo(
    () =>
      patchToonMaterial(
        new THREE.MeshToonMaterial({ color, gradientMap: toonRamp() }),
        options,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [color, key],
  )

  useEffect(() => () => material.dispose(), [material])

  return material
}

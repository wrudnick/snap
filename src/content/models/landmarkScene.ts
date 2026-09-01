import * as THREE from 'three'

import { addFacadeAttributes, mergeByMaterial } from './landmarkKit'
import { LANDMARK_BUILDINGS, heightOf } from './landmarkBuildings'
import { silhouetteOf, type Silhouette } from './landmarkSilhouette'
import { siteById } from './landmarkSites'

/**
 * Every hand-authored building, as one object.
 *
 * Merged across the whole set rather than per building. A landmark is a handful
 * of materials, so merging each one on its own would cost three draw calls
 * apiece — fifty of them is a hundred and fifty calls for buildings that never
 * move and are never culled. Merged together it is a handful for all of them.
 *
 * Not segment-gated, deliberately: these are the things you can see a mile
 * down Michigan, and half the point of putting the Hancock in is that it is
 * visible from the beach.
 */
/**
 * Each landmark's outline, by OSM id, taken before the merge.
 *
 * Rendering wants one mesh per material for the whole city; scoring wants to
 * know which building is which. Those are different questions and only the
 * first one needs a draw call, so the silhouettes are captured here — from the
 * real built geometry, spires included — and the merge proceeds unchanged.
 */
export const LANDMARK_SILHOUETTES = new Map<number, Silhouette>()

export function buildLandmarks(): THREE.Group {
  const scaffold = new THREE.Group()
  LANDMARK_SILHOUETTES.clear()

  for (const [key, entry] of Object.entries(LANDMARK_BUILDINGS)) {
    const site = siteById(Number(key))
    if (!site) continue

    // An authored level count wins over the OSM height — see LANDMARK_BUILDINGS.
    const built = entry.build({ ...site, height: heightOf(entry, site) })
    const holder = new THREE.Group()
    holder.add(built)
    holder.position.set(site.center[0], 0, site.center[1])
    holder.rotation.y = site.heading
    scaffold.add(holder)

    const outline = silhouetteOf(holder)
    if (outline) LANDMARK_SILHOUETTES.set(Number(key), outline)
  }

  const merged = mergeByMaterial(scaffold)

  /**
   * Windows, from the same shader the extruded city uses.
   *
   * One seed for the whole set rather than one per building: the attributes are
   * generated after merging, by which point the buildings are indistinguishable
   * from each other. The cost is that two landmarks light the same window
   * pattern, which nobody will ever notice from the street — and the
   * alternative is threading a seed through every builder for a variation that
   * is already dominated by their wildly different shapes.
   */
  for (const child of merged.children) {
    if (child instanceof THREE.Mesh) addFacadeAttributes(child.geometry, 0.41)
  }
  return merged
}

/**
 * Where each landmark is, for the minimap.
 *
 * Derived rather than authored, for the same reason the models are: the map
 * already knows where these buildings stand.
 */
export const LANDMARK_MARKERS: Array<{ name: string; x: number; z: number }> =
  Object.entries(LANDMARK_BUILDINGS).flatMap(([key, entry]) => {
    const site = siteById(Number(key))
    return site ? [{ name: entry.name, x: site.center[0], z: site.center[1] }] : []
  })

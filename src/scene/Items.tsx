import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

import { HOT_DOG } from '@/content/items'
import { hotDogParts } from '@/content/models/hotDog'
import { EYE_HEIGHT } from '@/content/routes/types'
import { activeItems, clearItems, stepItems, throwItem } from '@/game/items'
import { input } from '@/input'

/**
 * Thrown items, in flight and on the ground.
 *
 * Pooled rather than mounted and unmounted: a throw is the one thing in this
 * game that can happen twice a second, and creating geometry on the frame the
 * player presses the button is the shape of stall this codebase has already
 * been bitten by twice — once on the first shutter press, once on the first
 * material to enter view. The meshes exist from the start and are hidden.
 */
const POOL = 12

export function Items() {
  const camera = useThree((s) => s.camera)
  const group = useRef<THREE.Group>(null)

  const meshes = useMemo(() => {
    // One set of geometries for the whole pool: every thrown item is the same
    // hot dog, so twelve copies would be eleven wasted.
    const parts = hotDogParts()
    return Array.from({ length: POOL }, () => {
      const holder = new THREE.Group()
      for (const { geometry, material } of parts) {
        const mesh = new THREE.Mesh(geometry, material)
        mesh.castShadow = true
        holder.add(mesh)
      }
      holder.visible = false
      return holder
    })
  }, [])

  useEffect(() => {
    const parent = group.current
    if (!parent) return
    meshes.forEach((m) => parent.add(m))
    return () => {
      clearItems()
      // Geometry is shared with every other item and outlives this component,
      // so only the holders are torn down.
      meshes.forEach((m) => m.removeFromParent())
    }
  }, [meshes])

  const from = useMemo(() => new THREE.Vector3(), [])
  const direction = useMemo(() => new THREE.Vector3(), [])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 30)

    if (input.toss) {
      input.toss = false
      if (activeItems().length < POOL) {
        camera.getWorldPosition(from)
        camera.getWorldDirection(direction)
        // Out of the hand rather than out of the eye, so it does not clip the
        // bottom of the frame on its way out.
        from.addScaledVector(direction, 0.6).y -= 0.25
        // The floor the player is standing on, not the item's own altitude.
        throwItem(HOT_DOG, from, direction, camera.position.y - EYE_HEIGHT)
      }
    }

    stepItems(dt)

    const live = activeItems()
    for (let i = 0; i < meshes.length; i++) {
      const mesh = meshes[i]!
      const item = live[i]
      if (!item) {
        mesh.visible = false
        continue
      }
      mesh.visible = true
      mesh.position.copy(item.position)
      // Tumbling in the air, still once it lands.
      if (item.restingFor === null) mesh.rotation.set(item.spin, item.spin * 0.6, 0)
      else mesh.rotation.set(0, item.spin * 0.6, 0)
    }
  })

  return <group ref={group} />
}

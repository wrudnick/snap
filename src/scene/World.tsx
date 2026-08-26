import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

import { DAWN } from '@/render/palette'
import { sharedToonUniforms } from '@/render/toonPatch'
import { runtime } from '@/game/runtime'
import { lightingAt, type ResolvedSection } from '@/game/sections'

/**
 * Lighting and atmosphere, driven by where the player is on the route.
 *
 * The route runs from open lakefront through a tunnel, along a street, and
 * finally indoors. One fixed sun can't serve all of that, so lighting is keyed
 * to route position and blended across section boundaries every frame.
 *
 * Everything here is a ref mutation — no React state touches the render loop.
 * The shader-side shadow tint updates through `sharedToonUniforms`, which every
 * patched material references by identity, so one assignment retints the scene.
 *
 * The shadow camera is small and follows the player rather than trying to cover
 * 540 m of route; a frustum that large would be too low-resolution to read.
 */

const SUN_OFFSET = new THREE.Vector3(28, 40, 18)

export function World({
  sections,
  children,
}: {
  sections: ResolvedSection[]
  children: React.ReactNode
}) {
  const camera = useThree((s) => s.camera)
  const scene = useThree((s) => s.scene)

  const lightRef = useRef<THREE.DirectionalLight>(null)
  const hemiRef = useRef<THREE.HemisphereLight>(null)
  const target = useMemo(() => new THREE.Object3D(), [])

  const fog = useMemo(() => new THREE.Fog(DAWN.sky, DAWN.fogNear, DAWN.fogFar), [])
  const background = useMemo(() => new THREE.Color(DAWN.sky), [])

  useMemo(() => {
    scene.fog = fog
    scene.background = background
  }, [scene, fog, background])

  useFrame(() => {
    const light = lightRef.current
    const hemi = hemiRef.current
    if (!light || !hemi) return

    const profile = lightingAt(sections, runtime.t)

    background.setHex(profile.sky)
    fog.color.setHex(profile.sky)
    fog.near = profile.fogNear
    fog.far = profile.fogFar

    light.color.setHex(profile.key)
    light.intensity = profile.keyIntensity
    light.castShadow = profile.castShadows

    hemi.color.setHex(profile.skyFill)
    hemi.groundColor.setHex(profile.groundFill)
    hemi.intensity = profile.fillIntensity

    sharedToonUniforms.uShadowTint.value.setHex(profile.shadowTint)
    sharedToonUniforms.uShadowTintStrength.value = profile.shadowTintStrength

    // Keep the shadow volume centred on the camera.
    target.position.copy(camera.position)
    target.updateMatrixWorld()
    light.position.copy(camera.position).add(SUN_OFFSET)
  })

  return (
    <>
      <hemisphereLight
        ref={hemiRef}
        args={[DAWN.skyFill, DAWN.groundFill, DAWN.fillIntensity]}
      />
      <directionalLight
        ref={lightRef}
        intensity={DAWN.keyIntensity}
        color={DAWN.key}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0006}
        shadow-normalBias={0.02}
        target={target}
      >
        <orthographicCamera attach="shadow-camera" args={[-30, 30, 30, -30, 1, 140]} />
      </directionalLight>
      <primitive object={target} />

      {children}
    </>
  )
}

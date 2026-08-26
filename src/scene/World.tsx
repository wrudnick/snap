import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'

/**
 * Lighting and atmosphere.
 *
 * One directional light, one hemisphere fill, no point lights. The shadow camera
 * is small and *follows the player* down the rail rather than trying to cover the
 * whole street — a shadow frustum big enough for a 240-metre route would have to
 * be so low-resolution that the shadows would be mush.
 */

const SUN_OFFSET = new THREE.Vector3(28, 40, 18)

export function World({ children }: { children: React.ReactNode }) {
  const camera = useThree((s) => s.camera)
  const lightRef = useRef<THREE.DirectionalLight>(null)
  const target = useMemo(() => new THREE.Object3D(), [])

  useFrame(() => {
    const light = lightRef.current
    if (!light) return

    // Keep the shadow volume centred on the camera. Ref mutation only — this
    // never touches React state.
    target.position.copy(camera.position)
    target.updateMatrixWorld()
    light.position.copy(camera.position).add(SUN_OFFSET)
  })

  return (
    <>
      <color attach="background" args={[0xb8c6d4]} />
      {/* Far plane sits just inside the segment-gating distance, so props are
          fully fogged out before they unmount. */}
      <fog attach="fog" args={[0xb8c6d4, 45, 105]} />

      <hemisphereLight args={[0xcfe0f0, 0x4a4640, 1.1]} />
      <directionalLight
        ref={lightRef}
        intensity={2.0}
        color={0xfff2dd}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0006}
        shadow-normalBias={0.02}
        target={target}
      >
        <orthographicCamera attach="shadow-camera" args={[-30, 30, 30, -30, 1, 140]} />
      </directionalLight>
      <primitive object={target} />

      {/* Ground plane beneath everything, so the world doesn't end at the kerb. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.06, 0]} receiveShadow>
        <planeGeometry args={[600, 900]} />
        <meshLambertMaterial color={0x4b4f56} />
      </mesh>

      {children}
    </>
  )
}

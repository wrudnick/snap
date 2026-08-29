import { useFrame, useThree } from '@react-three/fiber'
import { useMemo } from 'react'
import * as THREE from 'three'

/**
 * Multi-angle rendering for the model inspector.
 *
 * One turntable angle hides things. The Doorman's raised arm was invisible
 * head-on because it pointed straight at the camera, and a limb clipping into
 * the torso only shows from the side. Six fixed angles rendered together make
 * that class of problem impossible to miss without spinning and hoping.
 *
 * Implemented as six viewports over a single scene rather than six canvases:
 * the model, its animation state and its materials are shared, so every panel
 * shows the *same* instant of the *same* object. Six canvases would each build
 * their own copy and drift out of sync.
 */

export interface Angle {
  label: string
  /** Radians about Y. 0 looks at the model's front (it faces -Z). */
  yaw: number
  /** Radians above the horizon. */
  pitch: number
}

export const ANGLES: Angle[] = [
  { label: 'Front', yaw: 0, pitch: 0.1 },
  { label: 'Three-quarter', yaw: 0.7, pitch: 0.18 },
  { label: 'Side', yaw: Math.PI / 2, pitch: 0.1 },
  { label: 'Back', yaw: Math.PI, pitch: 0.1 },
  { label: 'Far side', yaw: -Math.PI / 2, pitch: 0.1 },
  { label: 'Above', yaw: 0.5, pitch: 1.05 },
]

export const GRID_COLS = 3
export const GRID_ROWS = 2

export function AngleGrid({
  height,
  reach,
  children,
}: {
  height: number
  reach: number
  children: React.ReactNode
}) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const size = useThree((s) => s.size)

  const cameras = useMemo(
    () => ANGLES.map(() => new THREE.PerspectiveCamera(36, 1, 0.05, 4000)),
    [],
  )

  // Priority 1 takes over rendering from R3F, which is what lets us draw the
  // scene six times with different cameras in one frame.
  useFrame(() => {
    const cellW = Math.floor(size.width / GRID_COLS)
    const cellH = Math.floor(size.height / GRID_ROWS)
    const distance = Math.max(1.8, reach * 2.0)
    const target = new THREE.Vector3(0, height * 0.5, 0)

    gl.setScissorTest(true)

    ANGLES.forEach((angle, i) => {
      const col = i % GRID_COLS
      const row = Math.floor(i / GRID_COLS)
      // WebGL's origin is bottom-left; the grid reads top-left.
      const x = col * cellW
      const y = size.height - (row + 1) * cellH

      gl.setViewport(x, y, cellW, cellH)
      gl.setScissor(x, y, cellW, cellH)

      const camera = cameras[i]!
      camera.aspect = cellW / cellH
      camera.position.set(
        Math.sin(angle.yaw) * Math.cos(angle.pitch) * distance,
        target.y + Math.sin(angle.pitch) * distance,
        -Math.cos(angle.yaw) * Math.cos(angle.pitch) * distance,
      )
      camera.lookAt(target)
      camera.updateProjectionMatrix()

      gl.render(scene, camera)
    })

    gl.setScissorTest(false)
    // Restore, or the next single-camera mode inherits the last cell.
    gl.setViewport(0, 0, size.width, size.height)
  }, 1)

  return <>{children}</>
}

import { useFrame } from '@react-three/fiber'
import { useState } from 'react'

import { runtime } from '@/game/runtime'

/**
 * The rail segment the camera is currently in.
 *
 * This is the one place the game deliberately calls setState from inside a
 * frame callback. It's guarded on an integer change, so across a 95-second route
 * it fires exactly `segmentCount` times — not per frame. That's a discrete
 * event, which is precisely what React state is for.
 */
export function useActiveSegment(): number {
  const [segment, setSegment] = useState(runtime.segment)

  useFrame(() => {
    if (runtime.segment !== segment) setSegment(runtime.segment)
  })

  return segment
}

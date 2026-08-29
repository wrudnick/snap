import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'

import { ROUTES } from '@/content/routes/goldcoast'
import { SPECIES_INDEX } from '@/content/subjects'
import { capturePhotoImage } from '@/game/capture/image'
import { buildSnapshot } from '@/game/capture/snapshot'
import { runtime } from '@/game/runtime'
import { DEFAULT_SCORING_CONFIG } from '@/game/scoring/config'
import { scorePhoto } from '@/game/scoring/score'
import { useGame } from '@/game/state'
import { input } from '@/input'
import { activeComposer } from '@/render/composer'

/** Long edge of a saved photo. */
const PHOTO_WIDTH = 960

let photoCounter = 0

/**
 * Handles the shutter.
 *
 * Two things happen at the same instant and must not drift apart: the pixels are
 * rendered, and the scene is reduced to a PhotoSnapshot. Scoring happens
 * synchronously off that snapshot, so the score always describes the exact frame
 * the player saw — the image encode is allowed to finish asynchronously
 * afterwards because it can no longer change the outcome.
 *
 * Reads store state via `getState()` rather than the hook, so this component
 * never subscribes and never re-renders during play.
 */
export function Shutter({ routeId }: { routeId: string }) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)

  const busy = useRef(false)

  useFrame(() => {
    if (!input.shutter) return
    input.shutter = false

    const state = useGame.getState()
    if (state.phase !== 'riding' || state.filmRemaining <= 0 || busy.current) return

    busy.current = true
    const id = `photo-${++photoCounter}`
    const aspect = size.width / size.height

    // Synchronous: the world is frozen at this exact instant.
    const snapshot = buildSnapshot({
      photoId: id,
      routeId,
      t: runtime.t,
      aspect,
      camera,
      occluders: scene.children,
    })
    const score = scorePhoto(snapshot, SPECIES_INDEX, DEFAULT_SCORING_CONFIG)

    const height = Math.round(PHOTO_WIDTH / aspect)

    capturePhotoImage({
      gl,
      scene,
      camera,
      width: PHOTO_WIDTH,
      height,
      composer: activeComposer.current,
    })
      .then((blob) => {
        useGame.getState().addPhoto({
          id,
          url: URL.createObjectURL(blob),
          snapshot,
          score,
        })
      })
      .catch((err: unknown) => {
        console.error('[shutter] capture failed', err)
      })
      .finally(() => {
        busy.current = false
      })
  })

  return null
}

export const ROUTE_LOOKUP = ROUTES

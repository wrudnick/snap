import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'

import { ROUTES } from '@/content/routes/goldcoast'
import { SPECIES_INDEX } from '@/content/subjects'
import { capturePhotoImage, warmCapturePipeline } from '@/game/capture/image'
import { prepareOccluders } from '@/render/raycastAcceleration'
import { buildSnapshot } from '@/game/capture/snapshot'
import { captureWorldState } from '@/game/capture/world'
import { finderCrop, formatAspect, type CameraBody } from '@/content/cameras'
import type { Rail } from '@/game/rail'
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
export function Shutter({
  routeId,
  rail,
  body,
}: {
  routeId: string
  rail: Rail
  body: CameraBody
}) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)

  const busy = useRef(false)

  /**
   * Index the scene for the occlusion rays, once, before the first shot.
   *
   * Done here rather than only where the city and the landmarks are built,
   * because the rays are cast against everything in the scene and this is the
   * one place that knows that. Idempotent: geometry that already has a tree is
   * skipped, so the walk is all it costs on a re-mount.
   */
  useEffect(() => {
    prepareOccluders(scene)
  }, [scene])

  /** Compile the capture pipeline now rather than on the first photograph. */
  useEffect(() => {
    // The body's frame, not the viewport's — otherwise the warmed target is the
    // wrong size and the first real capture allocates another one, which is the
    // stall this exists to prevent.
    warmCapturePipeline(gl, PHOTO_WIDTH, Math.round(PHOTO_WIDTH / formatAspect(body.format)))
  }, [gl, body.format])

  useFrame(() => {
    if (!input.shutter) return
    input.shutter = false

    const state = useGame.getState()
    if (state.phase !== 'riding' || state.filmRemaining <= 0 || busy.current) return

    busy.current = true
    const id = `photo-${++photoCounter}`
    /**
     * The photograph is the finder's frame, not the viewport.
     *
     * Both of these used to be the canvas: the snapshot reported the viewport's
     * aspect to scoring and the capture derived its height from it. A player
     * composing inside a 3:2 bright-line finder on a 16:9 screen would have been
     * judged on a rectangle they were never shown.
     */
    const aspect = formatAspect(body.format)
    const crop = finderCrop(size.width / size.height, body)

    // Synchronous: the world is frozen at this exact instant.
    const snapshot = buildSnapshot({
      photoId: id,
      routeId,
      t: runtime.t,
      aspect,
      camera,
      occluders: scene.children,
    })
    /**
     * Stamped on after the fact, so `buildSnapshot` stays about the subjects.
     *
     * Carried with the photograph so a shot sent back as feedback can be stood
     * up again exactly — same place on the route, same look, same build.
     */
    snapshot.view = {
      yaw: runtime.yaw,
      pitch: runtime.pitch,
      fov: runtime.targetFov,
      focalLength: body.focalLength,
      build: __BUILD__,
    }

    /**
     * The whole world, for reading afterwards.
     *
     * Separate from the snapshot because the snapshot is the scoring input and
     * is only about what was in frame. The bugs actually worth reporting are
     * about things standing in the wrong place, and those are visible in a
     * photograph but only diagnosable from coordinates.
     */
    const world = captureWorldState({
      camera,
      routeId,
      section: runtime.sectionTitle,
      t: runtime.t,
      metres: runtime.t * rail.length,
      yaw: runtime.yaw,
      pitch: runtime.pitch,
      railHeading: runtime.railHeading,
      fov: runtime.targetFov,
      focalLength: body.focalLength,
      build: __BUILD__,
    })
    const score = scorePhoto(snapshot, SPECIES_INDEX, DEFAULT_SCORING_CONFIG)

    const height = Math.round(PHOTO_WIDTH / aspect)

    /**
     * The shot is recorded now, not when the picture finishes encoding.
     *
     * Everything that decides what the photograph *is* has already happened:
     * the world was frozen for the snapshot and the score is settled. All that
     * remains is reading the pixels back off the GPU and writing a JPEG, and
     * hanging the film counter and the shutter flash on that meant the camera
     * appeared not to respond for most of a second on a crowded street. Take
     * the photograph, then develop it.
     */
    useGame.getState().addPhoto({ id, url: null, snapshot, score, world })

    capturePhotoImage({
      gl,
      scene,
      camera,
      width: PHOTO_WIDTH,
      height,
      crop,
      composer: activeComposer.current,
      film: body.film,
    })
      .then((blob) => {
        useGame.getState().attachImage(id, URL.createObjectURL(blob))
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

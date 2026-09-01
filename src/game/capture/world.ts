import * as THREE from 'three'

import { activeSubjects } from './registry'

/**
 * Everything in the world at the instant the shutter fired.
 *
 * Separate from `PhotoSnapshot`, which is the scoring input and is deliberately
 * only about what was in frame and how it was framed. This is the debugging
 * record: where the camera stood, which way it looked, and where every actor
 * was — including the ones behind it.
 *
 * The reason it wants the ones behind it is that the bugs worth reporting are
 * usually about things being in the wrong place, not about the shot: a car on a
 * pavement, a pedestrian in four lanes of traffic. Those are visible in a
 * photograph but only diagnosable from coordinates, and a screenshot cannot
 * carry coordinates.
 */
export interface ActorState {
  id: string
  species: string
  /** World position, rounded to centimetres — this is read, not replayed. */
  at: [number, number, number]
  /** Heading in degrees, clockwise from north, matching the compass on screen. */
  heading: number
  clip: string
  /** Metres from the camera. */
  distance: number
  /** Whether it was in front of the camera, roughly — not a frustum test. */
  ahead: boolean
}

export interface WorldState {
  build: string
  routeId: string
  section: string
  /** Route progress 0..1, and metres travelled. */
  t: number
  metres: number
  camera: {
    at: [number, number, number]
    /** Compass bearing the camera faced, degrees clockwise from north. */
    bearing: number
    /** Degrees above the horizon. */
    pitch: number
    fov: number
    /** Look offset from the way the route was pointing, in degrees. */
    yawFromRoute: number
  }
  actors: ActorState[]
}

const round = (n: number, places = 2) => {
  const f = 10 ** places
  return Math.round(n * f) / f
}

/**
 * `-Z` is north in this world, and three's yaw counts anticlockwise from it,
 * so a compass bearing is the negated angle wrapped into 0…360.
 */
const bearingOf = (yaw: number) => round(((-yaw * 180) / Math.PI + 360) % 360, 1)

export function captureWorldState(opts: {
  camera: THREE.Camera
  routeId: string
  section: string
  t: number
  metres: number
  yaw: number
  pitch: number
  railHeading: number
  fov: number
  build: string
}): WorldState {
  const camPos = new THREE.Vector3()
  opts.camera.getWorldPosition(camPos)

  const forward = new THREE.Vector3()
  opts.camera.getWorldDirection(forward)

  const at = new THREE.Vector3()
  const toActor = new THREE.Vector3()
  const quat = new THREE.Quaternion()
  const euler = new THREE.Euler()

  const actors = activeSubjects()
    .map((subject): ActorState => {
      subject.object.getWorldPosition(at)
      subject.object.getWorldQuaternion(quat)
      euler.setFromQuaternion(quat, 'YXZ')
      toActor.subVectors(at, camPos)
      return {
        id: subject.id,
        species: subject.species,
        at: [round(at.x), round(at.y), round(at.z)],
        heading: bearingOf(euler.y),
        clip: subject.readPose().clip,
        distance: round(toActor.length(), 1),
        ahead: toActor.normalize().dot(forward) > 0,
      }
    })
    .sort((a, b) => a.distance - b.distance)

  return {
    build: opts.build,
    routeId: opts.routeId,
    section: opts.section,
    t: round(opts.t, 4),
    metres: Math.round(opts.metres),
    camera: {
      at: [round(camPos.x), round(camPos.y), round(camPos.z)],
      bearing: bearingOf(opts.railHeading + opts.yaw),
      pitch: round((opts.pitch * 180) / Math.PI, 1),
      fov: round(opts.fov, 1),
      yawFromRoute: round((opts.yaw * 180) / Math.PI, 1),
    },
    actors,
  }
}

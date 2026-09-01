import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

import { buildModel } from '@/content/models/procedural'
import type { SubjectPlacement } from '@/content/routes/types'
import { getSubject } from '@/content/subjects'
import type { BehaviorDef, ReactionStep } from '@/content/subjects/types'
import { registerSubject, unregisterSubject } from '@/game/capture/registry'
import { consumeItemAt } from '@/game/items'
import { makeRng, range } from '@/lib/rng'

/**
 * One live subject: a model, an AnimationMixer, a behaviour loop, and an
 * optional patrol path.
 *
 * The behaviour loop is a weighted random walk over clips — pick one, hold it
 * for a random duration, pick again. That's deliberately simple, and it's enough
 * to make a good pose something the player waits for and times rather than
 * something they merely find.
 */
/** Shared origin for subjects with no authored position. */
const ZERO: [number, number, number] = [0, 0, 0]

export function SubjectView({ placement }: { placement: SubjectPlacement }) {
  const def = getSubject(placement.species)
  if (!def) throw new Error(`Unknown species "${placement.species}" in route data`)

  const groupRef = useRef<THREE.Group>(null)
  /** Metres travelled since the last wrap. See the drive block in useFrame. */
  const driven = useRef(0)

  // A fresh model per subject — they animate independently, so they can't share
  // an Object3D. Geometry and materials are shared inside buildModel.
  // Seeded per placement, so two people of the same class are different people.
  const built = useMemo(() => buildModel(def, placement.seed), [def, placement.seed])

  const mixer = useMemo(() => new THREE.AnimationMixer(built.group), [built])

  const actions = useMemo(() => {
    const map = new Map<string, THREE.AnimationAction>()
    for (const clip of built.clips) map.set(clip.name, mixer.clipAction(clip))
    return map
  }, [built, mixer])

  const rng = useMemo(() => makeRng(placement.seed), [placement.seed])

  // Patrol curve, if this subject moves.
  const patrol = useMemo(() => {
    if (!placement.path || placement.path.length < 2) return null
    return new THREE.CatmullRomCurve3(
      placement.path.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
      true,
      'catmullrom',
      0.5,
    )
  }, [placement.path])

  const current = useRef<{ name: string; action: THREE.AnimationAction | null }>({
    name: 'idle',
    action: null,
  })
  const holdFor = useRef(0)
  const patrolT = useRef(rng())

  const _pos = useMemo(() => new THREE.Vector3(), [])
  const _ahead = useMemo(() => new THREE.Vector3(), [])

  /** Weighted pick over the subject's behaviours, excluding trigger-only ones. */
  const chooseBehavior = useMemo(() => {
    // A car that is driving must not play `parked`: the clip is what spins the
    // wheels, and a vehicle sliding down the street on still wheels reads as
    // more broken than one that never moves.
    const available = def.behaviors.filter(
      (b) => !b.trigger && !(placement.driveSpeed && b.clip === 'parked'),
    )
    const total = available.reduce((sum, b) => sum + b.weight, 0)
    return (): BehaviorDef => {
      let r = rng() * total
      for (const b of available) {
        r -= b.weight
        if (r <= 0) return b
      }
      return available[available.length - 1]!
    }
  }, [def.behaviors, rng, placement.driveSpeed])

  const playNext = useMemo(
    () => () => {
      const next = chooseBehavior()
      const action = actions.get(next.clip)
      if (!action) return

      const previous = current.current.action
      action.reset()
      action.setLoop(THREE.LoopRepeat, Infinity)
      action.enabled = true

      if (previous && previous !== action) {
        action.crossFadeFrom(previous, 0.25, false).play()
      } else {
        action.play()
      }

      current.current = { name: next.clip, action }
      holdFor.current = range(rng, next.minSeconds, next.maxSeconds)
    },
    [actions, chooseBehavior, rng],
  )

  /**
   * The errand a subject is currently running, if any.
   *
   * A ref rather than state: it advances every frame and nothing outside this
   * component looks at it. `null` means the subject is back on its own idle
   * rotation, which is where it returns to when the last beat finishes — a
   * reaction that had to be cancelled would be a second piece of state to get
   * wrong.
   */
  const errand = useRef<{
    steps: ReactionStep[]
    index: number
    elapsed: number
    target: THREE.Vector3
  } | null>(null)

  /** Start a clip now, crossfading from whatever was playing. */
  const start = useMemo(
    () => (clip: string): boolean => {
      const action = actions.get(clip)
      if (!action) return false
      const previous = current.current.action
      action.reset()
      action.setLoop(THREE.LoopRepeat, Infinity)
      action.enabled = true
      if (previous && previous !== action) action.crossFadeFrom(previous, 0.18, false).play()
      else action.play()
      current.current = { name: clip, action }
      return true
    },
    [actions],
  )

  /**
   * Face a point, on the yaw only.
   *
   * A pigeon that pitches to look at something on the pavement in front of it
   * is a pigeon lying on its side. Models face local −Z, so this is the heading
   * that puts the point in front.
   */
  const faceTowards = useMemo(
    () => (group: THREE.Object3D, point: THREE.Vector3) => {
      group.rotation.y = Math.atan2(point.x - group.position.x, point.z - group.position.z) + Math.PI
    },
    [],
  )

  /**
   * Respond to something that happened, if this species has anything to say.
   *
   * A scripted reaction wins over a single-clip one, and the species decides
   * whether it noticed at all — its own senses, not the thrower's guess.
   */
  const play = useMemo(
    () => (trigger: string, from: THREE.Vector3, distance: number): boolean => {
      const group = groupRef.current
      if (!group) return false

      const scripted = def.reactions?.find((r) => r.trigger === trigger)
      if (scripted && distance <= scripted.senses && scripted.steps.length > 0) {
        errand.current = {
          steps: scripted.steps,
          index: 0,
          elapsed: 0,
          target: from.clone(),
        }
        start(scripted.steps[0]!.clip)
        faceTowards(group, from)
        // Held by the errand from here; the idle timer must not cut across it.
        holdFor.current = Number.POSITIVE_INFINITY
        return true
      }

      const next = def.behaviors.find((b) => b.trigger === trigger)
      if (!next || !start(next.clip)) return false
      holdFor.current = range(rng, next.minSeconds, next.maxSeconds)
      faceTowards(group, from)
      return true
    },
    [def.behaviors, def.reactions, faceTowards, rng, start],
  )

  /**
   * Advance the errand: walk, eat, and hand back to idling at the end.
   *
   * Movement is straight at the target. Over the few metres these cover, on a
   * pavement, that is right often enough to be worth far less than what pathing
   * would cost — and a dog that walks through the corner of a bin is a smaller
   * problem than a dog that never reaches the hot dog.
   */
  const stepErrand = useMemo(
    () => (dt: number, group: THREE.Object3D) => {
      const run = errand.current
      if (!run) return
      const step = run.steps[run.index]!
      run.elapsed += dt

      if (step.speed) {
        const dx = run.target.x - group.position.x
        const dz = run.target.z - group.position.z
        const gap = Math.hypot(dx, dz)
        if (gap > 0.05) {
          const travel = Math.min(step.speed * dt, gap)
          group.position.x += (dx / gap) * travel
          group.position.z += (dz / gap) * travel
          faceTowards(group, run.target)
        }
      }

      const arrived =
        step.hold === 'arrive'
          ? Math.hypot(run.target.x - group.position.x, run.target.z - group.position.z) < 0.6 ||
            // A leg that can never finish would strand the subject mid-street.
            run.elapsed > 12
          : run.elapsed >= step.hold

      if (!arrived) return

      if (step.consume) consumeItemAt(run.target)

      run.index += 1
      run.elapsed = 0
      const next = run.steps[run.index]
      if (!next) {
        errand.current = null
        holdFor.current = 0
        return
      }
      start(next.clip)
    },
    [faceTowards, start],
  )

  useEffect(() => {
    // Stagger start times so a flock doesn't move in lockstep.
    mixer.update(rng() * 2)
    playNext()
    return () => {
      mixer.stopAllAction()
    }
  }, [mixer, playNext, rng])

  // Register with the capture system. `readPose` reads straight off the mixer,
  // which is exactly how it will work once real .glb clips replace these.
  useEffect(() => {
    const group = groupRef.current
    if (!group) return

    registerSubject({
      id: placement.id,
      species: placement.species,
      object: group,
      bounds: built.bounds,
      readPose: () => {
        const { name, action } = current.current
        const duration = action?.getClip().duration ?? 1
        const time = action ? (action.time % duration) / duration : 0
        return { clip: name, time }
      },
      react: (trigger, from, distance) => play(trigger, from, distance),
    })

    return () => unregisterSubject(placement.id)
  }, [placement.id, placement.species, built.bounds])

  /**
   * The lane this car follows, as a curve.
   *
   * Sampled at ground height once: a street's own gradient is gentle and the
   * cars on it are not what sells a hill, so following the ground per frame
   * would cost a height lookup on every car on every frame to fix something
   * nobody would see.
   */
  const lane = useMemo(() => {
    const path = placement.drivePath
    if (!path || path.length < 2) return null
    const y = placement.position?.[1] ?? 0
    return new THREE.CatmullRomCurve3(
      path.map(([x, z]) => new THREE.Vector3(x, y, z)),
      false,
      'catmullrom',
      0.1,
    )
  }, [placement.drivePath, placement.position])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 30)
    mixer.update(dt)

    const errandGroup = groupRef.current
    if (errand.current && errandGroup) {
      stepErrand(dt, errandGroup)
    } else {
      holdFor.current -= dt
      if (holdFor.current <= 0) playNext()
    }

    const group = groupRef.current
    if (!group) return

    /**
     * Driving.
     *
     * Advanced along the subject's own facing, so a car pointed back down the
     * street drives back down it and nothing has to be kept in step by hand.
     * Models face local −Z, which is why forward is `(−sin, 0, −cos)`.
     *
     * Wrapped around the midpoint rather than from zero, so a car spends half
     * its span behind its authored position and half in front: authored where
     * you want it seen, and the loop point falls a long way either side.
     */
    if (placement.driveSpeed) {
      const span = placement.driveSpan ?? 160
      driven.current = (driven.current + dt * placement.driveSpeed) % span

      if (lane) {
        /**
         * Along the lane, and pointed where the lane goes.
         *
         * `getPointAt` is by arc length, so a metre of travel is a metre of
         * road whatever the curve is doing — which is the whole reason for
         * using it rather than the raw parameter.
         */
        const u = driven.current / span
        lane.getPointAt(u, _pos)
        group.position.copy(_pos)
        lane.getPointAt(Math.min(0.999, u + 0.004), _ahead)
        group.lookAt(_ahead)
      } else {
        /**
         * No lane found: carry on down the car's own facing.
         *
         * Only reached where the map has no street within seventy metres — the
         * beach, and inside the underpass — and on those the straight line is
         * right anyway.
         */
        const along = driven.current - span / 2
        const angle = placement.rotationY ?? 0
        const home = placement.position ?? ZERO
        group.position.set(
          home[0] - Math.sin(angle) * along,
          home[1],
          home[2] - Math.cos(angle) * along,
        )
      }
    }

    if (patrol && placement.patrolSeconds) {
      patrolT.current = (patrolT.current + dt / placement.patrolSeconds) % 1
      patrol.getPointAt(patrolT.current, _pos)
      group.position.copy(_pos)

      // Face along the direction of travel. Models point down local -Z, so
      // lookAt does the right thing without a correction.
      patrol.getPointAt((patrolT.current + 0.01) % 1, _ahead)
      group.lookAt(_ahead)
    }
  })

  return (
    <group
      ref={groupRef}
      position={placement.position ?? [0, 0, 0]}
      rotation={[0, placement.rotationY ?? 0, 0]}
    >
      <primitive object={built.group} />
    </group>
  )
}

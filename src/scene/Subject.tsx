import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

import { buildModel } from '@/content/models/procedural'
import type { SubjectPlacement } from '@/content/routes/types'
import { getSubject } from '@/content/subjects'
import type { BehaviorDef } from '@/content/subjects/types'
import { registerSubject, unregisterSubject } from '@/game/capture/registry'
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
    })

    return () => unregisterSubject(placement.id)
  }, [placement.id, placement.species, built.bounds])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 30)
    mixer.update(dt)

    holdFor.current -= dt
    if (holdFor.current <= 0) playNext()

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
      const along = driven.current - span / 2
      const angle = placement.rotationY ?? 0
      const home = placement.position ?? ZERO
      group.position.set(
        home[0] - Math.sin(angle) * along,
        home[1],
        home[2] - Math.cos(angle) * along,
      )
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

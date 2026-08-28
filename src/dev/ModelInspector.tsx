import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'

import { buildLandmark, type LandmarkDef } from '@/content/models/landmarks'
import { buildModel } from '@/content/models/procedural'
import { GOLD_COAST } from '@/content/routes/goldcoast'
import { SUBJECTS } from '@/content/subjects'
import { DAWN, toonRamp } from '@/render/palette'

/**
 * Model inspector — `?debug=models`.
 *
 * Exists so a report like "the doorman's arms look wrong" can be answered by
 * looking at the doorman, rather than riding 800 m of route hoping to catch one
 * mid-stride at the right angle. Every model, every clip, every seed, on a
 * turntable.
 *
 * Deliberately its own Canvas and its own lighting: it is a workshop, not the
 * game, and it should show what the geometry *is* rather than what the route's
 * lighting zone happens to make of it.
 */

const GROUND = -0.02

function Turntable({
  object,
  spin,
  height,
}: {
  object: THREE.Object3D
  spin: boolean
  height: number
}) {
  const ref = useRef<THREE.Group>(null)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera

  useEffect(() => {
    // Frame the subject: pull back proportional to its size and look at its
    // middle, so a pigeon and a 340 m tower both fill the view.
    const distance = Math.max(1.6, height * 1.9)
    camera.position.set(distance * 0.75, height * 0.62, distance)
    camera.lookAt(0, height * 0.45, 0)
    camera.updateProjectionMatrix()
  }, [camera, height])

  useFrame((_, delta) => {
    if (ref.current && spin) ref.current.rotation.y += delta * 0.5
  })

  return (
    <group ref={ref}>
      <primitive object={object} />
    </group>
  )
}

function InspectorScene({
  object,
  spin,
  height,
  mixer,
}: {
  object: THREE.Object3D
  spin: boolean
  height: number
  mixer: THREE.AnimationMixer | null
}) {
  useFrame((_, delta) => {
    mixer?.update(Math.min(delta, 1 / 30))
  })

  return (
    <>
      <color attach="background" args={[0x1a1f26]} />
      <hemisphereLight args={[DAWN.skyFill, DAWN.groundFill, 1.4]} />
      <directionalLight position={[6, 10, 5]} intensity={2.1} color={DAWN.key} />
      <directionalLight position={[-7, 4, -6]} intensity={0.5} color={0x8fa8d0} />

      {/* Ground and axes: without a reference plane it's impossible to tell a
          floating model from a correctly grounded one. */}
      <gridHelper args={[Math.max(4, height * 3), 20, 0x4a5560, 0x2b333c]} position={[0, GROUND, 0]} />
      <axesHelper args={[Math.max(0.6, height * 0.35)]} />

      <Turntable object={object} spin={spin} height={height} />
    </>
  )
}

type Entry =
  | { kind: 'subject'; id: string; label: string }
  | { kind: 'landmark'; id: string; label: string; def: LandmarkDef }

export function ModelInspector() {
  const entries = useMemo<Entry[]>(() => {
    const subjects: Entry[] = Object.values(SUBJECTS).map((s) => ({
      kind: 'subject',
      id: s.species,
      label: s.displayName,
    }))
    const landmarks: Entry[] = (GOLD_COAST.landmarks ?? []).map((l) => ({
      kind: 'landmark',
      id: l.id,
      label: l.name,
      def: l,
    }))
    return [...subjects, ...landmarks]
  }, [])

  const [selected, setSelected] = useState(entries[0]?.id ?? '')
  const [seed, setSeed] = useState(1)
  const [spin, setSpin] = useState(true)
  const [clip, setClip] = useState<string | null>(null)

  const entry = entries.find((e) => e.id === selected) ?? entries[0]

  const built = useMemo(() => {
    if (!entry) return null
    if (entry.kind === 'landmark') {
      const object = buildLandmark({ ...entry.def, position: [0, 0, 0] })
      const box = new THREE.Box3().setFromObject(object)
      return { object, clips: [] as THREE.AnimationClip[], height: box.max.y - box.min.y, parts: countParts(object) }
    }
    const def = SUBJECTS[entry.id]!
    const model = buildModel(def, seed)
    const box = new THREE.Box3().setFromObject(model.group)
    return {
      object: model.group,
      clips: model.clips,
      height: box.max.y - box.min.y,
      parts: countParts(model.group),
    }
  }, [entry, seed])

  const mixer = useMemo(() => {
    if (!built || built.clips.length === 0) return null
    return new THREE.AnimationMixer(built.object)
  }, [built])

  // Play the chosen clip, defaulting to the first.
  useEffect(() => {
    if (!mixer || !built) return
    mixer.stopAllAction()
    const name = clip ?? built.clips[0]?.name
    const found = built.clips.find((c) => c.name === name)
    if (found) mixer.clipAction(found).reset().play()
    return () => {
      mixer.stopAllAction()
    }
  }, [mixer, built, clip])

  // Reset the clip selection when switching models — clip names differ per kind.
  useEffect(() => {
    setClip(null)
  }, [selected])

  if (!entry || !built) return <div className="layer interactive"><div className="screen">No models.</div></div>

  return (
    <div className="inspector">
      <aside className="inspector-list">
        <h2>Models</h2>
        {entries.map((e) => (
          <button
            key={e.id}
            className={e.id === selected ? 'primary' : ''}
            onClick={() => setSelected(e.id)}
          >
            {e.label}
          </button>
        ))}

        <h2 style={{ marginTop: '1.5rem' }}>Variation</h2>
        <div className="row">
          <button onClick={() => setSeed((s) => Math.max(1, s - 1))}>−</button>
          <span className="inspector-value">seed {seed}</span>
          <button onClick={() => setSeed((s) => s + 1)}>+</button>
        </div>

        <h2 style={{ marginTop: '1.5rem' }}>Clip</h2>
        {built.clips.length === 0 ? (
          <div className="inspector-value">no animation</div>
        ) : (
          built.clips.map((c) => (
            <button
              key={c.name}
              className={(clip ?? built.clips[0]?.name) === c.name ? 'primary' : ''}
              onClick={() => setClip(c.name)}
            >
              {c.name}
            </button>
          ))
        )}

        <h2 style={{ marginTop: '1.5rem' }}>View</h2>
        <button onClick={() => setSpin((s) => !s)}>{spin ? 'Stop' : 'Spin'}</button>

        <div className="inspector-stats">
          <div>{entry.kind}</div>
          <div>{built.parts} meshes</div>
          <div>{built.height.toFixed(2)} m tall</div>
        </div>

        <a className="inspector-back" href="?">← back to the game</a>
      </aside>

      <div className="inspector-view">
        <Canvas
          key={`${selected}:${seed}`}
          dpr={[1, 1.5]}
          camera={{ fov: 40, near: 0.05, far: 2000 }}
        >
          <InspectorScene object={built.object} spin={spin} height={built.height} mixer={mixer} />
        </Canvas>
      </div>
    </div>
  )
}

function countParts(object: THREE.Object3D): number {
  let n = 0
  object.traverse((c) => {
    if (c instanceof THREE.Mesh) n++
  })
  return n
}

/** Keeps the toon ramp warm so inspector materials match the game's. */
export const INSPECTOR_RAMP = toonRamp

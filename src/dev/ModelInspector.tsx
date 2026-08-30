import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'

import { buildLandmark, type LandmarkDef } from '@/content/models/landmarks'
import { PROPS } from '@/content/models/props'
import { FrameOnce, Gizmo, PartPanel, useOverrides, type GizmoMode } from './PartEditor'
import { buildModel } from '@/content/models/procedural'
import { GOLD_COAST } from '@/content/routes/goldcoast'
import { SUBJECTS } from '@/content/subjects'
import { DAWN, toonRamp } from '@/render/palette'

import { DopeSheet } from './DopeSheet'
import { AngleGrid, ANGLES } from './inspectorViews'

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
  reach,
}: {
  object: THREE.Object3D
  spin: boolean
  height: number
  /** Largest dimension. Framing on height alone crops long animals and cars. */
  reach: number
}) {
  const ref = useRef<THREE.Group>(null)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera

  useEffect(() => {
    // Frame the subject: pull back proportional to its size and look at its
    // middle, so a pigeon and a 340 m tower both fill the view.
    //
    // Camera sits on -Z because models face local -Z. Viewing from +Z shows
    // every character from behind, which is exactly the wrong angle for judging
    // a face.
    const distance = Math.max(1.8, reach * 1.75)
    camera.position.set(distance * 0.55, Math.max(height * 0.66, reach * 0.3), -distance)
    camera.lookAt(0, height * 0.5, 0)
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
  reach,
  mixer,
  scrub,
  action,
  mode,
  gizmoTarget,
  gizmoMode,
  onGizmoChange,
}: {
  object: THREE.Object3D
  spin: boolean
  height: number
  reach: number
  mode: Mode
  gizmoTarget?: THREE.Object3D | null
  gizmoMode?: GizmoMode
  onGizmoChange?: () => void
  mixer: THREE.AnimationMixer | null
  /** Null plays normally; a number holds the clip at that fraction of its length. */
  scrub: number | null
  action: THREE.AnimationAction | null
}) {
  useFrame((_, delta) => {
    if (!mixer) return
    if (scrub === null) {
      mixer.update(Math.min(delta, 1 / 30))
      return
    }
    // Scrubbing: park the clip at an exact moment so a screenshot is
    // reproducible. Reviewing a walk cycle from whatever frame the turntable
    // happened to be on tells you very little.
    if (action) {
      action.paused = true
      action.time = action.getClip().duration * scrub
    }
    mixer.update(0)
  })

  const lights = (
    <>
      <color attach="background" args={[0x1a1f26]} />
      <hemisphereLight args={[DAWN.skyFill, DAWN.groundFill, 1.4]} />
      <directionalLight position={[6, 10, 5]} intensity={2.1} color={DAWN.key} />
      <directionalLight position={[-7, 4, -6]} intensity={0.5} color={0x8fa8d0} />

      {/* Ground and axes: without a reference plane it's impossible to tell a
          floating model from a correctly grounded one. */}
      <gridHelper args={[Math.max(4, reach * 3), 20, 0x4a5560, 0x2b333c]} position={[0, GROUND, 0]} />
      <axesHelper args={[Math.max(0.6, reach * 0.35)]} />

      <Turntable object={object} spin={spin} height={height} reach={reach} />
    </>
  )

  if (mode === 'parts') {
    // The turntable is replaced by a fixed model with orbit + gizmo, because
    // you cannot drag a handle on something that is rotating.
    return (
      <>
        <color attach="background" args={[0x1a1f26]} />
        <hemisphereLight args={[DAWN.skyFill, DAWN.groundFill, 1.4]} />
        <directionalLight position={[6, 10, 5]} intensity={2.1} color={DAWN.key} />
        <directionalLight position={[-7, 4, -6]} intensity={0.5} color={0x8fa8d0} />
        <gridHelper args={[Math.max(4, reach * 3), 20, 0x4a5560, 0x2b333c]} position={[0, GROUND, 0]} />
        <axesHelper args={[Math.max(0.6, reach * 0.35)]} />
        <group position={[0, GROUND, 0]}>
          <primitive object={object} />
        </group>
        <FrameOnce height={height} reach={reach} />
        <Gizmo
          target={gizmoTarget ?? null}
          mode={gizmoMode ?? 'translate'}
          onChange={onGizmoChange ?? (() => undefined)}
          height={height}
        />
      </>
    )
  }

  // The angle grid takes over rendering, so the scene contents are the same —
  // only the cameras differ.
  if (mode === 'angles') {
    return (
      <AngleGrid height={height} reach={reach}>
        {lights}
      </AngleGrid>
    )
  }

  return lights
}

type Mode = 'turntable' | 'angles' | 'animation' | 'parts'

type Entry =
  | { kind: 'subject'; id: string; label: string }
  | { kind: 'landmark'; id: string; label: string; def: LandmarkDef }
  | { kind: 'prop'; id: string; label: string; build: () => THREE.Object3D }

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
    const props: Entry[] = PROPS.map((p) => ({
      kind: 'prop',
      id: p.id,
      label: p.label,
      build: p.build,
    }))
    return [...subjects, ...props, ...landmarks]
  }, [])

  const [selected, setSelected] = useState(entries[0]?.id ?? '')
  const [seed, setSeed] = useState(1)
  const [spin, setSpin] = useState(true)
  const [clip, setClip] = useState<string | null>(null)
  const [scrub, setScrub] = useState<number | null>(null)
  const [mode, setMode] = useState<Mode>('turntable')
  const [selectedPart, setSelectedPart] = useState<string | null>(null)
  const [gizmoMode, setGizmoMode] = useState<GizmoMode>('translate')
  const [, forceRedraw] = useState(0)
  const [overrides, saveOverrides, overrideStatus] = useOverrides()
  const actionRef = useRef<THREE.AnimationAction | null>(null)

  const entry = entries.find((e) => e.id === selected) ?? entries[0]

  const built = useMemo(() => {
    if (!entry) return null
    if (entry.kind === 'prop') {
      const object = entry.build()
      const box = new THREE.Box3().setFromObject(object)
      const size = box.getSize(new THREE.Vector3())
      return {
        object,
        clips: [] as THREE.AnimationClip[],
        height: size.y,
        reach: Math.max(size.x, size.y, size.z),
        parts: countParts(object),
      }
    }
    if (entry.kind === 'landmark') {
      const object = buildLandmark({ ...entry.def, position: [0, 0, 0] })
      const box = new THREE.Box3().setFromObject(object)
      const size = box.getSize(new THREE.Vector3())
      return {
        object,
        clips: [] as THREE.AnimationClip[],
        height: size.y,
        reach: Math.max(size.x, size.y, size.z),
        parts: countParts(object),
      }
    }
    const def = SUBJECTS[entry.id]!
    const model = buildModel(def, seed, false)
    const box = new THREE.Box3().setFromObject(model.group)
    const size = box.getSize(new THREE.Vector3())
    return {
      object: model.group,
      clips: model.clips,
      height: size.y,
      reach: Math.max(size.x, size.y, size.z),
      parts: countParts(model.group),
    }
  }, [entry, seed])

  const activeClip = built?.clips.find((c) => c.name === (clip ?? built.clips[0]?.name)) ?? null

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
    if (found) {
      const a = mixer.clipAction(found)
      a.reset().play()
      a.paused = false
      actionRef.current = a
    } else {
      actionRef.current = null
    }
    return () => {
      mixer.stopAllAction()
    }
  }, [mixer, built, clip])

  // Reset the clip selection when switching models — clip names differ per kind.
  useEffect(() => {
    setClip(null)
  }, [selected])

  // Entering the keyframe view holds the clip: a dope sheet you can't stop is
  // useless, because the pose has moved by the time you read the row.
  useEffect(() => {
    if (mode === 'animation') setScrub((v) => (v === null ? 0 : v))
  }, [mode])

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

        {built.clips.length > 0 && (
          <>
            <h2 style={{ marginTop: '1rem' }}>Scrub</h2>
            <div className="row">
              <button onClick={() => setScrub((v) => (v === null ? 0 : null))}>
                {scrub === null ? 'Hold' : 'Play'}
              </button>
              <span className="inspector-value">
                {scrub === null ? 'playing' : `${Math.round(scrub * 100)}%`}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={scrub === null ? 0 : Math.round(scrub * 100)}
              onChange={(e) => setScrub(Number(e.target.value) / 100)}
            />
          </>
        )}

        <h2 style={{ marginTop: '1.5rem' }}>View</h2>
        {(['turntable', 'angles', 'animation', 'parts'] as const).map((m) => (
          <button key={m} className={mode === m ? 'primary' : ''} onClick={() => setMode(m)}>
            {m === 'turntable'
              ? 'Turntable'
              : m === 'angles'
                ? 'All angles'
                : m === 'animation'
                  ? 'Keyframes'
                  : 'Edit parts'}
          </button>
        ))}
        {mode !== 'angles' && mode !== 'parts' && (
          <button onClick={() => setSpin((s) => !s)}>{spin ? 'Stop' : 'Spin'}</button>
        )}

        {mode === 'parts' && entry.kind !== 'landmark' && (
          <PartPanel
            root={built.object}
            species={entry.id}
            selectedName={selectedPart}
            onSelect={setSelectedPart}
            mode={gizmoMode}
            onMode={setGizmoMode}
            table={overrides}
            onSave={saveOverrides}
            status={overrideStatus}
          />
        )}

        <div className="inspector-stats">
          <div>{entry.kind}</div>
          <div>{built.parts} meshes</div>
          <div>{built.height.toFixed(2)} m tall</div>
        </div>

        <a className="inspector-back" href="?">← back to the game</a>
      </aside>

      <div className={`inspector-view ${mode === 'animation' ? 'with-dope' : ''}`}>
        <div className="inspector-canvas">
          <Canvas
            key={`${selected}:${seed}:${mode}`}
            dpr={[1, 1.5]}
            camera={{ fov: 40, near: 0.05, far: 2000 }}
          >
            <InspectorScene
              object={built.object}
              spin={mode === 'angles' ? false : spin}
              height={built.height}
              reach={built.reach}
              mixer={mixer}
              scrub={scrub}
              action={actionRef.current}
              mode={mode}
              gizmoTarget={
                mode === 'parts' && selectedPart
                  ? (built.object.getObjectByName(selectedPart) ?? null)
                  : null
              }
              gizmoMode={gizmoMode}
              onGizmoChange={() => forceRedraw((v) => v + 1)}
            />
          </Canvas>

          {mode === 'angles' && (
            <div className="angle-labels">
              {ANGLES.map((a) => (
                <div key={a.label} className="angle-label">
                  {a.label}
                </div>
              ))}
            </div>
          )}
        </div>

        {mode === 'animation' && activeClip && (
          <DopeSheet
            clip={activeClip}
            time={(scrub ?? 0) * activeClip.duration}
            onSeek={(seconds) => setScrub(seconds / (activeClip.duration || 1))}
          />
        )}
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

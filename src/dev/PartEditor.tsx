import { OrbitControls, TransformControls } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'

import type { PartOverride, PartOverrides } from '@/content/models/partOverrides'

/**
 * Dragging a model into shape, instead of typing coordinates at it.
 *
 * Every model here has needed several rounds of "nudge a literal, rebuild,
 * look again" — the horse's rider, the cyclist's legs, the doorman's cap, the
 * awnings. That loop is slow and it is worst on exactly the adjustments that
 * matter most, which are small.
 *
 * What it edits is a transform on a *named part*, not a mesh. That is the whole
 * reason it can coexist with the procedural builders: the shape still comes
 * from code and still rolls its own variation per seed, and this adjusts where
 * a named piece of it sits. A vertex editor would give one fixed mesh and lose
 * the variation entirely.
 */

export type GizmoMode = 'translate' | 'rotate' | 'scale'

/** Everything in the model that can be addressed by name. */
export function listParts(root: THREE.Object3D): Array<{ name: string; depth: number }> {
  const out: Array<{ name: string; depth: number }> = []
  const walk = (node: THREE.Object3D, depth: number) => {
    if (node.name && node !== root) out.push({ name: node.name, depth })
    for (const child of node.children) walk(child, node.name && node !== root ? depth + 1 : depth)
  }
  walk(root, 0)
  return out
}

/** Round to millimetres and milliradians, so saved files stay readable. */
const trim = (v: number) => Math.round(v * 1000) / 1000

export function transformOf(node: THREE.Object3D): PartOverride {
  return {
    position: [trim(node.position.x), trim(node.position.y), trim(node.position.z)],
    rotation: [trim(node.rotation.x), trim(node.rotation.y), trim(node.rotation.z)],
    scale: [trim(node.scale.x), trim(node.scale.y), trim(node.scale.z)],
  }
}

/**
 * Frames the model once on entry, then leaves the camera to the orbit control.
 *
 * Without this the parts view inherits wherever the camera happened to be —
 * which for a horse meant looking at its knees.
 */
export function FrameOnce({ height, reach }: { height: number; reach: number }) {
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    const distance = Math.max(2.2, reach * 2.1)
    camera.position.set(distance * 0.62, Math.max(height * 0.62, reach * 0.35), -distance)
    camera.lookAt(0, height * 0.5, 0)
    camera.updateProjectionMatrix()
  }, [camera, height, reach])
  return null
}

export function Gizmo({
  target,
  mode,
  onChange,
  height,
}: {
  target: THREE.Object3D | null
  mode: GizmoMode
  onChange: () => void
  height: number
}) {
  return (
    <>
      <OrbitControls makeDefault enableDamping={false} target={[0, height * 0.5, 0]} />
      {target && (
        <TransformControls object={target} mode={mode} onObjectChange={onChange} />
      )}
    </>
  )
}

/**
 * The saved overrides for the whole project, loaded once from the dev endpoint.
 *
 * Read from the server rather than from the bundled JSON so that a save is
 * visible after a reload without waiting for Vite to re-bundle.
 */
export function useOverrides(): [PartOverrides, (next: PartOverrides) => void, string] {
  const [table, setTable] = useState<PartOverrides>({})
  const [status, setStatus] = useState('')

  useEffect(() => {
    fetch('/__parts')
      .then((r) => (r.ok ? r.json() : {}))
      .then((data: PartOverrides) => setTable(data ?? {}))
      .catch(() => undefined)
  }, [])

  const save = (next: PartOverrides) => {
    setTable(next)
    setStatus('saving…')
    fetch('/__parts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(next, null, 2),
    })
      .then((r) => setStatus(r.ok ? 'saved — reload to see it in the game' : 'save failed'))
      .catch(() => setStatus('save failed'))
  }

  return [table, save, status]
}

/** The sidebar for the parts view. */
export function PartPanel({
  root,
  species,
  selectedName,
  onSelect,
  mode,
  onMode,
  table,
  onSave,
  status,
}: {
  root: THREE.Object3D
  species: string
  selectedName: string | null
  onSelect: (name: string | null) => void
  mode: GizmoMode
  onMode: (mode: GizmoMode) => void
  table: PartOverrides
  onSave: (next: PartOverrides) => void
  status: string
}) {
  const parts = useMemo(() => listParts(root), [root])
  const selected = selectedName ? root.getObjectByName(selectedName) ?? null : null
  const edited = table[species] ?? {}

  const commit = () => {
    if (!selected || !selectedName) return
    onSave({
      ...table,
      [species]: { ...edited, [selectedName]: transformOf(selected) },
    })
  }

  const revert = () => {
    if (!selectedName) return
    const next = { ...edited }
    delete next[selectedName]
    // Drop the species entirely once its last override goes, rather than
    // leaving an empty object behind in the file.
    const table2 = { ...table }
    if (Object.keys(next).length === 0) delete table2[species]
    else table2[species] = next
    onSave(table2)
  }

  return (
    <>
      <h2 style={{ marginTop: '1.5rem' }}>Gizmo</h2>
      <div className="row">
        {(['translate', 'rotate', 'scale'] as const).map((m) => (
          <button key={m} className={mode === m ? 'primary' : ''} onClick={() => onMode(m)}>
            {m === 'translate' ? 'move' : m}
          </button>
        ))}
      </div>

      <h2 style={{ marginTop: '1.5rem' }}>Parts</h2>
      <div className="inspector-parts">
        {parts.map((p) => (
          <button
            key={p.name}
            className={p.name === selectedName ? 'primary' : ''}
            style={{ paddingLeft: `${8 + p.depth * 10}px` }}
            onClick={() => onSelect(p.name === selectedName ? null : p.name)}
          >
            {edited[p.name] ? '● ' : ''}
            {p.name}
          </button>
        ))}
      </div>

      {selected && (
        <>
          <h2 style={{ marginTop: '1.5rem' }}>{selectedName}</h2>
          <div className="inspector-value">
            pos {selected.position.toArray().map((v) => v.toFixed(2)).join(', ')}
            <br />
            rot {selected.rotation.toArray().slice(0, 3).map((v) => Number(v).toFixed(2)).join(', ')}
            <br />
            scl {selected.scale.toArray().map((v) => v.toFixed(2)).join(', ')}
          </div>
          <div className="row">
            <button className="primary" onClick={commit}>
              save part
            </button>
            <button onClick={revert} disabled={!edited[selectedName ?? '']}>
              revert
            </button>
          </div>
        </>
      )}

      <div className="inspector-value" style={{ marginTop: '0.75rem' }}>{status}</div>
    </>
  )
}

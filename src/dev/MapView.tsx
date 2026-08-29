import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'

import { CITY } from '@/content/models/city'
import { ROUTES } from '@/content/routes/goldcoast'

/**
 * The district from above, and a route editor, at `?debug=map`.
 *
 * Screenshots answer "does this look right" and are useless for "does this go
 * the right way". Arguing about which block a turn belongs on, from inside a
 * street canyon at eye level, means guessing — and the guesses were wrong three
 * times running: the route ran nine metres inside a block of buildings on
 * Walton, turned a block before the Hancock rather than at it, and cut a block
 * out of Michigan entirely.
 *
 * So this draws the real OSM footprints and street centrelines, and lets the
 * route be placed on them directly. Saving POSTs to a dev-only endpoint that
 * writes the draft to disk, because the alternative on a phone is copying a
 * hundred numbers out of a textarea.
 *
 * North is up: world is +X east and −Z north, so screen Y increases with Z.
 */

const SECTION_COLORS: Record<string, string> = {
  beach: '#e0c98a',
  underpass: '#8b7fd6',
  lakeshore: '#5fb0c9',
  michigan: '#f0a04b',
  delaware: '#7ac77a',
  rush: '#e8607a',
  triangle: '#9ad35c',
  alley: '#b08968',
  inside: '#d96ecf',
}

interface DraftPoint {
  x: number
  y: number
  z: number
  /** Which section this point belongs to. Sections are runs of equal ids. */
  section: string
}

interface View {
  x: number
  z: number
  zoom: number
}

const route = ROUTES.goldcoast!

/** The route as it stands in code, as editable points. */
function fromRoute(): DraftPoint[] {
  const sectionOf = (index: number) =>
    route.sections.find((s) => index >= s.waypoints[0] && index <= s.waypoints[1])?.id ??
    route.sections[0]!.id
  return route.waypoints.map(([x, y, z], i) => ({ x, y, z, section: sectionOf(i) }))
}

/** Contiguous runs of one section id, which is what the route file needs. */
function runsOf(points: DraftPoint[]): Array<{ id: string; from: number; to: number }> {
  const runs: Array<{ id: string; from: number; to: number }> = []
  points.forEach((p, i) => {
    const last = runs[runs.length - 1]
    if (last && last.id === p.section) last.to = i
    else runs.push({ id: p.section, from: i, to: i })
  })
  return runs
}

export function MapView() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [view, setView] = useState<View | null>(null)
  const [points, setPoints] = useState<DraftPoint[]>(fromRoute)
  const [history, setHistory] = useState<DraftPoint[][]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [editing, setEditing] = useState(false)
  const [snap, setSnap] = useState(true)
  const [section, setSection] = useState(route.sections[0]!.id)
  const [status, setStatus] = useState('')
  const [showBuildings, setShowBuildings] = useState(true)
  const [showNames, setShowNames] = useState(true)

  const drag = useRef<{
    pointerX: number
    pointerY: number
    view: View
    waypoint: number | null
    moved: boolean
  } | null>(null)

  /** Any draft saved earlier wins over the code, so a reload keeps the work. */
  useEffect(() => {
    fetch('/__route')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { points?: DraftPoint[] } | null) => {
        if (data?.points?.length) {
          setPoints(data.points)
          setStatus('loaded saved draft')
        }
      })
      .catch(() => undefined)
  }, [])

  const commit = useCallback(
    (next: DraftPoint[]) => {
      setHistory((h) => [...h.slice(-40), points])
      setPoints(next)
      setStatus('')
    },
    [points],
  )

  // The spline the player actually walks, at the rail's own tension.
  const spline = useMemo(() => {
    if (points.length < 2) return []
    const curve = new THREE.CatmullRomCurve3(
      points.map((p) => new THREE.Vector3(p.x, p.y, p.z)),
      false,
      'catmullrom',
      0.16,
    )
    const out: Array<[number, number, string]> = []
    const steps = 700
    const v = new THREE.Vector3()
    const runs = runsOf(points)
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      curve.getPoint(t, v)
      // Which section this sample is in, by nearest waypoint.
      const index = Math.min(points.length - 1, Math.round(t * (points.length - 1)))
      const run = runs.find((r) => index >= r.from && index <= r.to)
      out.push([v.x, v.z, run?.id ?? ''])
    }
    return out
  }, [points])

  /** Nearest point on any street centreline, for snapping. */
  const snapTo = useCallback((x: number, z: number) => {
    let best: [number, number] | null = null
    let bestD = 14
    for (const street of CITY.streets) {
      for (let i = 1; i < street.p.length; i++) {
        const [ax, az] = street.p[i - 1]!
        const [bx, bz] = street.p[i]!
        const vx = bx - ax
        const vz = bz - az
        const len2 = vx * vx + vz * vz || 1
        const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / len2))
        const px = ax + vx * t
        const pz = az + vz * t
        const d = Math.hypot(x - px, z - pz)
        if (d < bestD) {
          bestD = d
          best = [px, pz]
        }
      }
    }
    return best
  }, [])

  useEffect(() => {
    if (view) return
    // `?at=x,z&zoom=n` frames a specific place, so a view can be linked rather
    // than described.
    const params = new URLSearchParams(window.location.search)
    const at = params.get('at')?.split(',').map(Number)
    if (at && at.length === 2 && at.every(Number.isFinite)) {
      setView({ x: at[0]!, z: at[1]!, zoom: Number(params.get('zoom')) || 1 })
      return
    }

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
    for (const p of points) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z)
    }
    const w = window.innerWidth - 250
    const h = window.innerHeight
    setView({
      x: (minX + maxX) / 2,
      z: (minZ + maxZ) / 2,
      zoom: Math.min(w / (maxX - minX + 220), h / (maxZ - minZ + 220)),
    })
  }, [points, view])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !view) return

    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    canvas.width = w * dpr
    canvas.height = h * dpr
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const sx = (x: number) => (x - view.x) * view.zoom + w / 2
    const sy = (z: number) => (z - view.z) * view.zoom + h / 2

    ctx.fillStyle = '#0d0f13'
    ctx.fillRect(0, 0, w, h)

    if (showBuildings) {
      ctx.strokeStyle = '#2b313c'
      ctx.fillStyle = '#171b22'
      ctx.lineWidth = 1
      for (const b of CITY.buildings) {
        ctx.beginPath()
        b.r.forEach(([x, z], i) => (i ? ctx.lineTo(sx(x), sy(z)) : ctx.moveTo(sx(x), sy(z))))
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
      }
    }

    ctx.strokeStyle = '#3d4653'
    ctx.lineWidth = 2
    for (const s of CITY.streets) {
      ctx.beginPath()
      s.p.forEach(([x, z], i) => (i ? ctx.lineTo(sx(x), sy(z)) : ctx.moveTo(sx(x), sy(z))))
      ctx.stroke()
    }

    if (showNames && view.zoom > 0.14) {
      ctx.fillStyle = '#7d859a'
      ctx.font = '11px ui-monospace, monospace'
      const drawn = new Set<string>()
      for (const s of CITY.streets) {
        if (drawn.has(s.n) || s.p.length < 2) continue
        const mid = s.p[Math.floor(s.p.length / 2)]!
        const x = sx(mid[0])
        const y = sy(mid[1])
        if (x < 0 || x > w || y < 0 || y > h) continue
        drawn.add(s.n)
        ctx.fillText(s.n.replace(/^(North|East|West|South) /, ''), x + 4, y - 4)
      }
    }

    // The spline, coloured by section.
    ctx.lineWidth = 5
    ctx.lineCap = 'round'
    for (let i = 1; i < spline.length; i++) {
      const [ax, az, id] = spline[i - 1]!
      const [bx, bz] = spline[i]!
      ctx.strokeStyle = SECTION_COLORS[id] ?? '#ffffff'
      ctx.beginPath()
      ctx.moveTo(sx(ax), sy(az))
      ctx.lineTo(sx(bx), sy(bz))
      ctx.stroke()
    }

    // Waypoints.
    ctx.font = 'bold 11px ui-monospace, monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    points.forEach((p, i) => {
      const x = sx(p.x)
      const y = sy(p.z)
      const isSelected = i === selected
      ctx.fillStyle = '#0d0f13'
      ctx.beginPath()
      ctx.arc(x, y, isSelected ? 11 : 8, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = isSelected ? '#ffffff' : (SECTION_COLORS[p.section] ?? '#ffd45e')
      ctx.lineWidth = isSelected ? 3 : 1.5
      ctx.stroke()
      ctx.fillStyle = isSelected ? '#ffffff' : (SECTION_COLORS[p.section] ?? '#ffd45e')
      ctx.fillText(String(i), x, y)
    })
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'

    const metres = view.zoom > 0.5 ? 50 : view.zoom > 0.2 ? 100 : 200
    ctx.strokeStyle = '#c9d1d9'
    ctx.fillStyle = '#c9d1d9'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(20, h - 26)
    ctx.lineTo(20 + metres * view.zoom, h - 26)
    ctx.stroke()
    ctx.font = '11px ui-monospace, monospace'
    ctx.fillText(`${metres} m`, 20, h - 32)
    ctx.fillText('N ↑', w - 40, 24)
  }, [view, points, spline, selected, showBuildings, showNames])

  const toWorld = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas || !view) return null
    const rect = canvas.getBoundingClientRect()
    return {
      x: (clientX - rect.left - rect.width / 2) / view.zoom + view.x,
      z: (clientY - rect.top - rect.height / 2) / view.zoom + view.z,
    }
  }

  const waypointNear = (clientX: number, clientY: number): number | null => {
    const world = toWorld(clientX, clientY)
    if (!world || !view) return null
    // A finger is about 20 px wide, so the hit radius is in screen space.
    const radius = 16 / view.zoom
    let best: number | null = null
    let bestD = radius
    points.forEach((p, i) => {
      const d = Math.hypot(p.x - world.x, p.z - world.z)
      if (d < bestD) {
        bestD = d
        best = i
      }
    })
    return best
  }

  const save = () => {
    setStatus('saving…')
    fetch('/__route', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ points, sections: runsOf(points) }, null, 2),
    })
      .then((r) => setStatus(r.ok ? 'saved to goldcoast.draft.json' : 'save failed'))
      .catch(() => setStatus('save failed'))
  }

  const runs = runsOf(points)
  const duplicated = runs
    .map((r) => r.id)
    .filter((id, i, all) => all.indexOf(id) !== i)

  return (
    <div className="mapview">
      <aside className="mapview__panel">
        <h1>MAP</h1>
        <p className="mapview__hint">
          {editing ? 'Tap to add · drag a point to move' : 'Drag to pan · scroll to zoom'}
        </p>

        <button className={editing ? 'on' : ''} onClick={() => setEditing(!editing)}>
          {editing ? '● EDITING' : 'EDIT ROUTE'}
        </button>

        {editing && (
          <>
            <h2>ADD TO SECTION</h2>
            <ul className="mapview__sections">
              {route.sections.map((s) => (
                <li key={s.id}>
                  <button
                    className={section === s.id ? 'on' : ''}
                    onClick={() => setSection(s.id)}
                  >
                    <span style={{ background: SECTION_COLORS[s.id] }} />
                    {s.title}
                  </button>
                </li>
              ))}
            </ul>

            <label>
              <input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} />
              snap to street
            </label>

            <h2>POINT {selected ?? '—'}</h2>
            <div className="mapview__row">
              <button
                disabled={selected === null}
                onClick={() => {
                  if (selected === null) return
                  commit(points.filter((_, i) => i !== selected))
                  setSelected(null)
                }}
              >
                delete
              </button>
              <button
                disabled={selected === null || selected >= points.length - 1}
                onClick={() => {
                  if (selected === null) return
                  const a = points[selected]!
                  const b = points[selected + 1]!
                  const mid: DraftPoint = {
                    x: (a.x + b.x) / 2,
                    y: (a.y + b.y) / 2,
                    z: (a.z + b.z) / 2,
                    section: a.section,
                  }
                  commit([...points.slice(0, selected + 1), mid, ...points.slice(selected + 1)])
                  setSelected(selected + 1)
                }}
              >
                insert after
              </button>
            </div>
            <div className="mapview__row">
              <button
                disabled={!history.length}
                onClick={() => {
                  const prev = history[history.length - 1]
                  if (!prev) return
                  setPoints(prev)
                  setHistory((h) => h.slice(0, -1))
                  setSelected(null)
                }}
              >
                undo
              </button>
              <button onClick={() => { commit(fromRoute()); setSelected(null) }}>
                reset
              </button>
            </div>
            <button className="mapview__save" onClick={save}>
              SAVE DRAFT
            </button>
            {duplicated.length > 0 && (
              <p className="mapview__warn">
                split section{duplicated.length > 1 ? 's' : ''}: {duplicated.join(', ')} — each
                section has to be one run of consecutive points
              </p>
            )}
          </>
        )}

        {!editing && (
          <>
            <label>
              <input
                type="checkbox"
                checked={showBuildings}
                onChange={(e) => setShowBuildings(e.target.checked)}
              />
              buildings
            </label>
            <label>
              <input
                type="checkbox"
                checked={showNames}
                onChange={(e) => setShowNames(e.target.checked)}
              />
              street names
            </label>
            <h2>SECTIONS</h2>
            <ul>
              {route.sections.map((s) => (
                <li key={s.id}>
                  <span style={{ background: SECTION_COLORS[s.id] }} />
                  {s.title}
                </li>
              ))}
            </ul>
          </>
        )}

        <p className="mapview__coords">{status}</p>
        <a href="?">← back to the game</a>
      </aside>

      <canvas
        ref={canvasRef}
        className="mapview__canvas"
        onPointerDown={(e) => {
          if (!view) return
          const hit = editing ? waypointNear(e.clientX, e.clientY) : null
          if (hit !== null) setSelected(hit)
          drag.current = {
            pointerX: e.clientX,
            pointerY: e.clientY,
            view,
            waypoint: hit,
            moved: false,
          }
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          const d = drag.current
          if (!d || !view) return
          const dx = e.clientX - d.pointerX
          const dy = e.clientY - d.pointerY
          if (Math.hypot(dx, dy) > 3) d.moved = true

          if (d.waypoint !== null) {
            const world = toWorld(e.clientX, e.clientY)
            if (!world) return
            const snapped = snap ? snapTo(world.x, world.z) : null
            setPoints((prev) =>
              prev.map((p, i) =>
                i === d.waypoint
                  ? { ...p, x: snapped?.[0] ?? world.x, z: snapped?.[1] ?? world.z }
                  : p,
              ),
            )
            return
          }

          setView({ x: d.view.x - dx / view.zoom, z: d.view.z - dy / view.zoom, zoom: view.zoom })
        }}
        onPointerUp={(e) => {
          const d = drag.current
          drag.current = null
          if (!d || !editing || d.moved || d.waypoint !== null) return

          // A tap on empty ground appends to the selected section, after the
          // last point already in it — so a section stays one run.
          const world = toWorld(e.clientX, e.clientY)
          if (!world) return
          const snapped = snap ? snapTo(world.x, world.z) : null
          const point: DraftPoint = {
            x: snapped?.[0] ?? world.x,
            y: 1.7,
            z: snapped?.[1] ?? world.z,
            section,
          }
          const run = runsOf(points).find((r) => r.id === section)
          const insertAt = run ? run.to + 1 : points.length
          commit([...points.slice(0, insertAt), point, ...points.slice(insertAt)])
          setSelected(insertAt)
        }}
        onWheel={(e) => {
          if (!view) return
          const factor = Math.exp(-e.deltaY * 0.0015)
          setView({ ...view, zoom: Math.max(0.03, Math.min(4, view.zoom * factor)) })
        }}
      />
    </div>
  )
}

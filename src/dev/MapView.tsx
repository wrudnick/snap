import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'

import { CITY } from '@/content/models/city'
import { ROUTES } from '@/content/routes/goldcoast'
import type { SubjectPlacement } from '@/content/routes/types'
import { Rail } from '@/game/rail'
import { resolveRoute, type ResolvedSection } from '@/game/sections'

/**
 * The whole district, from above, at `?debug=map`.
 *
 * Screenshots of the game answer "does this look right"; they are useless for
 * "does this go the right way". Arguing about which block the route turns at,
 * from inside a street canyon at eye level, means guessing — and the guesses
 * have been wrong twice. This draws the actual OSM footprints, the actual
 * street centrelines with their names, and the actual route over the top, so
 * the question is settled by looking rather than by inference.
 *
 * North is up: world is +X east and −Z north, so screen Y increases with Z.
 */

const SECTION_COLORS: Record<string, string> = {
  beach: '#e0c98a',
  underpass: '#8b7fd6',
  lakeshore: '#5fb0c9',
  michigan: '#f0a04b',
  chestnut: '#7ac77a',
  rush: '#e8607a',
  triangle: '#9ad35c',
  alley: '#b08968',
  inside: '#d96ecf',
}

interface View {
  x: number
  z: number
  zoom: number
}

function anchorT(at: NonNullable<SubjectPlacement['at']>, sections: ResolvedSection[]): number {
  if ('t' in at) return at.t
  const s = sections.find((v) => v.id === at.section)
  return s ? s.tStart + at.u * (s.tEnd - s.tStart) : 0
}

export function MapView() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [view, setView] = useState<View | null>(null)
  const [showBuildings, setShowBuildings] = useState(true)
  const [showNames, setShowNames] = useState(true)
  const [hover, setHover] = useState<string>('')
  const drag = useRef<{ x: number; y: number; view: View } | null>(null)

  const { route, sections, path, subjects } = useMemo(() => {
    const r = ROUTES.goldcoast!
    const rl = new Rail(r)
    const resolved = resolveRoute(r, rl)
    const p = new THREE.Vector3()

    // The rail sampled densely — the spline, not the waypoints, is what the
    // player actually walks.
    const pts: Array<[number, number]> = []
    const steps = 600
    for (let i = 0; i <= steps; i++) {
      rl.positionAt(i / steps, p)
      pts.push([p.x, p.z])
    }

    const right = new THREE.Vector3()
    const subs = r.subjects.map((s) => {
      if (!s.at) return { id: s.id, species: s.species, x: s.position?.[0] ?? 0, z: s.position?.[2] ?? 0 }
      const t = anchorT(s.at, resolved.sections)
      rl.positionAt(t, p)
      rl.rightAt(t, right)
      return {
        id: s.id,
        species: s.species,
        x: p.x - right.x * s.at.offset,
        z: p.z - right.z * s.at.offset,
      }
    })

    return { route: r, sections: resolved.sections, path: pts, subjects: subs }
  }, [])

  // Fit the route on first paint.
  useEffect(() => {
    if (view) return
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
    for (const [x, z] of path) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x)
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z)
    }
    const w = window.innerWidth - 240
    const h = window.innerHeight
    const zoom = Math.min(w / (maxX - minX + 200), h / (maxZ - minZ + 200))
    setView({ x: (minX + maxX) / 2, z: (minZ + maxZ) / 2, zoom })
  }, [path, view])

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

    // --- buildings ---
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

    // --- streets ---
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

    // --- the route, coloured by section ---
    ctx.lineWidth = 5
    ctx.lineCap = 'round'
    for (const section of sections) {
      ctx.strokeStyle = SECTION_COLORS[section.id] ?? '#ffffff'
      ctx.beginPath()
      const from = Math.floor(section.tStart * (path.length - 1))
      const to = Math.ceil(section.tEnd * (path.length - 1))
      for (let i = from; i <= to && i < path.length; i++) {
        const [x, z] = path[i]!
        i === from ? ctx.moveTo(sx(x), sy(z)) : ctx.lineTo(sx(x), sy(z))
      }
      ctx.stroke()
    }

    // --- subjects ---
    ctx.fillStyle = '#ffffff'
    for (const s of subjects) {
      ctx.beginPath()
      ctx.arc(sx(s.x), sy(s.z), 2.2, 0, Math.PI * 2)
      ctx.fill()
    }

    // --- waypoints, numbered ---
    ctx.font = 'bold 11px ui-monospace, monospace'
    route.waypoints.forEach((wp, i) => {
      const x = sx(wp[0])
      const y = sy(wp[2])
      ctx.fillStyle = '#0d0f13'
      ctx.beginPath()
      ctx.arc(x, y, 8, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#ffd45e'
      ctx.lineWidth = 1.5
      ctx.stroke()
      ctx.fillStyle = '#ffd45e'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(i), x, y)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
    })

    // --- scale bar ---
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
  }, [view, showBuildings, showNames, sections, path, subjects, route.waypoints])

  const toWorld = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas || !view) return null
    const rect = canvas.getBoundingClientRect()
    return {
      x: (clientX - rect.left - rect.width / 2) / view.zoom + view.x,
      z: (clientY - rect.top - rect.height / 2) / view.zoom + view.z,
    }
  }

  return (
    <div className="mapview">
      <aside className="mapview__panel">
        <h1>MAP</h1>
        <p className="mapview__hint">Drag to pan · scroll to zoom</p>
        <label>
          <input type="checkbox" checked={showBuildings} onChange={(e) => setShowBuildings(e.target.checked)} />
          buildings
        </label>
        <label>
          <input type="checkbox" checked={showNames} onChange={(e) => setShowNames(e.target.checked)} />
          street names
        </label>
        <h2>SECTIONS</h2>
        <ul>
          {sections.map((s) => (
            <li key={s.id}>
              <span style={{ background: SECTION_COLORS[s.id] }} />
              {s.title}
            </li>
          ))}
        </ul>
        <p className="mapview__coords">{hover}</p>
        <a href="?">← back to the game</a>
      </aside>

      <canvas
        ref={canvasRef}
        className="mapview__canvas"
        onPointerDown={(e) => {
          if (!view) return
          drag.current = { x: e.clientX, y: e.clientY, view }
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          const world = toWorld(e.clientX, e.clientY)
          if (world) setHover(`x ${world.x.toFixed(0)}  z ${world.z.toFixed(0)}`)
          const d = drag.current
          if (!d || !view) return
          setView({
            x: d.view.x - (e.clientX - d.x) / view.zoom,
            z: d.view.z - (e.clientY - d.y) / view.zoom,
            zoom: view.zoom,
          })
        }}
        onPointerUp={() => (drag.current = null)}
        onWheel={(e) => {
          if (!view) return
          const factor = Math.exp(-e.deltaY * 0.0015)
          setView({ ...view, zoom: Math.max(0.03, Math.min(4, view.zoom * factor)) })
        }}
      />
    </div>
  )
}

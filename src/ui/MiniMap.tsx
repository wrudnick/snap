import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

import type { RouteDef } from '@/content/routes/types'
import type { Rail } from '@/game/rail'
import { runtime } from '@/game/runtime'
import { input } from '@/input'
import type { ResolvedCheckpoint } from '@/game/sections'
import { LANDMARK_MARKERS } from '@/content/models/landmarkScene'

/**
 * Route minimap.
 *
 * Exists so route feedback can be specific — "the block after the Rush corner"
 * rather than "somewhere in the middle". Draws the walked route over the street
 * grid, marks the checkpoints and landmarks, and shows where you are and which
 * way you're facing.
 *
 * Rendered to a 2D canvas from the same rAF loop pattern as the rest of the HUD:
 * position changes every frame, and pushing that through React would re-render
 * the interface at 60fps for a 15-pixel triangle.
 *
 * North is up, matching the satellite view the route was planned from.
 */

const WIDTH = 260
const HEIGHT = 190
const PAD = 12

interface Bounds {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export function MiniMap({
  route,
  rail,
  checkpoints,
}: {
  route: RouteDef
  rail: Rail
  checkpoints: ResolvedCheckpoint[]
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // The draw loop owns the world->map projection; clicking needs to invert it,
  // so the mapping is stashed here rather than recomputed and risking drift.
  const projection = useRef<{ scale: number; offsetX: number; offsetY: number } | null>(null)

  // Sampled once: the spline's actual shape, not just its control points.
  const path = useMemo(
    () => rail.samplePoints(240).map((p) => [p.x, p.z] as [number, number]),
    [rail],
  )

  const bounds = useMemo<Bounds>(() => {
    let minX = Infinity
    let maxX = -Infinity
    let minZ = Infinity
    let maxZ = -Infinity
    for (const [x, z] of path) {
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minZ = Math.min(minZ, z)
      maxZ = Math.max(maxZ, z)
    }
    // Margin so the route doesn't run flush to the frame, and so the corridors
    // heading off-map read as streets continuing rather than as clipping.
    const margin = 60
    return {
      minX: minX - margin,
      maxX: maxX + margin,
      minZ: minZ - margin,
      maxZ: maxZ + margin,
    }
  }, [path])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = WIDTH * dpr
    canvas.height = HEIGHT * dpr
    ctx.scale(dpr, dpr)

    // World is +X east, −Z north. Screen is +x right, +y down. North up means
    // z maps directly to y, so no flip — a southbound walk moves down the map.
    const spanX = bounds.maxX - bounds.minX
    const spanZ = bounds.maxZ - bounds.minZ
    const scale = Math.min((WIDTH - PAD * 2) / spanX, (HEIGHT - PAD * 2) / spanZ)
    const offsetX = (WIDTH - spanX * scale) / 2
    const offsetY = (HEIGHT - spanZ * scale) / 2

    const px = (x: number) => offsetX + (x - bounds.minX) * scale
    const py = (z: number) => offsetY + (z - bounds.minZ) * scale

    projection.current = { scale, offsetX, offsetY }

    const stroke = (
      points: Array<[number, number]>,
      color: string,
      width: number,
      dash: number[] = [],
    ) => {
      if (points.length < 2) return
      ctx.beginPath()
      ctx.setLineDash(dash)
      ctx.strokeStyle = color
      ctx.lineWidth = width
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      points.forEach(([x, z], i) =>
        i === 0 ? ctx.moveTo(px(x), py(z)) : ctx.lineTo(px(x), py(z)),
      )
      ctx.stroke()
      ctx.setLineDash([])
    }

    let raf = 0

    const draw = () => {
      ctx.clearRect(0, 0, WIDTH, HEIGHT)

      // Panel.
      ctx.fillStyle = 'rgba(10, 13, 17, 0.82)'
      ctx.fillRect(0, 0, WIDTH, HEIGHT)
      ctx.strokeStyle = 'rgba(232, 230, 227, 0.18)'
      ctx.lineWidth = 1
      ctx.strokeRect(0.5, 0.5, WIDTH - 1, HEIGHT - 1)

      // Chicago's grid, every 200 address units (~400 m), for scale reference.
      ctx.strokeStyle = 'rgba(232, 230, 227, 0.07)'
      ctx.lineWidth = 1
      for (let g = Math.ceil(bounds.minX / 100) * 100; g < bounds.maxX; g += 100) {
        ctx.beginPath()
        ctx.moveTo(px(g), 0)
        ctx.lineTo(px(g), HEIGHT)
        ctx.stroke()
      }
      for (let g = Math.ceil(bounds.minZ / 100) * 100; g < bounds.maxZ; g += 100) {
        ctx.beginPath()
        ctx.moveTo(0, py(g))
        ctx.lineTo(WIDTH, py(g))
        ctx.stroke()
      }

      // Streets we never walk but can see down.
      for (const corridor of route.corridors ?? []) {
        stroke(corridor.path, 'rgba(150, 168, 190, 0.4)', 3, [4, 3])
      }

      // The walked route.
      stroke(path, 'rgba(245, 196, 81, 0.85)', 2.4)

      // Landmarks, sited from their real footprints like everything else.
      for (const lm of LANDMARK_MARKERS) {
        const x = px(lm.x)
        const y = py(lm.z)
        if (x < -20 || x > WIDTH + 20) continue
        ctx.fillStyle = 'rgba(196, 214, 236, 0.9)'
        ctx.beginPath()
        ctx.arc(x, Math.max(-10, Math.min(HEIGHT + 10, y)), 2.4, 0, Math.PI * 2)
        ctx.fill()
      }

      // Checkpoints.
      const point = rail.scratch
      for (const cp of checkpoints) {
        rail.positionAt(cp.t, point)
        ctx.fillStyle = 'rgba(232, 230, 227, 0.55)'
        ctx.fillRect(px(point.x) - 1.5, py(point.z) - 1.5, 3, 3)
      }

      // The player: a triangle pointing along the current heading.
      rail.positionAt(runtime.t, point)
      const cx = px(point.x)
      const cy = py(point.z)
      // railHeading is three's -Z-forward convention; convert to map space.
      const heading = runtime.railHeading + runtime.yaw
      const fx = -Math.sin(heading)
      const fz = -Math.cos(heading)

      // View cone, so "which way am I looking" is legible at a glance.
      ctx.fillStyle = 'rgba(245, 196, 81, 0.16)'
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      const spread = 0.55
      const reach = 26
      for (const a of [-spread, spread]) {
        const ax = fx * Math.cos(a) - fz * Math.sin(a)
        const az = fx * Math.sin(a) + fz * Math.cos(a)
        ctx.lineTo(cx + ax * reach, cy + az * reach)
      }
      ctx.closePath()
      ctx.fill()

      ctx.fillStyle = runtime.paused ? '#e0736b' : '#f5c451'
      ctx.beginPath()
      ctx.arc(cx, cy, 3.2, 0, Math.PI * 2)
      ctx.fill()

      // North arrow.
      ctx.fillStyle = 'rgba(232, 230, 227, 0.5)'
      ctx.font = '9px ui-sans-serif, system-ui, sans-serif'
      ctx.fillText('N', WIDTH - 16, 16)
      ctx.beginPath()
      ctx.moveTo(WIDTH - 13, 20)
      ctx.lineTo(WIDTH - 16, 27)
      ctx.lineTo(WIDTH - 10, 27)
      ctx.closePath()
      ctx.fill()

      raf = requestAnimationFrame(draw)
    }

    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [bounds, path, rail, route.corridors, checkpoints])

  /**
   * Click to travel there.
   *
   * Inverts the map projection to a world position, then asks the rail for the
   * nearest point on the route — so clicking anywhere near the line snaps to the
   * path rather than requiring pixel accuracy. Writes to `input.seekTo` instead
   * of moving the camera directly, keeping the rig the only thing that sets
   * route position.
   */
  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const p = projection.current
    const canvas = canvasRef.current
    if (!p || !canvas) return

    const rect = canvas.getBoundingClientRect()
    const mx = ((e.clientX - rect.left) / rect.width) * WIDTH
    const my = ((e.clientY - rect.top) / rect.height) * HEIGHT

    const worldX = (mx - p.offsetX) / p.scale + bounds.minX
    const worldZ = (my - p.offsetY) / p.scale + bounds.minZ

    input.seekTo = rail.tNearest(new THREE.Vector3(worldX, 0, worldZ))
  }

  return (
    <canvas
      ref={canvasRef}
      className="minimap"
      style={{ width: WIDTH, height: HEIGHT }}
      onClick={onClick}
      title="Click to travel to that point on the route"
    />
  )
}

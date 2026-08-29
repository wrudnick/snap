import { useEffect, useRef, useState } from 'react'

import { runtime } from '@/game/runtime'
import type { ResolvedCheckpoint, ResolvedSection } from '@/game/sections'

/**
 * A timeline for the route: pause it, and drag to anywhere on it.
 *
 * Reviewing this game means looking at one spot very carefully, then the next
 * one. Everything that existed for that was a keyboard shortcut — pause on P,
 * checkpoints on comma and full stop, speed on the bracket keys — none of which
 * is reachable on a phone, and none of which lands you on a *particular* metre.
 * A bar you can drag does.
 *
 * Reads `runtime` on a timer rather than through React state: `t` changes every
 * frame and routing it through the reconciler would re-render at 60fps, which
 * is the one rule the scene code is written around. Ten updates a second is
 * plenty for a readout.
 */
export function Scrub({
  sections,
  checkpoints,
  length,
}: {
  sections: ResolvedSection[]
  checkpoints: ResolvedCheckpoint[]
  length: number
}) {
  const [t, setT] = useState(0)
  const [paused, setPaused] = useState(runtime.paused)
  const [speed, setSpeed] = useState(runtime.speed)
  const barRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  useEffect(() => {
    const id = window.setInterval(() => {
      if (!dragging.current) setT(runtime.t)
      setPaused(runtime.paused)
      setSpeed(runtime.speed)
    }, 100)
    return () => window.clearInterval(id)
  }, [])

  const seek = (clientX: number) => {
    const bar = barRef.current
    if (!bar) return
    const rect = bar.getBoundingClientRect()
    const next = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    runtime.t = next
    // The rig recomputes t from elapsed every frame, so elapsed has to move too
    // or the jump is undone on the next tick.
    runtime.elapsed = next * runtime.duration
    setT(next)
  }

  const section = sections.find((s) => t >= s.tStart && t < s.tEnd) ?? sections[sections.length - 1]

  return (
    <div className="scrub">
      <button
        className="scrub__play"
        onClick={() => {
          runtime.paused = !runtime.paused
          setPaused(runtime.paused)
        }}
      >
        {paused ? '▶' : '❚❚'}
      </button>

      <div
        ref={barRef}
        className="scrub__bar"
        onPointerDown={(e) => {
          dragging.current = true
          e.currentTarget.setPointerCapture(e.pointerId)
          seek(e.clientX)
        }}
        onPointerMove={(e) => dragging.current && seek(e.clientX)}
        onPointerUp={() => (dragging.current = false)}
      >
        {sections.map((s, i) => (
          <span
            key={s.id}
            className="scrub__section"
            style={{
              left: `${s.tStart * 100}%`,
              width: `${(s.tEnd - s.tStart) * 100}%`,
              opacity: i % 2 ? 0.5 : 0.28,
            }}
          />
        ))}
        {checkpoints.map((c) => (
          <span key={c.id} className="scrub__tick" style={{ left: `${c.t * 100}%` }} />
        ))}
        <span className="scrub__head" style={{ left: `${t * 100}%` }} />
      </div>

      <div className="scrub__readout">
        <strong>{section?.title ?? ''}</strong>
        <span>
          {(t * length).toFixed(0)} m · {(t * 100).toFixed(1)}%
        </span>
      </div>

      <div className="scrub__speed">
        {[0.25, 1, 3].map((v) => (
          <button
            key={v}
            className={Math.abs(speed - v) < 0.01 ? 'on' : ''}
            onClick={() => {
              runtime.speed = v
              setSpeed(v)
            }}
          >
            {v}×
          </button>
        ))}
      </div>
    </div>
  )
}

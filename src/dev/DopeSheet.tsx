import { useMemo } from 'react'
import type * as THREE from 'three'

/**
 * Keyframe view for the inspector.
 *
 * Scrubbing a clip tells you what it looks like; it doesn't tell you *why*. A
 * dope sheet does: it shows where every track's keys actually fall, so a limb
 * that snaps is visibly a track with two keys where it needs four, and a pose
 * that never reaches its extreme is visibly a key at the wrong time.
 *
 * Clicking a key jumps the scrub to that exact moment, which is the only
 * reliable way to check an extreme — dragging a slider always lands between
 * keys, showing an interpolated pose that exists in no keyframe.
 */

export interface TrackRow {
  /** `armL.rotation[x]` */
  name: string
  /** `armL` */
  node: string
  /** `rotation[x]` */
  property: string
  times: number[]
  /** One value per key for scalar tracks; null when the track is a vector. */
  values: number[] | null
  stride: number
}

export function readTracks(clip: THREE.AnimationClip): TrackRow[] {
  return clip.tracks.map((track) => {
    const [node = '', rest = ''] = track.name.split('.')
    const times = Array.from(track.times)
    const stride = track.values.length / times.length
    return {
      name: track.name,
      node,
      property: rest,
      times,
      values: stride === 1 ? Array.from(track.values) : null,
      stride,
    }
  })
}

/** Value of a scalar track at `time`, linearly interpolated between keys. */
export function sampleTrack(row: TrackRow, time: number): number | null {
  if (!row.values) return null
  const { times, values } = row
  if (times.length === 0) return null
  if (time <= times[0]!) return values[0]!
  if (time >= times[times.length - 1]!) return values[values.length - 1]!

  for (let i = 0; i < times.length - 1; i++) {
    const t0 = times[i]!
    const t1 = times[i + 1]!
    if (time >= t0 && time <= t1) {
      const f = t1 === t0 ? 0 : (time - t0) / (t1 - t0)
      return values[i]! + (values[i + 1]! - values[i]!) * f
    }
  }
  return values[values.length - 1]!
}

export function DopeSheet({
  clip,
  time,
  onSeek,
}: {
  clip: THREE.AnimationClip
  /** Current playhead, in seconds. */
  time: number
  onSeek: (seconds: number) => void
}) {
  const rows = useMemo(() => readTracks(clip), [clip])
  const duration = clip.duration || 1

  // Every distinct key time across all tracks — the moments the clip actually
  // defines. Stepping through these is stepping through the animation's
  // intent rather than through arbitrary slider positions.
  const keyTimes = useMemo(() => {
    const set = new Set<number>()
    for (const row of rows) for (const t of row.times) set.add(Math.round(t * 1000) / 1000)
    return [...set].sort((a, b) => a - b)
  }, [rows])

  const pct = (t: number) => `${(t / duration) * 100}%`

  return (
    <div className="dope">
      <div className="dope-head">
        <span className="dope-title">{clip.name}</span>
        <span className="dope-meta">
          {duration.toFixed(2)}s · {rows.length} tracks · {keyTimes.length} key times
        </span>
        <span className="dope-meta">
          t = {time.toFixed(2)}s
        </span>
      </div>

      {/* Shared timeline: clicking any key time steps the playhead exactly onto
          it, which is the only way to see a pose at its extreme. */}
      <div className="dope-ruler">
        <div className="dope-label">keys</div>
        <div className="dope-track">
          {keyTimes.map((t) => (
            <button
              key={t}
              className="dope-key dope-key-shared"
              style={{ left: pct(t) }}
              title={`${t.toFixed(3)}s`}
              onClick={() => onSeek(t)}
            />
          ))}
          <div className="dope-playhead" style={{ left: pct(time) }} />
        </div>
      </div>

      <div className="dope-rows">
        {rows.map((row) => {
          const value = sampleTrack(row, time)
          return (
            <div className="dope-row" key={row.name}>
              <div className="dope-label" title={row.name}>
                <span className="dope-node">{row.node}</span>
                <span className="dope-prop">{row.property}</span>
              </div>
              <div className="dope-track">
                {row.times.map((t, i) => (
                  <button
                    key={`${t}:${i}`}
                    className="dope-key"
                    style={{ left: pct(t) }}
                    title={
                      row.values
                        ? `${t.toFixed(3)}s → ${row.values[i]!.toFixed(3)}`
                        : `${t.toFixed(3)}s (vec${row.stride})`
                    }
                    onClick={() => onSeek(t)}
                  />
                ))}
                <div className="dope-playhead" style={{ left: pct(time) }} />
              </div>
              <div className="dope-value">
                {value === null ? `vec${row.stride}` : value.toFixed(2)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'

import type { Photo } from '@/game/state'

import { sharePhoto } from './sharePhoto'

/**
 * One shot, large, with everything known about the moment it was taken.
 *
 * The contact sheet is for judging photographs; this is for diagnosing them.
 * When something in a frame is wrong it is nearly always wrong *positionally* —
 * a car on a pavement, a pedestrian in four lanes, a building through a wall —
 * and a picture shows that something is off while saying nothing about where
 * anything actually was. So the coordinates come with it, and the whole world
 * state is one copy away.
 */
export function PhotoDetail({ photo, onClose }: { photo: Photo; onClose: () => void }) {
  const [copied, setCopied] = useState<'json' | 'line' | null>(null)
  const world = photo.world

  // Escape closes it, because a full-screen overlay with no keyboard exit is a
  // trap on a desk even when the tap target is obvious on a phone.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const copy = async (what: 'json' | 'line', text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(what)
      setTimeout(() => setCopied(null), 1600)
    } catch {
      // Clipboard can be refused; the JSON is on screen and selectable anyway.
    }
  }

  const ahead = world?.actors.filter((a) => a.ahead) ?? []

  return (
    <div className="detail" role="dialog" aria-modal="true" aria-label="Shot detail">
      <button type="button" className="detail__scrim" aria-label="Close" onClick={onClose} />

      <div className="detail__panel">
        <div className="detail__image">
          {photo.url ? (
            <img src={photo.url} alt="" />
          ) : (
            <div className="shot__developing" aria-label="Developing" />
          )}
        </div>

        <div className="detail__side">
          <div className="detail__head">
            <h2 className="detail__title">{photo.id}</h2>
            <button type="button" className="detail__close" aria-label="Close" onClick={onClose}>
              ✕
            </button>
          </div>

          {world ? (
            <>
              <dl className="detail__facts">
                <dt>Where</dt>
                <dd>
                  {world.section} · {world.metres} m · t={world.t}
                </dd>
                <dt>Camera</dt>
                <dd>
                  {world.camera.at[0]}, {world.camera.at[2]} @ {world.camera.at[1]} m
                </dd>
                <dt>Facing</dt>
                <dd>
                  {world.camera.bearing}° · pitch {world.camera.pitch}° · {world.camera.yawFromRoute}
                  ° off route
                </dd>
                <dt>Lens</dt>
                <dd>{world.camera.fov}° fov</dd>
                <dt>Actors</dt>
                <dd>
                  {world.actors.length} loaded, {ahead.length} in front
                </dd>
                <dt>Build</dt>
                <dd>{world.build}</dd>
              </dl>

              <div className="detail__actions">
                <button type="button" onClick={() => copy('json', JSON.stringify(world, null, 2))}>
                  {copied === 'json' ? 'Copied' : 'Copy world JSON'}
                </button>
                <button type="button" onClick={() => void sharePhoto(photo)} disabled={!photo.url}>
                  Share shot
                </button>
              </div>

              {/*
                The nearest few, spelled out, because the common question is
                "what is that thing and why is it there" and scrolling a
                hundred-line JSON blob to answer it is worse than a list.
              */}
              <div className="detail__actors">
                {world.actors.slice(0, 14).map((a) => (
                  <div key={a.id} className={`detail__actor ${a.ahead ? '' : 'behind'}`}>
                    <span className="detail__actorName">{a.species}</span>
                    <span className="detail__actorPos">
                      {a.at[0]}, {a.at[2]}
                    </span>
                    <span className="detail__actorMeta">
                      {a.distance} m · {a.heading}° · {a.clip}
                    </span>
                  </div>
                ))}
              </div>

              <details className="detail__raw">
                <summary>World state</summary>
                <pre>{JSON.stringify(world, null, 2)}</pre>
              </details>
            </>
          ) : (
            <p className="detail__none">
              No world state on this shot — it predates the recording being added.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

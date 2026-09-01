import { useState } from 'react'

import { runTotal, useGame } from '@/game/state'

import { PhotoCard } from './PhotoCard'
import { PhotoDetail } from './PhotoDetail'

/**
 * The end-of-route contact sheet.
 *
 * Every shot is kept by default; the player drops the ones they don't want
 * before developing. Only kept photos count toward the album, which makes the
 * choice meaningful without punishing anyone for experimenting mid-route.
 */
export function Review() {
  const [openId, setOpenId] = useState<string | null>(null)
  const photos = useGame((s) => s.photos)
  const toggleSelected = useGame((s) => s.toggleSelected)
  const submit = useGame((s) => s.submit)
  const backToMenu = useGame((s) => s.backToMenu)

  const kept = photos.filter((p) => p.selected)
  const open = photos.find((p) => p.id === openId) ?? null

  return (
    <div className="layer interactive">
      <div className="screen">
        <div className="spread" style={{ marginBottom: '2rem' }}>
          <div>
            <h1 className="title" style={{ fontSize: 'clamp(2rem, 6vw, 3.2rem)' }}>
              Contact sheet
            </h1>
            <p className="subtitle" style={{ marginBottom: 0 }}>
              {photos.length === 0
                ? 'You came back with nothing.'
                : `${photos.length} shot${photos.length === 1 ? '' : 's'}. Click any to leave it behind.`}
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="total">{runTotal(photos).toLocaleString()}</div>
            <div className="sub" style={{ color: 'var(--dim)', fontSize: '0.72rem' }}>
              {kept.length} keeping
            </div>
          </div>
        </div>

        {photos.length === 0 ? (
          <div className="empty">No photos this run.</div>
        ) : (
          <div className="grid">
            {photos.map((photo) => (
              <PhotoCard
                key={photo.id}
                photo={photo}
                onToggle={toggleSelected}
                onOpen={setOpenId}
              />
            ))}
          </div>
        )}

        <div className="row" style={{ marginTop: '2.5rem' }}>
          <button className="primary" onClick={submit} disabled={photos.length === 0}>
            Develop {kept.length > 0 ? `${kept.length} photo${kept.length === 1 ? '' : 's'}` : ''}
          </button>
          <button onClick={backToMenu}>Discard run</button>
        </div>
      </div>

      {open && <PhotoDetail photo={open} onClose={() => setOpenId(null)} />}
    </div>
  )
}

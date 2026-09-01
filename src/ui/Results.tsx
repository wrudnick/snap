import { useMemo } from 'react'

import { GOLD_COAST } from '@/content/routes/goldcoast'
import { runTotal, useGame } from '@/game/state'

import { PhotoCard } from './PhotoCard'

export function Results() {
  const photos = useGame((s) => s.photos)
  const album = useGame((s) => s.album)
  const money = useGame((s) => s.money)
  const lastEarned = useGame((s) => s.lastEarned)
  const portfolio = Object.keys(album).length
  const startRun = useGame((s) => s.startRun)
  const backToMenu = useGame((s) => s.backToMenu)

  const kept = useMemo(() => photos.filter((p) => p.selected), [photos])
  const total = runTotal(photos)

  /**
   * The ones that went on the rack.
   *
   * Exactly what was kept, because the sell screen has already chosen one shot
   * per slot — working it out again from a best-per-species map would answer a
   * question nobody asked and get it wrong, since the rack is keyed by slot.
   */
  const highlights = kept
  const found = Object.keys(album).length

  return (
    <div className="layer interactive">
      <div className="screen">
        <div className="spread" style={{ marginBottom: '2.5rem' }}>
          <div>
            <h1 className="title" style={{ fontSize: 'clamp(2rem, 6vw, 3.2rem)' }}>
              Sold
            </h1>
            {/*
              What the run earned, and what that leaves you with.

              The loop was closing silently: postcards went onto the rack and
              the player was told a run total that buys nothing. Money is the
              thing that connects a photograph to the next lens, so it has to be
              said at the moment it is earned.
            */}
            <p className="subtitle" style={{ marginBottom: 0 }}>
              {lastEarned > 0
                ? `${portfolio} postcards on the rack. You have $${money.toLocaleString()}.`
                : `Nothing new to sell — the rack already had better.`}
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="total" style={{ color: 'var(--good)' }}>
              +${lastEarned.toLocaleString()}
            </div>
            <div className="sub" style={{ color: 'var(--dim)', fontSize: '0.72rem' }}>
              earned · {total.toLocaleString()} points shot
            </div>
          </div>
        </div>

        {highlights.length > 0 && (
          <>
            <h2>Best of the run</h2>
            <div className="grid" style={{ marginBottom: '3rem' }}>
              {highlights.map((photo) => (
                <PhotoCard key={photo.id} photo={photo} />
              ))}
            </div>
          </>
        )}

        {/*
          The rack, keyed by slot.

          This listed every species with a lookup by species name, which the
          rack stopped answering the moment a slot became subject *and* pose —
          so it read "not yet" against everything however full the rack was.
        */}
        <h2>The rack — {found}</h2>
        <div className="album" style={{ marginBottom: '3rem' }}>
          {Object.values(album)
            .sort((a, b) => b.best - a.best)
            .slice(0, 24)
            .map((entry) => (
              <div className="entry" key={entry.slot}>
                <div className="n">{entry.displayName}</div>
                <div className="p">{entry.sublabel}</div>
                <div className="s">
                  {entry.best.toLocaleString()} · {entry.grade}
                </div>
              </div>
            ))}
        </div>

        <div className="row">
          <button className="primary" onClick={() => startRun(GOLD_COAST.id, GOLD_COAST.film)}>
            Ride again
          </button>
          <button onClick={backToMenu}>Back to menu</button>
        </div>
      </div>
    </div>
  )
}

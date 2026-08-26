import { useMemo } from 'react'

import { GOLD_COAST } from '@/content/routes/goldcoast'
import { SUBJECTS } from '@/content/subjects'
import { bestPerSpecies } from '@/game/scoring/score'
import { runTotal, useGame } from '@/game/state'

import { PhotoCard } from './PhotoCard'

export function Results() {
  const photos = useGame((s) => s.photos)
  const album = useGame((s) => s.album)
  const startRun = useGame((s) => s.startRun)
  const backToMenu = useGame((s) => s.backToMenu)

  const kept = useMemo(() => photos.filter((p) => p.selected), [photos])
  const total = runTotal(photos)

  // Which of this run's photos actually earned a place in the album.
  const best = useMemo(() => bestPerSpecies(kept.map((p) => p.score)), [kept])
  const highlights = useMemo(
    () => kept.filter((p) => best.get(p.score.primary?.species ?? '')?.photoId === p.id),
    [kept, best],
  )

  const speciesTotal = Object.keys(SUBJECTS).length
  const found = Object.keys(album).length

  return (
    <div className="layer interactive">
      <div className="screen">
        <div className="spread" style={{ marginBottom: '2.5rem' }}>
          <div>
            <h1 className="title" style={{ fontSize: 'clamp(2rem, 6vw, 3.2rem)' }}>
              Developed
            </h1>
            <p className="subtitle" style={{ marginBottom: 0 }}>
              {highlights.length > 0
                ? `Your best of each subject went into the album.`
                : `Nothing made the album this time.`}
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="total">{total.toLocaleString()}</div>
            <div className="sub" style={{ color: 'var(--dim)', fontSize: '0.72rem' }}>
              run total
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

        <h2>
          Album — {found} of {speciesTotal}
        </h2>
        <div className="album" style={{ marginBottom: '3rem' }}>
          {Object.values(SUBJECTS).map((subject) => {
            const entry = album[subject.species]
            return (
              <div
                className="entry"
                key={subject.species}
                style={{ opacity: entry ? 1 : 0.42 }}
              >
                <div className="n">{subject.displayName}</div>
                <div className="s">
                  {entry ? `${entry.best.toLocaleString()} · ${entry.grade}` : 'not yet'}
                </div>
              </div>
            )
          })}
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

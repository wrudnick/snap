import { DOWNTOWN } from '@/content/routes/downtown'
import { SUBJECTS } from '@/content/subjects'
import { useGame } from '@/game/state'

export function Menu() {
  const album = useGame((s) => s.album)
  const startRun = useGame((s) => s.startRun)

  const found = Object.keys(album).length
  const total = Object.keys(SUBJECTS).length

  return (
    <div className="layer interactive">
      <div className="screen">
        <h1 className="title">snap</h1>
        <p className="subtitle">
          One street, one pass, {DOWNTOWN.film} shots. You can't stop and you can't go
          back — you can only look, and choose when to press the shutter.
        </p>

        <div className="row" style={{ marginBottom: '3rem' }}>
          <button className="primary" onClick={() => startRun(DOWNTOWN.id, DOWNTOWN.film)}>
            Ride {DOWNTOWN.displayName}
          </button>
          <span className="sub" style={{ color: 'var(--dim)', fontSize: '0.78rem' }}>
            {found} of {total} subjects photographed
          </span>
        </div>

        <h2>Album</h2>
        {found === 0 ? (
          <div className="empty">Nothing yet. Everything on that street is worth a photo.</div>
        ) : (
          <div className="album">
            {Object.values(album)
              .sort((a, b) => b.best - a.best)
              .map((entry) => (
                <div className="entry" key={entry.species}>
                  <div className="n">{entry.displayName}</div>
                  <div className="s">
                    {entry.best.toLocaleString()} · {entry.grade}
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  )
}

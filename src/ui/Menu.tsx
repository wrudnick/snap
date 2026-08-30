import { GOLD_COAST } from '@/content/routes/goldcoast'
import { SUBJECTS } from '@/content/subjects'
import { useGame } from '@/game/state'
import { lockLandscape, requestMotionAccess } from '@/input'

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
          One street, one pass, {GOLD_COAST.film} shots. You can't stop and you can't go
          back — you can only look, and choose when to press the shutter.
        </p>

        <div className="row" style={{ marginBottom: '3rem' }}>
          <button
            className="primary"
            onClick={() => {
              /**
               * Ask for the motion sensors here, not on load.
               *
               * iOS will only grant them from inside a user gesture, and this
               * is the only gesture the player makes before the run starts. The
               * run is not gated on the answer: a phone that declines still has
               * drag-to-look, and blocking the game on a permission prompt
               * would be a worse trade than a slightly clumsier control.
               */
              void requestMotionAccess()
              // Best effort: only Android Chrome honours it, and only in
              // fullscreen. The rotate prompt covers everything else.
              void lockLandscape()
              startRun(GOLD_COAST.id, GOLD_COAST.film)
            }}
          >
            Ride {GOLD_COAST.displayName}
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

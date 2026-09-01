import { GOLD_COAST } from '@/content/routes/goldcoast'
import { useGame } from '@/game/state'
import { Shop } from './Shop'
import { requestMotionAccess } from '@/input'
import { enterFullscreen, isIOS, isStandalone, lockLandscape } from '@/lib/display'

export function Menu() {
  const album = useGame((s) => s.album)
  const startRun = useGame((s) => s.startRun)

  /**
   * iPhone Safari has no Fullscreen API, so the button cannot deliver it and
   * saying nothing would look like the request had simply failed. Add to Home
   * Screen launches standalone, which is fullscreen — so the one platform that
   * cannot be given it automatically gets told how.
   *
   * Hidden once already standalone, and on every platform that can just do it.
   */
  const needsHomeScreen = isIOS() && !isStandalone()

  const found = Object.keys(album).length

  return (
    <div className="layer interactive">
      <div className="screen">
        <h1 className="title">snap</h1>
        <p className="subtitle">
          One street, one pass, {GOLD_COAST.film} shots. You can't stop and you can't go
          back — you can only look, and choose when to press the shutter.
        </p>

        {needsHomeScreen ? (
          <p className="homescreen">
            Share → Add to Home Screen, then open it from there, to play fullscreen.
          </p>
        ) : null}

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
              /**
               * Fullscreen first, then the orientation lock: the lock is only
               * honoured while fullscreen, so the other order silently fails.
               *
               * Both are best-effort. On iPhone neither does anything — Safari
               * has no Fullscreen API — which is what the Add to Home Screen
               * hint below is for.
               */
              void enterFullscreen().then(() => lockLandscape())
              startRun(GOLD_COAST.id, GOLD_COAST.film)
            }}
          >
            Ride {GOLD_COAST.displayName}
          </button>
          <span className="sub" style={{ color: 'var(--dim)', fontSize: '0.78rem' }}>
            {found} postcard{found === 1 ? '' : 's'} on the rack
          </span>
        </div>

        <Shop />

        <h2>The rack</h2>
        {found === 0 ? (
          <div className="empty">Nothing yet. Everything on that street is worth a photo.</div>
        ) : (
          <div className="album">
            {Object.values(album)
              .sort((a, b) => b.best - a.best)
              .map((entry) => (
                // Keyed by slot, not species: "taxi driver, yelling" and "taxi
                // driver, parked" are two different postcards.
                <div className="entry" key={entry.slot}>
                  <div className="n">{entry.displayName}</div>
                  <div className="p">{entry.sublabel}</div>
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

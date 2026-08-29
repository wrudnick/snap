import { useGame } from '@/game/state'
import { useRouteBundle } from '@/game/useRoute'
import { MiniMap } from '@/ui/MiniMap'
import { Hud } from '@/ui/Hud'
import { Menu } from '@/ui/Menu'
import { Results } from '@/ui/Results'
import { Review } from '@/ui/Review'

import { MapView } from './dev/MapView'
import { ModelInspector } from './dev/ModelInspector'
import { Game } from './scene/Game'
import './ui/ui.css'

/**
 * Debug screens, reachable by URL rather than by a menu.
 *
 * `?debug=models` opens the model inspector, `?debug=map` the route map. Routing on a query param keeps the
 * debug tools out of the game's own state machine entirely — they're a separate
 * app that happens to share a bundle, and nothing in the game has to know they
 * exist.
 */
function debugScreen(): string | null {
  if (typeof window === 'undefined') return null
  return new URLSearchParams(window.location.search).get('debug')
}

/**
 * The scene stays mounted across every phase.
 *
 * Tearing down the Canvas between runs would mean re-uploading geometry and
 * recompiling every shader on each replay — a multi-second stall in exchange for
 * memory nobody needed back. The phase only decides which UI layer sits on top.
 */
export function App() {
  const debug = debugScreen()
  if (debug === 'models') return <ModelInspector />
  if (debug === 'map') return <MapView />

  return <GameApp />
}

function GameApp() {
  const phase = useGame((s) => s.phase)
  const routeId = useGame((s) => s.routeId)
  const { route, rail, resolved } = useRouteBundle(routeId)

  return (
    <>
      <Game />
      {phase === 'riding' && (
        <>
          <Hud />
          <MiniMap route={route} rail={rail} checkpoints={resolved.checkpoints} />
        </>
      )}
      {phase === 'menu' && <Menu />}
      {phase === 'review' && <Review />}
      {phase === 'results' && <Results />}
    </>
  )
}

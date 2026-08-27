import { useGame } from '@/game/state'
import { useRouteBundle } from '@/game/useRoute'
import { MiniMap } from '@/ui/MiniMap'
import { Hud } from '@/ui/Hud'
import { Menu } from '@/ui/Menu'
import { Results } from '@/ui/Results'
import { Review } from '@/ui/Review'

import { Game } from './scene/Game'
import './ui/ui.css'

/**
 * The scene stays mounted across every phase.
 *
 * Tearing down the Canvas between runs would mean re-uploading geometry and
 * recompiling every shader on each replay — a multi-second stall in exchange for
 * memory nobody needed back. The phase only decides which UI layer sits on top.
 */
export function App() {
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

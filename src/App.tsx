import { useGame } from '@/game/state'
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

  return (
    <>
      <Game />
      {phase === 'riding' && <Hud />}
      {phase === 'menu' && <Menu />}
      {phase === 'review' && <Review />}
      {phase === 'results' && <Results />}
    </>
  )
}

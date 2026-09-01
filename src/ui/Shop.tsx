import { BODIES, verticalFov } from '@/content/cameras'
import { useGame } from '@/game/state'

/**
 * The camera shop.
 *
 * One currency, and it buys two things: equipment, and eventually locations.
 * That single choice — better glass, or somewhere new to point it — is the
 * spine of the economy, and it only stays interesting while both sides are
 * genuinely tempting.
 *
 * Each body says what it is *for* rather than what its numbers are. A shop that
 * lists a scene divisor is a spreadsheet; one that says "streets and crowds" is
 * a decision. The numbers are underneath for anyone who wants them.
 */
const FOR: Record<string, string> = {
  compact: 'Tight and normal. A street feels like it is closing in.',
  wide: 'Streets, crowds and interiors. Fits a building you cannot step back from.',
}

export function Shop() {
  const money = useGame((s) => s.money)
  const owned = useGame((s) => s.owned)
  const equipped = useGame((s) => s.cameraBody)
  const buy = useGame((s) => s.buy)
  const equip = useGame((s) => s.equip)

  return (
    <div className="shop">
      <div className="spread">
        <h2 className="shop__title">Equipment</h2>
        <div className="shop__money">${money.toLocaleString()}</div>
      </div>

      <div className="shop__grid">
        {Object.values(BODIES).map((body) => {
          const have = owned.includes(body.id)
          const on = equipped === body.id
          const canAfford = money >= body.price
          return (
            <div key={body.id} className={`kit ${on ? 'on' : ''}`}>
              <div className="kit__name">{body.displayName}</div>
              <div className="kit__for">{FOR[body.id] ?? ''}</div>
              <div className="kit__specs">
                {body.focalLength}mm · {Math.round(verticalFov(body.format, body.focalLength))}°
                {' · '}
                {body.exposures} exposures
              </div>
              {on ? (
                <div className="kit__state">In your hands</div>
              ) : have ? (
                <button type="button" onClick={() => equip(body.id)}>
                  Carry this
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!canAfford}
                  onClick={() => buy(body.id, body.price)}
                >
                  ${body.price}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

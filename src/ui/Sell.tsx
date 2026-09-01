import { useMemo, useState } from 'react'

import { cardValue, saleValue } from '@/game/economy'
import { useGame, type Photo } from '@/game/state'

import { PhotoDetail } from './PhotoDetail'

/**
 * Sell your shots.
 *
 * Grouped by grade, and within a grade one entry per *slot* — subject and what
 * it was doing — because the rack holds one postcard of each and a run that
 * brought back six pigeons pecking is offering one postcard, not six.
 *
 * The same shape New Pokémon Snap uses at the end of a course: the Photodex has
 * room for one photograph of each Pokémon at each star rating, so the choosing
 * is the point. Ours differs in one way worth showing on screen — a slot you
 * have already sold pays only the difference, so some shots are worth nothing
 * and the player should be told before they submit rather than after.
 */

const TIERS = ['S', 'A', 'B', 'C', 'D']

interface Slot {
  key: string
  label: string
  sublabel: string
  /** Every shot of this slot from the run, best first. */
  shots: Photo[]
}

export function Sell() {
  const photos = useGame((s) => s.photos)
  const album = useGame((s) => s.album)
  const setSelection = useGame((s) => s.setSelection)
  const submit = useGame((s) => s.submit)
  const backToMenu = useGame((s) => s.backToMenu)

  /** One entry per slot, each carrying every shot of it, best first. */
  const slots = useMemo<Slot[]>(() => {
    const byKey = new Map<string, Slot>()
    for (const photo of photos) {
      const lead = photo.score.scene[0]
      if (!lead) continue
      const existing = byKey.get(lead.slot)
      if (existing) existing.shots.push(photo)
      else {
        byKey.set(lead.slot, {
          key: lead.slot,
          label: lead.label,
          sublabel: lead.sublabel,
          shots: [photo],
        })
      }
    }
    for (const slot of byKey.values()) {
      slot.shots.sort((a, b) => b.score.total - a.score.total)
    }
    return [...byKey.values()]
  }, [photos])

  // Which shot of each slot is on offer, and which slots are being kept back.
  const [chosen, setChosen] = useState<Record<string, string>>({})
  const [dropped, setDropped] = useState<Record<string, boolean>>({})
  const [open, setOpen] = useState<string | null>(null)

  const shotFor = (slot: Slot) =>
    slot.shots.find((p) => p.id === chosen[slot.key]) ?? slot.shots[0]!

  /**
   * What each slot pays, and the running total.
   *
   * Computed against what the rack has already been paid for that slot, which
   * is what makes a second A worth nothing — the honest number, shown before
   * the decision rather than after it.
   */
  const offers = slots
    .filter((s) => !dropped[s.key])
    .map((slot) => {
      const shot = shotFor(slot)
      const lead = shot.score.scene[0]!
      const paid = album[slot.key]?.paid ?? 0
      return {
        slot,
        shot,
        earns: saleValue(shot.score.grade, lead.rarity, paid),
        ceiling: cardValue('S', lead.rarity),
        paid,
      }
    })

  const takings = offers.reduce((sum, o) => sum + o.earns, 0)
  const openPhoto = photos.find((p) => p.id === open) ?? null

  const sell = () => {
    setSelection(offers.map((o) => o.shot.id))
    submit()
  }

  return (
    <div className="layer interactive">
      <div className="screen">
        <div className="spread" style={{ marginBottom: '1.6rem' }}>
          <div>
            <h1 className="title" style={{ fontSize: 'clamp(2rem, 6vw, 3.2rem)' }}>
              Sell your shots
            </h1>
            <p className="subtitle" style={{ marginBottom: 0 }}>
              {slots.length === 0
                ? 'You came back with nothing.'
                : 'One postcard of each. Pick which one goes on the rack.'}
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="total">${takings.toLocaleString()}</div>
            <div className="sub" style={{ color: 'var(--dim)', fontSize: '0.72rem' }}>
              {offers.length} selling
            </div>
          </div>
        </div>

        {TIERS.map((tier) => {
          const inTier = slots.filter((s) => shotFor(s).score.grade === tier)
          if (inTier.length === 0) return null
          return (
            <section className="tier" key={tier}>
              <div className={`tier__badge grade ${tier === 'D' ? 'd' : ''}`}>{tier}</div>
              <div className="tier__slots">
                {inTier.map((slot) => {
                  const shot = shotFor(slot)
                  const offer = offers.find((o) => o.slot.key === slot.key)
                  const out = Boolean(dropped[slot.key])
                  return (
                    <div className={`offer ${out ? 'out' : ''}`} key={slot.key}>
                      <button
                        type="button"
                        className="offer__image"
                        onClick={() => setOpen(shot.id)}
                        aria-label={`Look at ${slot.label} closely`}
                      >
                        {shot.url ? (
                          <img src={shot.url} alt="" />
                        ) : (
                          <span className="shot__developing" />
                        )}
                      </button>

                      <div className="offer__name">{slot.label}</div>
                      <div className="offer__sub">{slot.sublabel}</div>

                      {/*
                        Every shot of this slot from the run. Snap makes the
                        choosing the point, and so does this — but the money is
                        shown next to it, because a better photograph is not
                        always worth more once the rack has been paid.
                      */}
                      {slot.shots.length > 1 && (
                        <div className="offer__roll">
                          {slot.shots.map((p, i) => (
                            <button
                              type="button"
                              key={p.id}
                              className={p.id === shot.id ? 'on' : ''}
                              onClick={() => setChosen((c) => ({ ...c, [slot.key]: p.id }))}
                              aria-label={`Shot ${i + 1}, ${p.score.grade}, ${p.score.total} points`}
                            >
                              {p.score.grade}
                            </button>
                          ))}
                        </div>
                      )}

                      <div className="offer__money">
                        {out ? (
                          <span className="offer__held">Held back</span>
                        ) : offer && offer.earns > 0 ? (
                          <span className="offer__earns">+${offer.earns}</span>
                        ) : (
                          <span
                            className="offer__nothing"
                            title="You have already sold one at least this good"
                          >
                            Already sold better
                          </span>
                        )}
                        <span className="offer__pts">{shot.score.total.toLocaleString()}</span>
                      </div>

                      <button
                        type="button"
                        className="offer__drop"
                        onClick={() => setDropped((d) => ({ ...d, [slot.key]: !d[slot.key] }))}
                      >
                        {out ? 'Put back' : 'Hold back'}
                      </button>
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })}

        <div className="row" style={{ marginTop: '2.5rem' }}>
          <button className="primary" onClick={sell} disabled={offers.length === 0}>
            Sell {offers.length > 0 ? `${offers.length} postcard${offers.length === 1 ? '' : 's'}` : ''}
          </button>
          <button onClick={backToMenu}>Discard run</button>
        </div>
      </div>

      {openPhoto && <PhotoDetail photo={openPhoto} onClose={() => setOpen(null)} />}
    </div>
  )
}

# Progression

One currency, earned by selling photographs. It buys two things: **equipment**
and **locations**. That single choice — better glass, or somewhere new to point
it — is the spine of the economy, and it stays interesting only as long as both
sides are genuinely tempting.

## The camera in your hands

Held low by default, wide and loose, so you can see the street. **Raise it to
your eye** and the HUD becomes that camera's viewfinder: a tighter crop, the
frame bars, and whatever that particular body puts around the edges. You compose
through the viewfinder and shoot from there.

This matters for more than feel. **The photograph is the viewfinder crop, not the
screen.** Score and capture both use the crop's aspect. Held low you are looking;
raised you are framing. It is also nearly free to build — zoom is already a
held-Shift field-of-view lerp, so raising to the eye is a reframing of something
that exists.

## Bodies and lenses

Split deliberately, because they answer different complaints.

**A body** decides what the photograph *looks like* and how you see it: the
viewfinder HUD, the film stock, grain, colour or black and white, which frame
orientations it offers, and how much film it holds.

**A lens** decides what you can *reach* and what you are being scored as taking:
its zoom range, its **scene divisor** (see `SCORING.md`), and how forgiving it is
about keystone.

The scene divisor is the good part. A fisheye is an instrument for scenes and
should score supporting subjects generously; a telephoto is an instrument for
subjects and should barely score them at all. So the lens changes *what kind of
photograph you are taking*, rather than making the same photograph worth more.
That is the difference between a shop worth visiting and a list of stat upgrades.

| Lens | Scene divisor | For | Built |
|---|---|---|---|
| Wide 28 | `/3n` | Streets, crowds, interiors. Rewards a busy frame. | yes, $240 |
| Compact 45 | `/5n` | The one you start with. | yes, free |
| Telephoto | `/8n` | One subject, compressed. Distant and shy things. | no |

Bodies and lenses are one object for now — the compact and the wide are each a
`CameraBody` with a fixed focal length. Splitting them apart is worth doing when
a body exists whose film or finder differs from the compact's, and not before.

## What each unlock is *for*

Every piece of equipment should answer a specific complaint the rulebook gave
you. If you cannot name the complaint, it does not belong in the shop.

None of these are built except the wide angle. They are recorded as the shape of
the tree rather than as a promise about its order.

| Unlock | The complaint it answers |
|---|---|
| **Portrait orientation** | Tall buildings do not fit, and tilting up to make them fit destroys the Level score. |
| **Wide-angle lens** | You cannot get far enough back on a 30 m street. |
| **Telephoto lens** | Shy subjects flee before you are close, and the skyline is too far to fill a frame. |
| **Fisheye body/lens** | Interiors and crowds — and a genuinely different look worth selling. |
| **Black and white with grain** | A different market. Some subjects photograph better without colour. |
| **Tilt-shift** | Late unlock: removes the keystone penalty outright. You have been fighting it for hours by then and it should feel like a reward. |
| **Fast film** | Dawn, dusk and night locations are too dark to shoot cleanly. |
| **Image stabilisation** | The Playpen bobs. A level horizon on a boat is otherwise luck. |
| **A bigger roll** | You keep running out before the end of the route. |
| **More throwables** | The world only reacts one way. |

## The map

Locations are bought, not unlocked by progress. You start with one. The map is
the shop's other half, and a location is priced by how many photographs it makes
newly possible — not by how far into the game it sits.

Buying a location should feel like buying access to *specific shots you have
already been told you cannot take*. The Hancock, entire, is the advertisement for
the Playpen.

## Selling: one slot per subject, and a ratchet

You do not sell photographs, you sell **postcards**, and the rack holds exactly
one card per subject. Selling a better one replaces the card and pays only the
difference.

| Grade | Card is worth |
|---|---|
| D | $1 |
| C | $5 |
| B | $12 |
| A | $25 |
| S | $50 |

Sell a D taxi driver yelling out of his window and take $1. Come back with a C
of the same thing and take $4. An A pays $20, and the S that follows pays the
last $25. The slot has paid out $50 in total, and it always will, whatever route
you took to it.

Multiplied by rarity, so a slot is worth what it is worth: an S-grade rat is
harder to earn than an S-grade pigeon and should pay like it.

**What a slot is keyed on.** For actors, species and pose — "taxi driver,
yelling" and "taxi driver, parked" are different cards. For structures, the
building and the face you shot it from. **Light is deliberately not part of the
key.** It is a multiplier inside the structure rubric instead, which means dawn
is how you turn a B into an A *in a slot you already own* — the ratchet sends you
back at golden hour, rather than the game inventing three times as many slots.

### Why this is the right shape

**The money supply is finite and computable.** Every slot pays its S value once,
so the whole economy is a sum you can write down. Measured against the code:

| | slots | at full S |
|---|---|---|
| 25 species × their poses | 90 | $5,709 |
| 52 landmarks × three face bands | 156 | $7,800 |
| **total** | **246** | **$13,509** |

Two corrections to an earlier count of $11,000. Buildings have **three** face
bands, not two — `square-on`, `three-quarter` and `oblique` — and the slot key
uses the band, so the mush between the two good angles is its own postcard. And
every landmark is priced at rarity 1 because none has a rarity set, so the
architecture figure is a floor rather than an estimate.

The oblique slot deserves a decision rather than an inheritance. The rubric names
two right angles and scores the space between them lowest — but Face is only a
tenth of the weight, so an oblique shot can still be an S, and a third of the
building economy is currently the angle the rubric calls amateur. See the open
list.

**Grinding pays nothing.** Selling the same grade twice is worth zero. The only
way to earn is to bring back something better than what is on the rack, or
something that is not on it at all.

**Improvement is paid for exactly.** Not a bonus for improving — the difference,
which is the honest amount.

**It cannot be farmed by composition.** See below; this is the important one.

## Portfolio score

The cumulative score of the postcards currently in your rack. Money is what you
spend; the portfolio is what you *are* — the number behind "world-renowned".

The two measure different things on purpose, and the gap between them is where
the scene scoring finally becomes safe:

- **Money** comes from the *grade*, which comes from the **primary subject
  alone**.
- **Portfolio score** comes from *total points*, which carries the whole scene.

So two photographs of the same taxi driver, both graded A, pay identical money —
but the one with the skyline behind it and a pigeon in the foreground is worth
more portfolio. You will swap it onto the rack knowing it pays nothing.

That resolves the thing we went three rounds on: **scenes cannot be farmed for
cash, because cash does not respond to them at all.** Composition is pure
prestige, so it can be made generous without any risk of it becoming the optimal
way to make money.

It also produces a genuine dilemma, for free. Money banks permanently at your
best grade ever, but the rack shows one card. An S with a dull background has
already paid you its $50; an A with a beautiful one pays nothing but scores
higher. Which one hangs on the rack is then a real choice, and it is the choice a
photographer would actually have.

## Open

- **Should `oblique` be a sellable slot at all?** It is a third of the building
  economy and it is the angle the rubric exists to discourage. The alternatives
  are to drop it (a run could then come back with nothing sellable), to price it
  below the named bands, or to accept it as a genuinely different photograph.
- Does film cost money?
- **Building rarity is unassigned.** Every landmark currently prices the same,
  which is wrong: the Hancock is not 40 East Oak. Tiering them changes both the
  money supply and which buildings are worth going out of your way for.
- Pricing the shop and the map against an ~$11,000 supply.

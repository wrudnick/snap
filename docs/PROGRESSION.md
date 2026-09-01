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

| Lens | Scene divisor | For |
|---|---|---|
| Wide / fisheye | `/3n` | Streets, crowds, interiors. Rewards a busy frame. |
| Standard | `/5n` | The default. |
| Telephoto | `/8n` | One subject, compressed. Distant and shy things. |

## What each unlock is *for*

Every piece of equipment should answer a specific complaint the rulebook gave
you. If you cannot name the complaint, it does not belong in the shop.

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

## Open

- Do photographs sell once, or earn royalties over time?
- Does film cost money?
- Is there a price ceiling on repeat sales of the same composition? Something
  must stop the same shot being farmed — most likely a photograph only sells once
  and a *materially different* composition of the same subject counts as new.

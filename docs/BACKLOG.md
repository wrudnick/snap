# What to build, in order

Ordered by how much each decision constrains the ones after it, not by how
exciting it is. Every slice ends with something playable — if a slice cannot be
played at the end of it, it is too big and should be cut in half.

The rule of thumb: **build the thing that the most other things depend on
first.** Lenses are cheap once the rubric exists and expensive to retrofit once
five of them assume the old one.

## Slice 1 — the camera — **done**

Raise to eye, viewfinder crop, the frame as a property of the body.

**What landed.** `src/content/cameras/` holds bodies as data; the store owns
which one you have. The first is a fixed-lens compact, so `input.raise` replaced
`input.zoom` — the view narrows when you lift the camera because an eye and a
forty-millimetre lens differ, not because the player asked. Zoom is now
something the shop can sell.

The photograph is 3:2 and the viewport is not, so the finder draws a bright-line
rectangle: a faint guide held low, masked and lit when raised. The finder, the
capture and the snapshot all take that rectangle from one `frameCrop`.
`e2e/camera.spec.ts` asserts they agree, on a 16:9 viewport deliberately — a 3:2
viewport would pass however badly it were wired.

**The film.** Grain, warmth and vignette are applied in the blit that makes the
photograph and nowhere else — you compose through an optical viewfinder and
there is no grain in a viewfinder, so the live view stays clean and the contact
sheet shows you something the screen never did. It also costs nothing per frame.

Grain is sampled coarsely, not per pixel: a JPEG encoder discards per-pixel
noise, and measured at quality 0.85 it took a standard deviation of 5.7 down to
1.1. Coarse grain has a size, survives the encoder, and is what film does anyway.

**The whole game is letterboxed to the film's aspect**, because framing is the
mechanic and how much you can see must not depend on the monitor. Lenses are
expressed in millimetres, since a field of view in degrees means nothing without
knowing the film behind it — the first pass picked 44 degrees by eye, which on
35mm is a 29mm lens wearing a 45mm label.

**Portrait** is deliberately not in this slice. The frame is a property of the
body now, which is the mechanism; portrait arrives with a body that offers it,
and that belongs with the shop.

**Two things worth knowing.** `aspect-ratio` in CSS with a max on the other axis
does not clamp back through the ratio — it will hand you a frame larger than its
container. And a hidden browser pane stops `requestAnimationFrame`, so every
`useFrame` silently does nothing: an hour went into three components that
appeared broken and were not. Verify in Playwright.

## Slice 2 — buildings are subjects — **done**

Fit, Fill, Clear, Level, Face, with Light as a multiplier.

**Fit gates the other four** rather than averaging with them — the same rule
actors follow, where presence gates craft. It was going to be a weighted term at
0.3 until a test caught that a building with a quarter cut off lost only
seventeen percent of its quality, so golden hour paid for the mistake and a
clipped tower at dawn beat a whole one at midday.

**Outlines come from the real geometry, not the footprint.** A prism over the
plan would report the whole building in frame while its spire was out of shot —
measured, the Hancock's outline reaches 443 m against a 343 m roof. Rendering
keeps the landmarks merged; observation takes support points before the merge.
No draw calls added, 92 ms once at load, 7.8 KB total.

**Two occlusion bugs, both found by printing numbers.** Sample points pulled
toward a building's centre sit *inside the solid*, so every building on a clear
street reported itself fully blocked. And the outline wraps the whole building,
so half its corners are round the back where the building's own front correctly
blocks them. 0% → 40% → 55%.

The keystone rule fires where the design said: tilting half a radian up on
Michigan puts convergence at 0.46 against a ruinous 0.35.

## Slice 3 — scenes — **done, inside Slice 2**

Cluster, rank, decay and the named composition bonuses all arrived with the
scene assembly, so this was never a separate piece of work. A composed handful
beating a crowd is a test now rather than an intention.

## Slice 4 — money and one other lens — **done**

The rack holds one card per slot and a better one pays only the difference, so
every slot pays out the same total however you got there — which is what makes
the money in the game a sum you can write down.

Two numbers per slot: what has been *paid* is a ratchet and follows the money;
the *points* belong to the card on display and follow the portfolio. An S with a
dull background has already banked while a scene-rich A pays nothing and scores
higher, so which one hangs there is a real choice.

The wide 28 answers a complaint the 45 creates, and scores scenes differently —
supporting cast counts for more through wide glass. The scoring config is
composed per shot from the body, so the divisor is a property of the glass
rather than a global constant.

**Still open here.** The wide angle is priced at $240 against a supply measured
at $13,509, which is a guess and wants playing against rather than reasoning
about. `LandmarkBuilding.rarity` is unset on all fifty-two, so the architecture
half of the economy is priced at its floor.

## The sell screen — **done, after Slice 4**

Grouped by grade, one entry per slot, with the run's other shots of that slot on
a strip. The same shape New Pokémon Snap uses: its Photodex has room for one
photograph of each Pokémon at each star rating, where stars are behaviour
rarity and the numeric score is separate — the same split as our slot and grade.

Ours shows one thing Snap's does not: a slot already sold pays only the
difference, so some shots are worth nothing and the card says so before you
submit rather than after.

## Slice 5 — the map and the Playpen

A second location, bought.

Only worth building after Level exists, because the Playpen's entire pitch is
that it is where the tall buildings finally fit. That is now measured rather than
claimed: tilting half a radian up on Michigan puts convergence at 0.46 against a
ruinous 0.35, so the shot is genuinely unavailable from the pavement.

There is no map yet — one location and a menu button.

*Playable at the end:* the game has a reason to keep going.

## Not now

Deliberately deferred. Written down so they are safe to forget, which is the
whole point of the list. Nothing here is rejected.

- **Royalties** over one-off sales.
- **Clients** with standing preferences that price subjects differently.
- **Weather and season.**
- **A collection meta-goal** — all 52 landmarks, all 25 species.
- **Further throwables** beyond the hot dog, and a call/whistle to make things
  look at you.
- **Deterministic replay** — seed the behaviour RNG and record inputs, and a run
  replays exactly. Cheap if kept in mind, expensive to retrofit, and it would let
  a whole run be sent for review instead of a screenshot.
- **Further locations** — see `LEVELS.md`.
- **Draw calls.** Currently 1,200–1,800 against a 150 budget. Not a feature, but
  it will decide whether any of this is playable on a phone, and it should be
  fixed before the content grows much further.

## Known open bugs

- Quadrupeds put legs and tails through the pavement in their faster clips —
  the dog by 0.21 m prowling and 0.43 m stretching, the cat by half that. Locked
  at their current depth by `tests/groundContact.test.ts`, which is a ratchet:
  the allowances may be lowered, never raised.
- Vehicle wheels dip about 0.14 m below the road, and the bus 0.22 m. Same
  ratchet.
- The cyclist's saddle sits high enough that at the bottom of the stroke the leg
  is four centimetres short of the pedal, so the solver clamps just inside full
  extension and the foot hangs a little above it. Closing it means lowering the
  saddle or shortening the cranks, both of which move the rider.
- Segment gating does not respond to `seek`: jumping to a route position leaves
  the previous segment's subjects mounted. Normal play is unaffected because
  segments activate as you travel, but it makes seek-based debugging lie and
  `shots.spec.ts` seeks constantly.

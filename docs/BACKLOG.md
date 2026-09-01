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

## Slice 2 — buildings are subjects

Fit, Fill, Clear, Level, Face, and Light as a multiplier.

Fifty-two hand-modelled landmarks currently score nothing. This is the slice that
makes the biggest existing investment in the repository into content.

**What you will find.** `SubjectInstance` in `game/capture/registry.ts` has a
`species` and no notion of kind, so there is nowhere for a structure to live yet.
That interface is the first thing to change, and `buildSnapshot` walks it.

- Structures register as observable subjects with a silhouette.
- Silhouette sampling for Fit and Clear — the BVH added for occlusion already
  makes this affordable.
- Level penalty scaled by angular height. This is the rule everything in the shop
  later exists to answer, so it has to be in before the shop.

*Playable at the end:* you can photograph a building and be told why it was good.

## Slice 3 — scenes

Cluster, rank, decay, named composition bonuses. Grade from the primary alone.

- Same-species clustering with `1 + 0.35·ln(N)`.
- Rank decay `points / (D · n)`, `D` from the lens, default 5.
- Scale, Context, Life, Depth.
- Tune until a composed four-subject photograph beats a twenty-eight-subject
  crowd. That relationship is the acceptance test.

*Playable at the end:* composition beats standing in a busy place.

## Slice 4 — money and one other lens

The shop, priced against a single currency, with exactly one alternative lens.

One is enough to prove the interesting claim: that a different scene divisor
changes what kind of photograph you are taking. If that does not feel different
in play, the whole equipment tree needs rethinking, and it is far better to learn
that from one lens than from six.

*Playable at the end:* you can earn something and it changes how you shoot.

## Slice 5 — the map and the Playpen

A second location, bought.

Only worth building after Level exists, because the Playpen's entire pitch is
that it is where the tall buildings finally fit. Without the keystone rule the
player has no idea what they were missing.

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
- **Draw calls.** Currently 1,200–1,550 against a 150 budget. Not a feature, but
  it will decide whether any of this is playable on a phone, and it should be
  fixed before the content grows much further.

## Known open bugs

- Segment gating does not respond to `seek`: jumping to a route position leaves
  the previous segment's subjects mounted. Normal play is unaffected because
  segments activate as you travel, but it makes seek-based debugging lie and
  `shots.spec.ts` seeks constantly.

# What to build, in order

Ordered by how much each decision constrains the ones after it, not by how
exciting it is. Every slice ends with something playable — if a slice cannot be
played at the end of it, it is too big and should be cut in half.

The rule of thumb: **build the thing that the most other things depend on
first.** Lenses are cheap once the rubric exists and expensive to retrofit once
five of them assume the old one.

## Slice 1 — the camera

Raise to eye, viewfinder crop, portrait toggle.

The photograph becomes the viewfinder crop rather than the screen, which changes
framing for every rule downstream — so it has to land before the rules do. Zoom
is already a held-Shift field-of-view lerp, so a good deal of this exists.

**What you will find.** Zoom is already held-Shift on the keyboard
(`input/index.ts` sets `input.zoom` on keydown and clears it on keyup) and a
toggle on touch, so raise-to-eye maps onto input that exists. The real work is
the crop: `Shutter.tsx` takes `aspect` from the viewport
(`size.width / size.height`) and derives the photo height from it, so the crop
has to reach both capture *and* the snapshot, and those are two places.

- Held low: wide, no frame furniture.
- Raised: tighter crop, frame bars, per-body viewfinder HUD.
- Capture and scoring both use the crop's aspect, not the viewport's.
- Portrait as a frame option, gated behind a body that offers it.

*Playable at the end:* the game feels like holding a camera.

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

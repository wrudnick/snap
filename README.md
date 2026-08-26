# snap

An on-rails photography game in the mould of Pokémon Snap, set on an ordinary
city street. You ride a fixed route, you can't stop and can't turn back — you
can only look, and choose when to press the shutter.

Scoring is fully deterministic and geometric. No AI, no vision model: framing,
scale, direction and pose are read straight off the 3D scene at the instant the
shutter fires. The rulebook is legible, which is what makes it something you can
learn to play against.

```bash
npm install
npm run dev
```

Drag to look · Click or Space to shoot · Hold Shift or right-click to zoom.

Zoom matters more than it appears. A pigeon at four metres is unscoreably small
wide open — bringing it into range is most of the game.

## Verifying

```bash
npm test          # scoring maths, against hand-built snapshots
npm run test:e2e  # the loop, in a real browser
npm run typecheck
npm run build
```

## How it's put together

The design has one load-bearing seam. At shutter time the scene is reduced to a
**`PhotoSnapshot`** — plain JSON recording, per visible subject, its projected
bounding box, centroid, facing dot product, current animation clip and how much
of it the camera can actually see. Everything upstream of that is three.js;
everything downstream is arithmetic on numbers. The scoring core imports no
three.js at all, which is why it can be unit-tested against literals.

```
src/
├── game/
│   ├── scoring/     pure scoring core — no three.js, ever
│   ├── capture/     shutter → image + snapshot
│   ├── rail.ts      spline traversal, look clamping, segment gating
│   ├── runtime.ts   per-frame state, deliberately outside React
│   └── state.ts     discrete state (phase, film, photos)
├── content/         ← all game content, as data
│   ├── subjects/    pigeon, dog, cat, taxi
│   ├── routes/      downtown
│   └── models/      procedural placeholders + street generator
├── scene/           R3F components
├── ui/              HUD, contact sheet, results, album
└── input/           adapter layer (pointer/keyboard now, gamepad later)
```

### Adding things

- **A subject** — one file in `content/subjects/`. Pose values are the dial for
  "what makes a good photo of this thing".
- **A route** — one file in `content/routes/`.
- **Real models** — `content/models/` only. The placeholders are primitives, but
  they animate through a real `AnimationMixer` playing real `AnimationClip`s, so
  the pose-reading code is identical once `.glb` files replace them.
- **Gamepad** — one adapter in `input/`. Game code reads `InputState` and doesn't
  care where it came from.
- **Scoring feel** — `game/scoring/config.ts`. All pure numbers, all covered by
  tests.

### Performance

The rail is the main performance asset: because the camera path is known ahead of
time, the street is partitioned into segments and only those near the camera are
mounted at all — gating object *count* rather than culling a live world every
frame. Repeated props (buildings, lampposts, bins) are instanced, so the whole
street is a handful of draw calls. Budget is ~150; it currently runs around 100.

Other decisions worth not undoing:

- **No `setState` during gameplay.** Per-frame values live in `runtime.ts` and in
  refs. The one exception is the rail segment index, which changes ~12 times per
  route, not per frame.
- **DPR is clamped to 1.5.** Retina at 2× is four times the pixels for almost no
  visible gain.
- **`preserveDrawingBuffer` is off.** It would cost a framebuffer copy every
  frame to serve something that happens on a click; photos render into an
  offscreen target instead.
- **`<Preload all />` compiles shaders up front**, so a material entering view
  for the first time doesn't stall.

### Scoring, specifically

Per subject: **size** (log-gaussian around a per-species ideal — a taxi and a
pigeon cannot share a target), **placement** (falloff from frame centre, scaled
by how much of the subject was cropped), **direction** (`dot(forward, toCamera)`,
banded facing/profile/away), **pose** (per-clip value, with optional peak windows
for catching the good moment of an animation), all multiplied by **visibility**
from occlusion raycasts.

A photo is *of* one subject — the best-scoring one — with bonuses for extra
same-species and extra distinct species. Without that rule, spraying the shutter
at a flock would beat any composed shot.

Grade measures the photograph; rarity inflates the points. A perfect pigeon and a
perfect cat both earn an S, but the cat is worth more.

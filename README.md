# snap

An on-rails photography game in the mould of Pokémon Snap, set in a real
Chicago — the Gold Coast and the Magnificent Mile — in the style of Jet Set
Radio Future. You work for a postcard company: ride a fixed route, photograph
the place, sell what you bring back, and buy better equipment with the proceeds.
You can't stop and can't turn back. You can only look, and choose when to press
the shutter.

Scoring is fully deterministic and geometric. No AI, no vision model: framing,
scale, direction and pose are read straight off the 3D scene at the instant the
shutter fires. The rulebook is legible, which is what makes it something you can
learn to play against.

```bash
npm install
npm run dev
```

Drag to look · Click or Space to shoot · Hold Shift or right-drag to raise the
camera to your eye · E or F to throw.

Raising the camera matters more than it appears. Held at your side the lens
shows its full width; raised to the eye it narrows to the true angle of view of
whatever focal length is fitted, and a pigeon at four metres is unscoreably
small until you do. Bringing things into range is most of the game.

Throwing is the other half: a hot dog landing *near* pigeons gathers them and
one landing *on* them puts the flock up, and "taking off" is the most valuable
pose a pigeon has.

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
│   ├── rail.ts      spline traversal, segment gating
│   ├── items.ts     thrown items, and what notices them
│   ├── runtime.ts   per-frame state, deliberately outside React
│   └── state.ts     discrete state (phase, film, photos)
├── content/         ← all game content, as data
│   ├── subjects/    twenty-five species, from pigeons to the CTA bus
│   ├── items/       what you can throw
│   ├── cameras/     film formats, bodies and focal lengths
│   ├── routes/      goldcoast — the one route, and its kerb fitting
│   └── models/      procedural models, landmarks, and the street generator
├── scene/           R3F components
├── ui/              HUD, contact sheet, results, album
└── input/           adapter layer (pointer/keyboard now, gamepad later)
```

### Adding things

- **A subject** — one file in `content/subjects/`. Pose values are the dial for
  "what makes a good photo of this thing".
- **A route** — one file in `content/routes/`.
- **A throwable** — one row in `content/items/`, and a `trigger` behaviour on
  whichever species should notice it.
- **Real models** — `content/models/` only. The placeholders are primitives, but
  they animate through a real `AnimationMixer` playing real `AnimationClip`s, so
  the pose-reading code is identical once `.glb` files replace them. Recesses
  are cut with real CSG rather than faked by adding a smaller box inside a
  bigger one, which is invisible; see `landmarkKit.ts`.
- **Gamepad** — one adapter in `input/`. Game code reads `InputState` and doesn't
  care where it came from.
- **Scoring feel** — `game/scoring/config.ts`. All pure numbers, all covered by
  tests.

### Performance

The rail is the main performance asset: because the camera path is known ahead of
time, the street is partitioned into segments and only those near the camera are
mounted at all — gating object *count* rather than culling a live world every
frame. Repeated props (buildings, lampposts, bins) are instanced, so the whole
street is a handful of draw calls.

**Draw calls are over budget and this is the honest number: 1,200–1,800 against
a target of ~150.** The gating and instancing work; there is simply more world
than the budget was written for, and nothing has been done about it yet. It is
the largest known performance problem and it will be felt on a phone before
anything else is.

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
  for the first time doesn't stall. The capture pipeline is warmed the same way
  at scene setup: the first shutter press used to spend half a second compiling
  its blit shader, on the one interaction whose entire point is timing.
- **The frame rate is uncapped.** It ran pinned at 30 for a while, which is
  smoother in the abstract and visibly 30 when you pan — and panning is the
  whole verb here. `?fps=30` still pins it for comparison; `AdaptiveDpr` and the
  performance monitor shed resolution rather than frames.
- **Occlusion raycasts go through a bounds tree.** Each shutter press fires nine
  rays per subject in frame; unaccelerated that was a linear walk over every
  triangle in the city and cost 1.6 seconds on a crowded street. See
  `render/raycastAcceleration.ts`.
- **A photograph is recorded the moment it is taken**, and the image is attached
  when the JPEG finishes encoding. Hanging the film counter on the encode made
  the camera feel broken.

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

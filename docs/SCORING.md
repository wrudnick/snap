# Scoring

The rulebook. Everything here must stay deterministic and geometric: a
`PhotoSnapshot` in, a `ScoreBreakdown` out, no renderer, no randomness, no model.
`src/game/scoring/` imports zero three.js and that seam is load-bearing — it is
what makes the rules testable against hand-written literals.

Every rule below must be explainable in one line in the breakdown UI. If a rule
cannot be named on a card, the player cannot learn it, and an unlearnable rule is
indistinguishable from an arbitrary one.

## Two rubrics

A pigeon and a cathedral are not judged the same way. Observations carry a kind.

### Actors — people, animals, vehicles

Built and tuned already. Four weighted terms, summing to 1:

| Term | What it measures |
|---|---|
| **Size** | Projected area against the species' own `idealSize`, log-gaussian. Too small *and* too large both lose. |
| **Placement** | Distance of the centroid from frame centre, plus a penalty for area clipped by the edge. |
| **Direction** | `dot(subjectForward, toCamera)`, banded facing / profile / rear. |
| **Pose** | The value of the animation clip it was caught in, with an optional peak window for the good moment. |

Gated by visibility (below a quarter visible it is not a photograph of that
thing) and multiplied by rarity.

**Presence gates craft.** Direction and pose are multiplied by the size score
rather than added alongside it. Measured against the real scorer before this
rule existed: a person sixty metres away, facing away, at the edge of the frame,
scored **106 points** — size 0.000, placement 0.02, direction 0.04 — earning it
almost entirely from `pose 0.45`, twenty-five percent of the weight for happening
to be mid-stride. Twenty such specks scored **1,462**, beating a clean
single-subject photograph.

A weighted sum lets a subject fail every visual criterion and still bank the
terms that do not check whether you can see it. You cannot have caught something
mid-stride if it is four pixels tall. Craft terms are therefore conditional on
presence, not additive with it.

**Presence floor.** Below roughly 0.03% of frame area — a person beyond about
thirty-five metres — a subject is scenery and does not enter the scene list at
all. Not scored, not counted, not decayed. This is deliberately *below* the size
at which a figure still reads (a person at twenty metres is about thirty pixels
tall on a 1080-line frame, and that is exactly the figure a **Scale** bonus
wants), so the floor removes the invisible tail without removing supporting cast.

**Placement is gated too, and `size` is the only term that is not** — because
`size` *is* the judgement about presence. With pose and direction gated but
centring left alone, a crowd of invisible people dead centre still reached five
hundred points on centring by itself.

Gated on projected *area*, not on the `size` score. Those are different
questions: `size` peaks at a species' ideal and a perfectly good street portrait
at eight metres scores 0.17 there, so multiplying craft by it would gut the
ordinary shot the rule exists to protect. Measured after: a portrait at six
metres is unchanged at 899 points and grade A, while twenty specks fall from
1,462 to 319.

### Structures — named buildings

Buildings have no pose and no facing-you, and want terms of their own. Weights
sum to 1.

**Fit gates the other four.** It is not one question among five — it is the
question a postcard asks, and the rest are only worth asking once it is
answered. `quality = fit × (weighted fill, clear, level, face)`.

This is the same rule actors follow, where presence gates craft. Additively Fit
was worth thirty percent, which meant a building with a quarter of it cut off
lost only seventeen percent of its quality — little enough that golden hour paid
for the mistake, and a measured test had a clipped tower at dawn outscoring a
whole one at midday.

| Term | Weight | What it measures |
|---|---|---|
| **Fit** | *gate* | Fraction of the silhouette inside the frame, cubed. Ninety percent in frame caps the photograph at 0.73 — clipping a corner is a cliff, not a ramp. |
| **Fill** | 0.30 | How much of the frame it occupies. Wants roughly half — big, with breathing room. |
| **Clear** | 0.30 | Fraction of the silhouette not blocked by trees, poles or other buildings. |
| **Level** | 0.30 | How close to horizontal the camera was. See below. |
| **Face** | 0.10 | Angle to the nearest facade normal. Two good answers, not one. |

**Light** multiplies the result (roughly 0.85–1.15) from the section's lighting
profile. Golden and blue hour pay; flat midday does not.

**Level** is the rule the equipment tree exists to answer. The penalty scales
with the structure's *angular height*, not with pitch alone: tilting up at a
two-storey shop is free, and the same tilt at a 340 m tower is ruinous, because
that is when verticals visibly converge. This is what makes portrait orientation,
wide-angle glass and eventually a shift lens feel like capabilities rather than
upgrades — each one buys back height without tilt.

**Face** is only *named* when you are near one of its two answers. The band
threshold was low enough at first to label the bottom of the trough
"three-quarter" — twenty-two degrees off, scoring half marks, and being told it
was the shot you were going for. A band that names the angle you missed is worse
than no band, because the player corrects away from it.

**Face** peaks twice. Square-on to a facade (within a few degrees) is the formal
postcard elevation. A three-quarter view, roughly 35–55° off the normal, shows
mass and depth. The mush between them is the amateur angle and scores lowest.
Naming both means there are two right answers and the player can pick.

## Assembling a scene

A photograph is not one subject. It is composed as follows, in order.

**1. Cluster.** Several of the same species close together become a *single*
subject scoring `1 + 0.35·ln(N)` — twelve pigeons is about 1.9×, not 12×. A flock
in the air is one strong thing that happens to be made of birds, and it must not
decompose into twelve weak entries that decay to nothing. This is also what makes
the thrown hot dog pay off.

**2. Rank.** Score every subject independently, sort descending. The highest is
the **primary**.

**3. Decay.** Supporting subject at rank *n* (starting at 1) contributes
`points / (D · n)`, where `D` is the **scene divisor**.

`D` is a **property of the lens, not a global constant** — see `PROGRESSION.md`.
A fisheye is an instrument for scenes and scores supporting subjects generously;
a telephoto is an instrument for subjects and barely scores them at all. This is
what makes buying glass change *what kind of photograph you are taking* rather
than making the same photograph worth more. Default 5 for a standard lens.

The rank decay matters more than it looks. A flat divisor makes a crowd worth its
headcount: on Michigan Avenue, 28 supporting subjects averaging 150 points would
add 420 to a 900-point primary — a 47% bonus for swinging the camera at the
busiest thing in view. Because the harmonic series grows logarithmically, `/5n`
turns that same crowd into about 13%.

**4. Composition bonuses.** Flat, named awards for *relationships* rather than
counts. This is where scene value actually lives, and it is deliberately not in
the decay: decay can only ever reward headcount, and headcount is not
composition.

| Bonus | Condition |
|---|---|
| **Scale** | A small figure or vehicle near the base of a large structure. |
| **Context** | Two or more named landmarks in one frame. |
| **Life** | Something in motion — traffic, a cyclist, a flock in flight. |
| **Depth** | Subjects at clearly separated distances, foreground against background. |

Tuned so a well-composed four-subject photograph beats a twenty-eight-subject
crowd. That relationship is the point of the whole scheme; if a change breaks it,
the change is wrong.

## Grade

The letter grade comes from the **primary subject's quality alone**. Points carry
the scene. A perfect pigeon and a perfect cathedral both earn an S — rarity and
scene change what it is *worth*, never what it is *graded*.

## Invariants

Things a change must not break.

- Scoring imports no three.js and no renderer state.
- Actor weights sum to 1. Structure weights sum to 1. There is a test.
- The same snapshot always produces the same score.
- Every term appears in the breakdown with a name a player can act on.
- A crowd never outscores a composition.

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

### Structures — named buildings

Buildings have no pose and no facing-you, and want terms of their own. Weights
sum to 1.

| Term | Weight | What it measures |
|---|---|---|
| **Fit** | 0.30 | Fraction of the silhouette inside the frame. Whole building is the headline postcard virtue; clipping a corner should fall off a cliff, not a ramp. |
| **Fill** | 0.20 | How much of the frame it occupies. Wants roughly half to two-thirds — big, with breathing room. |
| **Clear** | 0.20 | Fraction of the silhouette not blocked by trees, poles or other buildings. |
| **Level** | 0.20 | How close to horizontal the camera was. See below. |
| **Face** | 0.10 | Angle to the nearest facade normal. Two good answers, not one. |

**Light** multiplies the result (roughly 0.85–1.15) from the section's lighting
profile. Golden and blue hour pay; flat midday does not.

**Level** is the rule the equipment tree exists to answer. The penalty scales
with the structure's *angular height*, not with pitch alone: tilting up at a
two-storey shop is free, and the same tilt at a 340 m tower is ruinous, because
that is when verticals visibly converge. This is what makes portrait orientation,
wide-angle glass and eventually a shift lens feel like capabilities rather than
upgrades — each one buys back height without tilt.

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
`points / (D · n)`, where `D` is the **scene divisor** — a property of the lens,
default 5.

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

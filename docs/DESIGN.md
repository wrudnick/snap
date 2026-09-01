# snap — design

## The premise

You work for a postcard company. You ride a fixed route through a real place,
photograph it, and sell what you come back with. Good pictures pay. The money
buys better equipment and access to more of the city, and eventually you are a
world-renowned postcard photographer.

The fiction earns its place rather than decorating the game, for two reasons.

**It makes the buildings matter.** Fifty-two of the landmarks on the Gold Coast
route are hand-modelled from photographs and, before this, were worth exactly
zero points — the largest single investment in the repository was scenery. A
postcard is traditionally a picture of a *place*, so architecture becomes the
subject rather than the backdrop.

**It gives levels a reason to exist beyond new scenery.** The Hancock is 343 m
tall and Michigan Avenue is about 30 m wide. From the pavement you cannot fit it
in frame without tilting up so far that the verticals converge — that shot is not
difficult, it is unavailable. It becomes available from the water. So a new
location is not "more street", it is *a set of photographs that were previously
impossible*, which is a much better reason to want one.

## The loop

1. Pick a location on the map. You start with one; the rest are bought.
2. Ride it. You cannot stop, cannot go back, and have a fixed roll of film.
3. Frame and shoot. Raise the camera to your eye to compose through the
   viewfinder; throw things to make the world react.
4. At the end, choose which shots to develop from the contact sheet.
5. They sell. The money buys equipment and locations.

A run is short enough to repeat and different enough each time — traffic,
behaviour and light are not fixed — that the same route rewards being learned.

## Settled

These are decisions, not suggestions. If you are an agent about to change one,
the rationale is here so you can tell whether your reason is better than the
original one.

| Decision | Why |
|---|---|
| **Free shooting, no per-run briefs** | Direction comes from *where* you can afford to go, not from a checklist. The joy of this genre is noticing things; a fetch quest replaces noticing with searching. |
| **A single currency** | One number, earned by selling photographs, buys both equipment and locations. Simplest to build, simplest to explain, and the spending choice ("lens or new location?") is itself the interesting decision. |
| **Keystone rule on** | Tilting up to fit a tall building costs points. This is the rule that gives the equipment tree something to fix — portrait, wide angle and tilt-shift all exist to answer a complaint the scoring taught you. Without it, gear is a stat upgrade. |
| **Scene scoring: primary + decayed support + named bonuses** | See `SCORING.md`. A single-subject score wastes a street full of life; a naive scene score rewards standing in a crowd. |
| **Grade reflects the primary subject only** | Points carry the scene, the letter grade carries craft. Otherwise a careless snap of a busy street earns an S and the grade stops being feedback. It also means money responds to the primary and portfolio score responds to the scene, which is what makes composition unfarmable. |
| **One postcard per subject, sold as a ratchet** | Grades pay a fixed ladder and a better one pays only the difference, so each slot pays out the same total whatever route you took. The money supply becomes finite and computable — see `PROGRESSION.md`. |
| **Deterministic, geometric scoring** | No vision model, no ML judge. The fun is a legible rulebook you learn to play against, and every rule here must be explainable in one line in the breakdown UI. |

## Open

Genuinely undecided. Do not treat any of these as settled by implication.

- **Does film cost money?** A roll per run makes each shot weigh more, but
  punishes experimenting. Leaning no, at least early.
- **Do photographs sell once or earn royalties over time?** Royalties reward a
  strong back catalogue and make the album meaningful; they also complicate the
  economy and can trickle money without play.
- **Is there a collection meta-goal** (photograph all 52 landmarks, all 25
  species) and does it pay, or is it its own reward?
- **Weather and season.** Obvious postcard fodder, unclear whether it is a
  multiplier on an existing route or a separate unlockable state.
- **Do clients exist at all?** Ruled out as per-run briefs; possibly still worth
  having as standing preferences that price certain subjects higher.

## Where the rest is

- `SCORING.md` — the rulebook. The one document a change must not silently
  violate.
- `PROGRESSION.md` — currency, equipment, the map, unlock order.
- `LEVELS.md` — locations, what each one is *for* photographically.
- `BACKLOG.md` — what to build, in order, and what is deliberately deferred.

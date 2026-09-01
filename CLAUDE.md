# snap

An on-rails photography game set in a real Chicago, in the style of Jet Set Radio
Future. You work for a postcard company: ride a fixed route, photograph the
place, sell what you bring back, buy better equipment and more of the city.

## Read these before changing game rules

Design decisions live in `docs/` and carry their rationale, so you can tell
whether your reason for changing one is better than the original reason for
making it.

- **`docs/DESIGN.md`** — the premise, the loop, what is settled and what is open.
- **`docs/SCORING.md`** — the rulebook. Do not silently violate it; it lists its
  own invariants at the bottom.
- **`docs/PROGRESSION.md`** — currency, bodies and lenses, the map.
- **`docs/LEVELS.md`** — locations and what each one is photographically *for*.
- **`docs/BACKLOG.md`** — build order, and what is deliberately deferred.

## Architecture notes that are load-bearing

- **Scoring is pure.** `src/game/scoring/` imports no three.js and no renderer
  state. A `PhotoSnapshot` goes in, a breakdown comes out. That seam is what
  makes the rules testable against hand-written literals — keep it.
- **Content is data.** A new subject, item or route is a file in `src/content/`,
  not a change in `src/game/`.
- **Measure before fixing.** Nearly every serious bug in this project's history
  was found by measuring and missed by looking: subjects standing in buildings,
  cars driving through walls, a 1.6-second shutter, geometry sealed invisibly
  inside other geometry. Screenshots have actively misled. Prefer an invariant
  test to an inspection.
- **No `setState` during play.** Per-frame values live in refs; game state is in
  zustand read transiently.

## Commands

```bash
npm run dev        # dev server
npm test           # vitest — scoring, geometry, placement invariants
npm run test:e2e   # playwright — the loop, the route, the phone
```

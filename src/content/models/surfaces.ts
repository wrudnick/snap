/**
 * Surface colours, shared by the city ground and the props that stand on it.
 *
 * Split out of `environment.ts` for the same reason `streetWidths.ts` was:
 * `cityGround` needed two constants from `environment`, which made an import
 * cycle the moment `environment` needed anything back from `cityGround`. Under
 * Vitest a cycle does not fail — it silently reports "no tests" for the file
 * and the suite quietly shrinks, which took two runs to notice last time.
 *
 * Constants have no dependencies, so a module that holds only constants cannot
 * be in a cycle.
 */
export const SAND = 0xd8c9a4
export const ASPHALT = 0x44484f
export const SIDEWALK = 0x9a9184

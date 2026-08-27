import { useMemo } from 'react'

import { ROUTES } from '@/content/routes/goldcoast'
import type { RouteDef } from '@/content/routes/types'

import { Rail } from './rail'
import { resolveRoute, type ResolvedRoute } from './sections'

export interface RouteBundle {
  route: RouteDef
  rail: Rail
  resolved: ResolvedRoute
}

/**
 * Route, rail and resolved sections, shared by identity.
 *
 * The scene and the HUD both need the rail — the scene to travel it, the minimap
 * to draw it — but they live either side of the Canvas boundary. A module-level
 * cache means both get the *same* Rail instance rather than each building its
 * own, which matters because resolving sections samples the spline 600 times per
 * waypoint and there is no reason to pay for that twice.
 */
const cache = new Map<string, RouteBundle>()

export function useRouteBundle(routeId: string): RouteBundle {
  return useMemo(() => {
    let bundle = cache.get(routeId)
    if (!bundle) {
      const route = ROUTES[routeId] ?? ROUTES.goldcoast!
      const rail = new Rail(route)
      bundle = { route, rail, resolved: resolveRoute(route, rail) }
      cache.set(routeId, bundle)
    }
    return bundle
  }, [routeId])
}

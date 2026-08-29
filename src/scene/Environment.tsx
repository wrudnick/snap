import { Instance, Instances } from '@react-three/drei'
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'

import { generateEnvironment, type Prop } from '@/content/models/environment'
import { buildCityGeometry } from '@/content/models/city'
import { buildCityGround } from '@/content/models/cityGround'
import { buildLandmark } from '@/content/models/landmarks'
import type { LandmarkDef } from '@/content/models/landmarks'
import type { RouteDef } from '@/content/routes/types'
import { type Rail, segmentActive } from '@/game/rail'
import type { ResolvedSection } from '@/game/sections'
import { toonRamp } from '@/render/palette'
import { patchToonMaterial } from '@/render/toonPatch'
import { useToonMaterial } from '@/render/useToonMaterial'

import { useActiveSegment } from './useActiveSegment'

/**
 * The world alongside the route.
 *
 * Ground is a single vertex-coloured ribbon following the spline — one draw call
 * for sand, road, sidewalk, tunnel floor and restaurant flooring across the
 * whole 540 m. Everything vertical is instanced and gated by rail segment.
 */

interface GroupProps {
  props: Prop[]
  limit: number
  castShadow?: boolean
  receiveShadow?: boolean
  /**
   * Which primitive the whole group is drawn from.
   *
   * One instanced mesh per shape, not per object — so every tree canopy and
   * every string-light bulb in the world is a single draw call between them.
   */
  shape?: 'box' | 'sphere'
}

function PropInstances({ props, limit, castShadow, receiveShadow, shape }: GroupProps) {
  const material = useToonMaterial(0xffffff)

  return (
    <Instances
      limit={limit}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      // InstancedMesh caches its bounding sphere on first compute and drei
      // rewrites instance matrices without invalidating it, so the sphere stays
      // at the origin and the whole group vanishes once the camera travels.
      // Segment gating is our culling anyway.
      frustumCulled={false}
    >
      {shape === 'sphere' ? <sphereGeometry args={[0.5, 10, 8]} /> : <boxGeometry />}
      <primitive object={material} attach="material" dispose={null} />
      {props.map((p, i) => (
        <Instance
          key={i}
          position={p.position}
          scale={p.scale}
          rotation={[0, p.rotationY, 0]}
          color={p.color}
        />
      ))}
    </Instances>
  )
}

/**
 * The real city, extruded from OpenStreetMap footprints.
 *
 * About a thousand buildings in one merged, vertex-coloured, non-indexed mesh —
 * a single draw call for the whole of the Gold Coast. Never gated: it is one
 * call whatever is on screen, and half the point is seeing a mile down Michigan.
 */
function City() {
  // No footprint culling here. The route is kept clear of buildings in the
  // route data, guarded by tests/corridor.test.ts — deleting real Chicago to
  // paper over a bad waypoint costs more than it fixes.
  const built = useMemo(() => buildCityGeometry(), [])

  const material = useMemo(
    () =>
      patchToonMaterial(
        new THREE.MeshToonMaterial({
          color: 0xffffff,
          gradientMap: toonRamp(),
          vertexColors: true,
        }),
        // Windows, spandrels and cornices, drawn from the facade attributes the
        // city geometry carries. No textures, no extra draw calls.
        { facade: {} },
      ),
    [],
  )

  useEffect(() => {
    return () => {
      built.geometry.dispose()
      material.dispose()
    }
  }, [built, material])

  return (
    <mesh geometry={built.geometry} castShadow receiveShadow frustumCulled={false}>
      <primitive object={material} attach="material" dispose={null} />
    </mesh>
  )
}

/**
 * The floor of the whole district: every OSM street, plus paving between them.
 *
 * Separate mesh from the route ribbon rather than merged into it, because the
 * two are built from different sources and change independently — and it costs
 * exactly one extra draw call.
 */
function CityGround() {
  const built = useMemo(() => buildCityGround(), [])

  const material = useMemo(
    () =>
      patchToonMaterial(
        new THREE.MeshToonMaterial({
          color: 0xffffff,
          gradientMap: toonRamp(),
          vertexColors: true,
          // Front faces only: the builder flips any triangle that came out
          // pointing down, so a reversed normal is now a bug rather than
          // something the material quietly absorbs.
        }),
        { ground: {} },
      ),
    [],
  )

  useEffect(() => {
    return () => {
      built.geometry.dispose()
      material.dispose()
    }
  }, [built, material])

  return (
    <mesh geometry={built.geometry} receiveShadow frustumCulled={false}>
      <primitive object={material} attach="material" dispose={null} />
    </mesh>
  )
}

/**
 * Hand-authored buildings.
 *
 * Never gated. There are a handful, they are the reason the setting is
 * recognisable, and half of them are meant to be seen from most of a mile away.
 */
function Landmarks({ landmarks }: { landmarks?: LandmarkDef[] }) {
  const groups = useMemo(
    () => (landmarks ?? []).map((def) => ({ def, object: buildLandmark(def) })),
    [landmarks],
  )

  useEffect(() => {
    return () => {
      for (const { object } of groups) {
        object.traverse((child) => {
          if (child instanceof THREE.Mesh) child.geometry.dispose()
        })
      }
    }
  }, [groups])

  return (
    <group>
      {groups.map(({ def, object }) => (
        <primitive key={def.id} object={object} dispose={null} />
      ))}
    </group>
  )
}

export function Environment({
  route,
  rail,
  sections,
}: {
  route: RouteDef
  rail: Rail
  sections: ResolvedSection[]
}) {
  const data = useMemo(
    () => generateEnvironment(route, rail, sections),
    [route, rail, sections],
  )
  const segment = useActiveSegment()

  // Vertex colours carry the ground's material variation, so one mesh covers
  // every surface type on the route.
  const groundMaterial = useMemo(
    () =>
      patchToonMaterial(
        new THREE.MeshToonMaterial({
          color: 0xffffff,
          gradientMap: toonRamp(),
          vertexColors: true,
          // The ribbon's triangle winding depends on which way the path curves,
          // so its normals aren't reliably upward and single-sided rendering
          // culls stretches of ground at random. DoubleSide also flips the
          // normal per-fragment via gl_FrontFacing, so lighting stays correct.
          side: THREE.DoubleSide,
        }),
        // Paving, road markings, sand ripples and water bands, all computed in
        // the fragment shader from metre coordinates. See render/ground.ts.
        { ground: {} },
      ),
    [],
  )

  useEffect(() => {
    return () => {
      groundMaterial.dispose()
    }
  }, [groundMaterial, data])

  const visible = useMemo(() => {
    const w = route.activeWindows
    const keep = (window: number) => (p: Prop) =>
      segmentActive(p.segment, segment, window)

    return {
      buildings: data.buildings.filter(keep(w?.buildings ?? route.activeWindow)),
      poles: data.poles.filter(keep(w?.furniture ?? route.activeWindow)),
      heads: data.heads.filter(keep(w?.furniture ?? route.activeWindow)),
      clutter: data.clutter.filter(keep(w?.clutter ?? route.activeWindow)),
      blobs: data.blobs.filter(keep(w?.furniture ?? route.activeWindow)),
    }
  }, [data, segment, route.activeWindow, route.activeWindows])

  return (
    <group>
      <CityGround />
      <City />
      <Landmarks landmarks={route.landmarks} />

      <PropInstances props={visible.buildings} limit={420} castShadow receiveShadow />
      <PropInstances props={visible.poles} limit={80} castShadow />
      <PropInstances props={visible.heads} limit={80} castShadow />
      <PropInstances props={visible.clutter} limit={80} castShadow receiveShadow />
      <PropInstances props={visible.blobs} limit={420} shape="sphere" castShadow />
    </group>
  )
}

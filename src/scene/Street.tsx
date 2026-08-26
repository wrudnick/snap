import { Instance, Instances } from '@react-three/drei'
import { useMemo } from 'react'

import { generateStreet, type Prop } from '@/content/models/street'
import type { RouteDef } from '@/content/routes/types'
import { segmentActive } from '@/game/rail'
import { toonRamp } from '@/render/palette'
import { useToonMaterial } from '@/render/useToonMaterial'

/** Bisect toggle: ?patch=0 drops the shader patch from instanced props. */
const PATCH_ENABLED =
  typeof window === 'undefined' ||
  new URLSearchParams(window.location.search).get('patch') !== '0'

import { useActiveSegment } from './useActiveSegment'

/**
 * The street blockout.
 *
 * Every repeated prop type is a single InstancedMesh, so the entire city is
 * roughly seven draw calls: road, two sidewalks, buildings, lamppost poles,
 * lamppost heads, bins. Props outside the active segment window are unmounted
 * entirely rather than merely culled — gating object *count* is far cheaper than
 * frustum-testing a live world every frame.
 */

interface GroupProps {
  props: Prop[]
  limit: number
  castShadow?: boolean
  receiveShadow?: boolean
}

function PropInstances({ props, limit, castShadow, receiveShadow }: GroupProps) {
  // White base so drei's per-instance colours multiply through cleanly.
  const material = useToonMaterial(0xffffff)

  return (
    <Instances
      limit={limit}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      // InstancedMesh computes its bounding sphere once and caches it. drei
      // rewrites instance matrices every frame without invalidating it, so the
      // sphere stays where the instances were on frame one — at the origin — and
      // the entire group gets frustum-culled as soon as the camera travels away
      // from it. Segment gating already limits content to the camera's vicinity,
      // so per-object frustum culling here buys nothing anyway.
      frustumCulled={false}
    >
      <boxGeometry />
      {PATCH_ENABLED ? (
        /* Imperative material so it carries the toon patch; a JSX
           <meshToonMaterial> would skip onBeforeCompile. `dispose={null}`
           because the hook owns the lifecycle. */
        <primitive object={material} attach="material" dispose={null} />
      ) : (
        <meshToonMaterial gradientMap={toonRamp()} />
      )}
      {props.map((p) => (
        <Instance
          key={`${p.position[0]}:${p.position[2]}:${p.scale[1]}`}
          position={p.position}
          scale={p.scale}
          rotation={[0, p.rotationY, 0]}
          color={p.color}
        />
      ))}
    </Instances>
  )
}

export function Street({ route }: { route: RouteDef }) {
  const data = useMemo(() => generateStreet(route), [route])
  const segment = useActiveSegment()

  const roadMaterial = useToonMaterial(0x3b3f48)
  const sidewalkMaterial = useToonMaterial(0x8d8578)

  const visible = useMemo(() => {
    const keep = (p: Prop) => segmentActive(p.segment, segment, route.activeWindow)
    return {
      buildings: data.buildings.filter(keep),
      poles: data.lamppostPoles.filter(keep),
      heads: data.lamppostHeads.filter(keep),
      bins: data.bins.filter(keep),
    }
  }, [data, segment, route.activeWindow])

  const { road, sidewalk } = data

  return (
    <group>
      {/* Road and sidewalks span the whole route as single meshes — they're
          cheap, and gating them would show seams at segment boundaries. */}
      <mesh position={[0, 0, road.centerZ]} receiveShadow>
        <boxGeometry args={[road.width, 0.1, road.length]} />
        <primitive object={roadMaterial} attach="material" dispose={null} />
      </mesh>

      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[side * (sidewalk.inner + sidewalk.width / 2), sidewalk.height / 2, road.centerZ]}
          receiveShadow
        >
          <boxGeometry args={[sidewalk.width, sidewalk.height, road.length]} />
          <primitive object={sidewalkMaterial} attach="material" dispose={null} />
        </mesh>
      ))}

      <PropInstances props={visible.buildings} limit={120} castShadow receiveShadow />
      <PropInstances props={visible.poles} limit={40} castShadow />
      <PropInstances props={visible.heads} limit={40} castShadow />
      <PropInstances props={visible.bins} limit={40} castShadow receiveShadow />
    </group>
  )
}

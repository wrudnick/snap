import { Instance, Instances } from '@react-three/drei'
import { useMemo } from 'react'

import { generateStreet, type Prop } from '@/content/models/street'
import type { RouteDef } from '@/content/routes/types'
import { segmentActive } from '@/game/rail'

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
  return (
    <Instances limit={limit} castShadow={castShadow} receiveShadow={receiveShadow}>
      <boxGeometry />
      <meshLambertMaterial />
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
        <meshLambertMaterial color={0x33363d} />
      </mesh>

      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[side * (sidewalk.inner + sidewalk.width / 2), sidewalk.height / 2, road.centerZ]}
          receiveShadow
        >
          <boxGeometry args={[sidewalk.width, sidewalk.height, road.length]} />
          <meshLambertMaterial color={0x6a6d73} />
        </mesh>
      ))}

      <PropInstances props={visible.buildings} limit={120} castShadow receiveShadow />
      <PropInstances props={visible.poles} limit={40} castShadow />
      <PropInstances props={visible.heads} limit={40} castShadow />
      <PropInstances props={visible.bins} limit={40} castShadow receiveShadow />
    </group>
  )
}

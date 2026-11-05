import { useMemo } from 'react';
import { Instanced, type InstanceTransform } from './Instanced.tsx';
import { BOUNDARY_HEDGES, CYPRESS_AVENUE, GROVE_RING, OLIVE_TREES, type Placement } from './layout.ts';
import { getWorldMaterials } from './materials.ts';
import { getWorldGeometries } from './worldGeometries.ts';

/** Small deterministic size variation so repeated trees don't look stamped. */
const jitter = (p: Placement, amount: number) => 1 + (((p.position[0] * 13.1 + p.position[1] * 7.7) % 1) + 1) % 1 * amount - amount / 2;

export function Vegetation() {
  const materials = getWorldMaterials();
  const geometries = getWorldGeometries();

  const { cypress, hedges, olives } = useMemo(() => {
    const at = (p: Placement, scale: InstanceTransform['scale'] = 1): InstanceTransform => ({
      position: [p.position[0], 0, p.position[1]],
      rotationY: p.rotationY,
      scale,
    });
    const groveCypress = GROVE_RING.filter((p) => p.variant === 0);
    const groveHedges = GROVE_RING.filter((p) => p.variant === 1);
    return {
      cypress: [...CYPRESS_AVENUE, ...groveCypress].map((p) => {
        const s = jitter(p, 0.25);
        return at(p, [1, s, 1]);
      }),
      hedges: [
        ...BOUNDARY_HEDGES.map((p) => at(p, [1.2, 1.15 + (p.variant % 3) * 0.12, 1.2])),
        // Grove hedges are taller so the clearing stays hidden until you find the gap.
        ...groveHedges.map((p) => at(p, [1.1, 1.8, 1.1])),
      ],
      olives: OLIVE_TREES.map((p) => at(p, 0.85 + p.variant * 0.15)),
    };
  }, []);

  return (
    <>
      <Instanced geometry={geometries.cypressTrunk} material={materials.bark} items={cypress} />
      <Instanced geometry={geometries.cypressCrown} material={materials.cypress} items={cypress} />
      <Instanced geometry={geometries.oliveTrunk} material={materials.bark} items={olives} />
      <Instanced geometry={geometries.oliveCrown} material={materials.olive} items={olives} />
      <Instanced geometry={geometries.hedge} material={materials.hedge} items={hedges} />
    </>
  );
}

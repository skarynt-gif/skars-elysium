import { useMemo } from 'react';
import { Instanced, type InstanceTransform } from './Instanced.tsx';
import { COLUMNS, CYPRESS_AVENUE, GROVE_RING, OLIVE_TREES, STATUES, type Placement } from './layout.ts';
import { getWorldMaterials } from './materials.ts';
import { getWorldGeometries } from './worldGeometries.ts';

const toInstance = (p: Placement, y = 0, scale: InstanceTransform['scale'] = 1): InstanceTransform => ({
  position: [p.position[0], y, p.position[1]],
  rotationY: p.rotationY,
  scale,
});

/** Central fountain, the colonnade ring and the four statues. */
export function Landmarks() {
  const materials = getWorldMaterials();
  const geometries = getWorldGeometries();

  const intact = useMemo(() => COLUMNS.filter((c) => c.variant === 0).map((c) => toInstance(c)), []);
  const broken = useMemo(() => COLUMNS.filter((c) => c.variant === 1).map((c) => toInstance(c)), []);

  return (
    <>
      {/* Fountain */}
      <mesh geometry={geometries.fountainStone} material={materials.marbleStoneDouble} />
      <mesh geometry={geometries.fountainGold} material={materials.gold} />
      <mesh geometry={geometries.fountainWater} material={materials.water} />

      <Instanced geometry={geometries.column} material={materials.marbleStone} items={intact} />
      <Instanced geometry={geometries.brokenColumn} material={materials.marbleStone} items={broken} />

      {STATUES.map((s) => (
        <mesh
          key={s.variant}
          geometry={geometries.statues[s.variant]!}
          material={materials.marbleStone}
          position={[s.position[0], 0, s.position[1]]}
          rotation-y={s.rotationY}
        />
      ))}

      <BlobShadows />
    </>
  );
}

/** Stepped round shadows under everything tall: cheap, and very 1998. */
function BlobShadows() {
  const materials = getWorldMaterials();
  const geometries = getWorldGeometries();
  const items = useMemo<InstanceTransform[]>(() => {
    const flat = (p: Placement, r: number): InstanceTransform => ({
      position: [p.position[0] + 0.25, 0, p.position[1] + 0.2],
      scale: [r, 1, r],
    });
    return [
      ...COLUMNS.map((c) => flat(c, 0.95)),
      ...STATUES.map((s) => flat(s, 1.05)),
      ...CYPRESS_AVENUE.map((t) => flat(t, 1.0)),
      ...OLIVE_TREES.map((t) => flat(t, 2.3)),
      ...GROVE_RING.map((t) => flat(t, 1.0)),
    ];
  }, []);
  return <Instanced geometry={geometries.shadow} material={materials.blobShadow} items={items} />;
}

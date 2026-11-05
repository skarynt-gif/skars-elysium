import { WORLD } from './layout.ts';
import { getWorldMaterials } from './materials.ts';
import { getWorldGeometries } from './worldGeometries.ts';

/**
 * The hidden grove's clearing: a small shrine with a golden amphora. The
 * surrounding cypress/hedge ring is drawn by <Vegetation/>. Vault music and
 * secrets are placed here in later stages.
 */
export function Grove() {
  const materials = getWorldMaterials();
  const geometries = getWorldGeometries();
  const [x, z] = WORLD.grove.center;
  return (
    <group position={[x, 0, z]}>
      <mesh geometry={geometries.shrineStone} material={materials.marbleStone} />
      <mesh geometry={geometries.amphora} material={materials.gold} />
    </group>
  );
}

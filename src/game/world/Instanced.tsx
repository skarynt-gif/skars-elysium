import { useEffect, useMemo } from 'react';
import { InstancedMesh, Object3D, type BufferGeometry, type Material } from 'three';

export interface InstanceTransform {
  position: [number, number, number];
  rotationY?: number;
  scale?: [number, number, number] | number;
}

/**
 * Draws many copies of one model in a single draw call. Used for columns,
 * trees, hedges, grass tufts and shadows.
 */
export function Instanced({
  geometry,
  material,
  items,
}: {
  geometry: BufferGeometry;
  material: Material;
  items: readonly InstanceTransform[];
}) {
  const mesh = useMemo(() => {
    const instanced = new InstancedMesh(geometry, material, Math.max(1, items.length));
    instanced.count = items.length;
    const dummy = new Object3D();
    items.forEach((item, i) => {
      dummy.position.set(...item.position);
      dummy.rotation.set(0, item.rotationY ?? 0, 0);
      const s = item.scale ?? 1;
      if (typeof s === 'number') dummy.scale.setScalar(s);
      else dummy.scale.set(...s);
      dummy.updateMatrix();
      instanced.setMatrixAt(i, dummy.matrix);
    });
    instanced.instanceMatrix.needsUpdate = true;
    instanced.computeBoundingSphere();
    return instanced;
  }, [geometry, material, items]);

  // Geometry and material are shared, so only the per-instance data is freed.
  useEffect(() => () => mesh.dispose(), [mesh]);

  return <primitive object={mesh} />;
}

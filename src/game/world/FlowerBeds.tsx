import { useEffect, useMemo, useState } from 'react';
import { MeshLambertMaterial } from 'three';
import type { Collection } from '../../content/types.ts';
import { retroMaterial } from '../render/retroMaterial.ts';
import { Instanced, type InstanceTransform } from './Instanced.tsx';
import { WORLD, type BedAssignment, type Plot } from './layout.ts';
import { getWorldMaterials } from './materials.ts';
import { createSignTexture, pixelFontReady } from './signTexture.ts';
import { getWorldGeometries } from './worldGeometries.ts';

/**
 * Raised marble beds around the plaza. Beds with a collection get a title
 * plaque (flowers are drawn by flowers/FlowerField.tsx); empty plots appear overgrown,
 * waiting for future releases.
 */
export function FlowerBeds({ assignment }: { assignment: BedAssignment }) {
  const materials = getWorldMaterials();
  const geometries = getWorldGeometries();

  const reserved = assignment.main.filter((b) => !b.collection).map((b) => b.plot);
  const overgrowth = useMemo(() => overgrowthTufts(reserved), [reserved.map((p) => p.id).join()]);

  return (
    <>
      {assignment.main.map(({ plot, collection }) => (
        <group key={plot.id} position={[plot.center[0], 0, plot.center[1]]} rotation-y={plot.rotationY}>
          <mesh geometry={geometries.bedCurb} material={materials.marbleStone} />
          <mesh geometry={geometries.bedSoil} material={collection ? materials.soil : materials.grass} />
          {collection && <BedSign collection={collection} />}
        </group>
      ))}
      <Instanced geometry={geometries.tuft} material={materials.grassTuft} items={overgrowth} />
    </>
  );
}

function BedSign({ collection }: { collection: Collection }) {
  const geometries = getWorldGeometries();
  const materials = getWorldMaterials();
  const [fontReady, setFontReady] = useState(false);

  useEffect(() => {
    let alive = true;
    void pixelFontReady().then(() => alive && setFontReady(true));
    return () => {
      alive = false;
    };
  }, []);

  // Repaint once the pixel font has loaded.
  const face = useMemo(
    () => retroMaterial(new MeshLambertMaterial({ map: createSignTexture(collection.title), emissive: '#2a1a10' })),
    [collection.title, fontReady],
  );
  useEffect(
    () => () => {
      face.map?.dispose();
      face.dispose();
    },
    [face],
  );

  return (
    // Back edge of the bed, facing the plaza: behind the flowers, out of the path.
    <group position={[0, 0.2, -WORLD.bed.depth / 2 + 0.35]}>
      <mesh geometry={geometries.signPosts} material={materials.bronze} />
      <mesh geometry={geometries.signFace} material={face} />
    </group>
  );
}

/** Dense grass filling unused beds, transformed into world space. */
function overgrowthTufts(plots: readonly Plot[]): InstanceTransform[] {
  const items: InstanceTransform[] = [];
  for (const plot of plots) {
    const c = Math.cos(plot.rotationY);
    const s = Math.sin(plot.rotationY);
    for (let gx = -2.2; gx <= 2.2; gx += 0.75) {
      for (let gz = -1.1; gz <= 1.1; gz += 0.65) {
        const ox = gx + ((gz * 7) % 0.3);
        // Rotate the local grid point by the bed's rotation.
        const wx = plot.center[0] + ox * c + gz * s;
        const wz = plot.center[1] - ox * s + gz * c;
        items.push({ position: [wx, 0.25, wz], rotationY: gx * 3 + gz, scale: 1.15 });
      }
    }
  }
  return items;
}

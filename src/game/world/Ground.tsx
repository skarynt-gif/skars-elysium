import { useMemo } from 'react';
import { useGameStore } from '../../state/gameStore.ts';
import { lushness } from '../../content/releases.ts';
import { Instanced, type InstanceTransform } from './Instanced.tsx';
import { groundDisc, groundStrip, merge, planarUV } from './geometries.ts';
import { PATHS, WORLD, scatter } from './layout.ts';
import { getWorldMaterials } from './materials.ts';
import { getWorldGeometries } from './worldGeometries.ts';

/** Grass ground, the marble plaza, every path, and scattered grass tufts. */
export function Ground() {
  const materials = getWorldMaterials();
  const geometries = getWorldGeometries();
  const quality = useGameStore((s) => s.quality?.foliageDensity ?? 1);
  // The garden fills in as more music is released.
  const growth = useGameStore((s) => (s.content.status === 'ready' ? lushness(s.content.manifest) : 0.75));
  const density = quality * growth;

  const { grass, plaza, paths, approach } = useMemo(
    () => ({
      grass: planarUV(groundDisc(90, 40, 0), 3),
      plaza: planarUV(groundDisc(WORLD.plazaRadius, 24, 0.025), 2.4),
      paths: planarUV(merge(PATHS.map((p) => groundStrip(p.from as [number, number], p.to as [number, number], p.width, 0.015))), 2.4),
      // Short road outside the gate, seen from the title screen.
      approach: planarUV(groundStrip([0, WORLD.gate.z + 1], [0, WORLD.gate.z + 16], WORLD.pathWidth + 0.6, 0.015), 2.4),
    }),
    [],
  );

  const tufts = useMemo<InstanceTransform[]>(
    () =>
      scatter('grass-tufts', Math.round(320 * density), 0.15, 0.9).map((p, i) => ({
        position: [p[0], 0, p[1]],
        rotationY: (i * 1.7) % Math.PI,
        scale: 0.8 + ((i * 37) % 10) / 20,
      })),
    [density],
  );

  return (
    <>
      <mesh geometry={grass} material={materials.grass} />
      <mesh geometry={plaza} material={materials.marbleTiles} />
      <mesh geometry={paths} material={materials.marbleTiles} />
      <mesh geometry={approach} material={materials.marbleTiles} />
      <Instanced geometry={geometries.tuft} material={materials.grassTuft} items={tufts} />
    </>
  );
}

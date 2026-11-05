import { useMemo } from 'react';
import type { BufferGeometry, Material } from 'three';
import type { Decoration, DecorationPreset } from '../../content/types.ts';
import { hashString } from '../../lib/random.ts';
import { DECORATION_PRESETS } from './decorations.ts';
import { Instanced, type InstanceTransform } from './Instanced.tsx';
import { getWorldMaterials } from './materials.ts';
import { useDecorations } from './useGardenSettings.ts';
import { getWorldGeometries } from './worldGeometries.ts';

type Part = { key: string; geometry: BufferGeometry; material: Material; scale?: [number, number, number] };

/** The models (and materials) each preset is built from. Statues pick one of four poses from their id. */
function partsFor(d: Decoration): Part[] {
  const g = getWorldGeometries();
  const m = getWorldMaterials();
  const parts: Record<DecorationPreset, () => Part[]> = {
    statue: () => {
      const pose = hashString(d.id) % 4;
      return [{ key: `statue-${pose}`, geometry: g.statues[pose]!, material: m.marbleStone }];
    },
    column: () => [{ key: 'column', geometry: g.column, material: m.marbleStone }],
    'broken-column': () => [{ key: 'broken-column', geometry: g.brokenColumn, material: m.marbleStone }],
    lantern: () => [
      { key: 'lantern-post', geometry: g.lanternPost, material: m.bronze },
      { key: 'lantern-glow', geometry: g.lanternGlow, material: m.arrowGlow },
    ],
    bench: () => [{ key: 'bench', geometry: g.bench, material: m.marbleStone }],
    urn: () => [{ key: 'urn', geometry: g.urn, material: m.marbleStone }],
    archway: () => [{ key: 'archway', geometry: g.archway, material: m.marbleStone }],
    cypress: () => [
      { key: 'cypress-trunk', geometry: g.cypressTrunk, material: m.bark },
      { key: 'cypress-crown', geometry: g.cypressCrown, material: m.cypress },
    ],
    'olive-tree': () => [
      { key: 'olive-trunk', geometry: g.oliveTrunk, material: m.bark },
      { key: 'olive-crown', geometry: g.oliveCrown, material: m.olive },
    ],
    // A hedge segment: three bushes in a row, matching its colliders.
    hedge: () => [{ key: 'hedge', geometry: g.hedge, material: m.hedge, scale: [1.8, 1.25, 0.95] }],
  };
  return parts[d.preset]();
}

/**
 * Decorations placed in the Creator Studio: statues, columns, lanterns,
 * benches, urns, archways, trees and hedges. Drawn in batches (one draw call
 * per model), with blob shadows; their solid parts block visitors like any
 * other landmark (see useColliders).
 */
export function Decorations() {
  const decorations = useDecorations();
  const materials = getWorldMaterials();
  const geometries = getWorldGeometries();

  const { batches, shadows } = useMemo(() => {
    const byKey = new Map<string, { part: Part; items: InstanceTransform[] }>();
    const shadowItems: InstanceTransform[] = [];
    for (const d of decorations) {
      const rotationY = (-d.rotation * Math.PI) / 180;
      for (const part of partsFor(d)) {
        const entry = byKey.get(part.key) ?? { part, items: [] };
        const [sx, sy, sz] = part.scale ?? [1, 1, 1];
        entry.items.push({ position: [d.x, 0, d.z], rotationY, scale: [sx * d.scale, sy * d.scale, sz * d.scale] });
        byKey.set(part.key, entry);
      }
      const r = DECORATION_PRESETS[d.preset].shadow * d.scale;
      if (r > 0) shadowItems.push({ position: [d.x + 0.25, 0, d.z + 0.2], scale: [r, 1, r] });
    }
    return { batches: [...byKey.values()], shadows: shadowItems };
  }, [decorations]);

  if (decorations.length === 0) return null;
  return (
    <>
      {batches.map(({ part, items }) => (
        <Instanced key={part.key} geometry={part.geometry} material={part.material} items={items} />
      ))}
      {shadows.length > 0 && <Instanced geometry={geometries.shadow} material={materials.blobShadow} items={shadows} />}
    </>
  );
}

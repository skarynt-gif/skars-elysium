import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group, Mesh } from 'three';
import { useGameStore } from '../../state/gameStore.ts';
import { registerPickable } from '../interaction/pickables.ts';
import { assignBeds } from '../world/layout.ts';
import { getWorldMaterials } from '../world/materials.ts';
import { getWorldGeometries } from '../world/worldGeometries.ts';
import { arrowSpecs, type ArrowSpec } from './arrows.ts';
import { startTravel } from './travelState.ts';

/** Arrows can be selected from this far away. */
const ARROW_REACH = 30;

/**
 * Marble arrows with glowing gold inlays, embedded in the paths. Select one
 * to glide to its destination. Generated from the manifest's collections.
 */
export function NavigationArrows() {
  const content = useGameStore((s) => s.content);
  const groveFound = useGameStore((s) => s.groveFound);
  const collections = content.status === 'ready' ? content.manifest.collections : null;
  const specs = useMemo(() => arrowSpecs(assignBeds(collections ?? []), groveFound), [collections, groveFound]);
  const materials = getWorldMaterials();

  // Slow golden pulse shared by all arrows.
  useFrame(({ clock }) => {
    materials.arrowGlow.emissiveIntensity = 0.45 + Math.sin(clock.elapsedTime * 2.2) * 0.25;
  });

  return (
    <>
      {specs.map((spec) => (
        <Arrow key={spec.id} spec={spec} />
      ))}
    </>
  );
}

function Arrow({ spec }: { spec: ArrowSpec }) {
  const geometries = getWorldGeometries();
  const materials = getWorldMaterials();
  const hit = useRef<Mesh>(null);
  const group = useRef<Group>(null);
  const inlay = useRef<Mesh>(null);

  useEffect(() => {
    if (!hit.current) return;
    return registerPickable({
      id: spec.id,
      kind: 'arrow',
      object: hit.current,
      label: spec.label,
      maxDistance: ARROW_REACH,
      onSelect: () => startTravel(spec.destination, spec.label),
    });
  }, [spec]);

  // Highlight when aimed at (desktop) or nearest (touch).
  useFrame(() => {
    const focused = useGameStore.getState().focus?.id === spec.id;
    if (inlay.current) inlay.current.material = focused ? materials.arrowGlowFocused : materials.arrowGlow;
    if (group.current) {
      const target = focused ? 1.12 : 1;
      const s = group.current.scale.x + (target - group.current.scale.x) * 0.2;
      group.current.scale.set(s, 1, s);
    }
  });

  return (
    <group ref={group} position={[spec.position[0], 0, spec.position[1]]} rotation-y={spec.rotationY}>
      <mesh geometry={geometries.arrowBase} material={materials.marbleStone} />
      <mesh ref={inlay} geometry={geometries.arrowInlay} material={materials.arrowGlow} />
      <mesh ref={hit} geometry={geometries.arrowHit} visible={false} />
    </group>
  );
}

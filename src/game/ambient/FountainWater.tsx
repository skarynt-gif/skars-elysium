import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, CylinderGeometry, DoubleSide, Mesh, MeshBasicMaterial, MeshLambertMaterial, RingGeometry } from 'three';
import { useGameStore } from '../../state/gameStore.ts';
import { retroMaterial } from '../render/retroMaterial.ts';
import { getWorldMaterials } from '../world/materials.ts';
import { paintTexture } from '../world/textures.ts';

const RIPPLES = 3;
const GOLD = new Color('#ffd27a');

/**
 * Brings the fountain to life: scrolling pool water, sheets of water falling
 * from the upper bowl and the top spout, and ripple rings spreading across
 * the basin. Finding every laurel turns the water to gold.
 */
export function FountainWater() {
  const golden = useGameStore((s) => s.laurelsAllFound);

  const parts = useMemo(() => {
    const fallTexture = paintTexture('water');
    fallTexture.repeat.set(6, 2);
    const fallMaterial = retroMaterial(
      new MeshLambertMaterial({ map: fallTexture, transparent: true, opacity: 0.6, side: DoubleSide, emissive: '#1a2f45', depthWrite: false }),
    );
    // Sheet falling from the upper bowl's rim into the basin.
    const sheet = new Mesh(new CylinderGeometry(1.3, 1.42, 1.6, 12, 1, true), fallMaterial);
    sheet.position.y = 1.43;
    // Thin stream from the gold finial into the upper bowl.
    const spout = new Mesh(new CylinderGeometry(0.06, 0.12, 0.55, 6, 1, true), fallMaterial);
    spout.position.y = 2.5;

    const ripples = Array.from({ length: RIPPLES }, () => {
      const m = new Mesh(
        new RingGeometry(0.9, 1, 16).rotateX(-Math.PI / 2),
        new MeshBasicMaterial({ color: '#cfe8f2', transparent: true, opacity: 0, depthWrite: false }),
      );
      m.position.y = 0.64;
      return m;
    });
    return { fallTexture, fallMaterial, sheet, spout, ripples };
  }, []);

  useEffect(
    () => () => {
      parts.fallTexture.dispose();
      parts.fallMaterial.dispose();
      parts.sheet.geometry.dispose();
      parts.spout.geometry.dispose();
      for (const r of parts.ripples) {
        r.geometry.dispose();
        (r.material as MeshBasicMaterial).dispose();
      }
    },
    [parts],
  );

  // The reward: golden water.
  useEffect(() => {
    const pool = getWorldMaterials().water;
    for (const m of [pool, parts.fallMaterial]) {
      m.color.set(golden ? GOLD : '#ffffff');
      m.emissive.set(golden ? '#7a5214' : '#1a2f45');
    }
  }, [golden, parts]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const pool = getWorldMaterials().water.map;
    if (pool) pool.offset.set(Math.sin(t * 0.2) * 0.05, t * 0.03);
    parts.fallTexture.offset.y = t * 0.9; // falling
    parts.ripples.forEach((r, i) => {
      const u = ((t * 0.35 + i / RIPPLES) % 1 + 1) % 1;
      const radius = 1.45 + u * 1.35;
      r.scale.set(radius, 1, radius);
      (r.material as MeshBasicMaterial).opacity = (1 - u) * 0.45;
    });
  });

  return (
    <>
      <primitive object={parts.sheet} />
      <primitive object={parts.spout} />
      {parts.ripples.map((r, i) => (
        <primitive key={i} object={r} />
      ))}
    </>
  );
}

import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, BufferAttribute, BufferGeometry, Points, PointsMaterial } from 'three';
import { seededRandom } from '../../lib/random.ts';
import { useGameStore } from '../../state/gameStore.ts';
import { BOUNDARY_HEDGES, GROVE_RING, WORLD } from '../world/layout.ts';
import { useEnvironment } from '../world/useGardenSettings.ts';

/**
 * Three kinds of drifting light, all cheap point sprites:
 *   motes      – pollen and dust in the sunset air, following the visitor
 *   fireflies  – blinking glows by hedges and the fountain, thickest in the
 *                hidden grove (a hint that something is there)
 *   gold dust  – slow-rising golden motes inside the EP sanctuary
 */
const MOTE_BOX = { x: 32, y: 7, z: 32 };

function makePoints(count: number, size: number) {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3));
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(count * 3), 3));
  const points = new Points(
    geometry,
    new PointsMaterial({ size, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, blending: AdditiveBlending }),
  );
  points.frustumCulled = false;
  return points;
}

export function AirParticles() {
  const amount = useEnvironment().particles;
  // Device quality times the Studio's particle amount, capped for phones.
  const scale = Math.min(2, useGameStore((s) => s.quality?.particleScale ?? 1) * amount);

  const systems = useMemo(() => {
    const rand = seededRandom('air');
    const moteCount = Math.round(220 * scale);
    const fireflyCount = amount <= 0 ? 0 : Math.max(12, Math.round(80 * scale));
    const dustCount = amount <= 0 ? 0 : Math.max(8, Math.round(40 * scale));

    const motes = makePoints(moteCount, 1);
    const moteSeeds = Float32Array.from({ length: moteCount * 4 }, () => rand());

    // Firefly anchors: 40% around the grove, the rest along hedges and the fountain.
    const fireflies = makePoints(fireflyCount, 2);
    const anchors: [number, number, number][] = [];
    for (let i = 0; i < fireflyCount; i++) {
      let x: number;
      let z: number;
      if (i < fireflyCount * 0.4) {
        const g = GROVE_RING[i % GROVE_RING.length]!.position;
        x = g[0] + (rand() - 0.5) * 2;
        z = g[1] + (rand() - 0.5) * 2;
      } else if (i < fireflyCount * 0.85) {
        const h = BOUNDARY_HEDGES[Math.floor(rand() * BOUNDARY_HEDGES.length)]!.position;
        x = h[0] * 0.95;
        z = h[1] * 0.95;
      } else {
        const a = rand() * Math.PI * 2;
        x = Math.sin(a) * (WORLD.fountainRadius + 0.6);
        z = Math.cos(a) * (WORLD.fountainRadius + 0.6);
      }
      anchors.push([x, 0.4 + rand() * 1.6, z]);
    }
    const fireflySeeds = Float32Array.from({ length: fireflyCount * 3 }, () => rand());

    const dust = makePoints(dustCount, 1);
    const dustSeeds = Float32Array.from({ length: dustCount * 3 }, () => rand());

    return { motes, moteSeeds, fireflies, anchors, fireflySeeds, dust, dustSeeds };
  }, [scale]);

  useEffect(
    () => () => {
      for (const p of [systems.motes, systems.fireflies, systems.dust]) {
        p.geometry.dispose();
        (p.material as PointsMaterial).dispose();
      }
    },
    [systems],
  );

  useFrame(({ camera, clock }) => {
    const t = clock.elapsedTime;

    // Motes: a field that wraps around the camera, so it seems infinite.
    {
      const pos = systems.motes.geometry.attributes.position!.array as Float32Array;
      const col = systems.motes.geometry.attributes.color!.array as Float32Array;
      const n = pos.length / 3;
      const wrap = (v: number, size: number) => ((((v % size) + size) % size) - size / 2);
      for (let i = 0; i < n; i++) {
        const s = systems.moteSeeds;
        const bx = s[i * 4]! * MOTE_BOX.x + t * 0.25 + Math.sin(t * 0.3 + i) * 0.4;
        const by = s[i * 4 + 1]! * MOTE_BOX.y + Math.sin(t * 0.5 + i * 1.3) * 0.3;
        const bz = s[i * 4 + 2]! * MOTE_BOX.z + t * 0.12;
        pos[i * 3] = camera.position.x + wrap(bx - camera.position.x, MOTE_BOX.x);
        pos[i * 3 + 1] = 0.3 + ((by % MOTE_BOX.y) + MOTE_BOX.y) % MOTE_BOX.y;
        pos[i * 3 + 2] = camera.position.z + wrap(bz - camera.position.z, MOTE_BOX.z);
        const twinkle = 0.25 + 0.2 * Math.sin(t * 1.7 + s[i * 4 + 3]! * 20);
        col[i * 3] = twinkle;
        col[i * 3 + 1] = twinkle * 0.8;
        col[i * 3 + 2] = twinkle * 0.55;
      }
      systems.motes.geometry.attributes.position!.needsUpdate = true;
      systems.motes.geometry.attributes.color!.needsUpdate = true;
    }

    // Fireflies: lazy loops around their anchor, blinking slowly.
    {
      const pos = systems.fireflies.geometry.attributes.position!.array as Float32Array;
      const col = systems.fireflies.geometry.attributes.color!.array as Float32Array;
      systems.anchors.forEach(([ax, ay, az], i) => {
        const s = systems.fireflySeeds;
        const speed = 0.3 + s[i * 3]! * 0.5;
        const phase = s[i * 3 + 1]! * 100;
        pos[i * 3] = ax + Math.sin(t * speed + phase) * 0.8;
        pos[i * 3 + 1] = ay + Math.sin(t * speed * 1.7 + phase) * 0.3;
        pos[i * 3 + 2] = az + Math.cos(t * speed * 0.8 + phase) * 0.8;
        const blink = Math.max(0, Math.sin(t * (0.8 + s[i * 3 + 2]!) + phase)) ** 6;
        col[i * 3] = blink * 0.9;
        col[i * 3 + 1] = blink;
        col[i * 3 + 2] = blink * 0.35;
      });
      systems.fireflies.geometry.attributes.position!.needsUpdate = true;
      systems.fireflies.geometry.attributes.color!.needsUpdate = true;
    }

    // Gold dust rising inside the sanctuary.
    {
      const pos = systems.dust.geometry.attributes.position!.array as Float32Array;
      const col = systems.dust.geometry.attributes.color!.array as Float32Array;
      const { center, width, depth } = WORLD.sanctuary;
      const n = pos.length / 3;
      for (let i = 0; i < n; i++) {
        const s = systems.dustSeeds;
        const rise = (s[i * 3 + 2]! * 3 + t * 0.15) % 3;
        pos[i * 3] = center[0] + (s[i * 3]! - 0.5) * (width - 1.5) + Math.sin(t * 0.4 + i) * 0.2;
        pos[i * 3 + 1] = 0.3 + rise;
        pos[i * 3 + 2] = center[1] + (s[i * 3 + 1]! - 0.5) * (depth - 1.5);
        const fade = Math.sin((rise / 3) * Math.PI);
        col[i * 3] = fade * 0.9;
        col[i * 3 + 1] = fade * 0.72;
        col[i * 3 + 2] = fade * 0.3;
      }
      systems.dust.geometry.attributes.position!.needsUpdate = true;
      systems.dust.geometry.attributes.color!.needsUpdate = true;
    }
  });

  return (
    <>
      <primitive object={systems.motes} />
      <primitive object={systems.fireflies} />
      <primitive object={systems.dust} />
    </>
  );
}

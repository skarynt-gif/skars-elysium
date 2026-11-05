import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Points,
  PointsMaterial,
} from 'three';
import { seededRandom } from '../../lib/random.ts';
import { useGameStore } from '../../state/gameStore.ts';
import { paintTexture } from '../world/textures.ts';
import { headHeight } from './flowerHeights.ts';
import { flowerBursts, flowerIndex, now } from './flowerIndex.ts';

const MAX_PARTICLES = 160;
const BURST_COUNT = 30;

/**
 * Golden pixel particles: a burst when a flower is selected, and a slow
 * trickle of sparkles plus a glowing halo above the flower that's playing.
 */
export function FlowerEffects() {
  const fx = useMemo(() => {
    const positions = new Float32Array(MAX_PARTICLES * 3);
    const colors = new Float32Array(MAX_PARTICLES * 3);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('color', new BufferAttribute(colors, 3));
    const points = new Points(
      geometry,
      new PointsMaterial({
        size: 2, // in low-res retro pixels: chunky sparks
        sizeAttenuation: false,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    );
    points.frustumCulled = false;

    const halo = new Mesh(
      new PlaneGeometry(1, 1),
      new MeshBasicMaterial({ map: paintTexture('glow'), transparent: true, depthWrite: false, blending: AdditiveBlending }),
    );
    halo.visible = false;

    return {
      points,
      halo,
      positions,
      colors,
      velocity: new Float32Array(MAX_PARTICLES * 3),
      life: new Float32Array(MAX_PARTICLES), // seconds remaining
      maxLife: new Float32Array(MAX_PARTICLES),
      next: 0,
      lastSparkle: 0,
      rand: seededRandom('sparkles'),
    };
  }, []);

  const spawn = (x: number, y: number, z: number, speed: number, life: number) => {
    const i = fx.next;
    fx.next = (fx.next + 1) % MAX_PARTICLES;
    const r = fx.rand;
    const angle = r() * Math.PI * 2;
    const out = r() * speed;
    fx.positions.set([x, y, z], i * 3);
    fx.velocity.set([Math.cos(angle) * out, 0.6 + r() * speed * 1.4, Math.sin(angle) * out], i * 3);
    fx.life[i] = life * (0.6 + r() * 0.4);
    fx.maxLife[i] = fx.life[i]!;
  };

  useEffect(
    () =>
      flowerBursts.on(({ x, y, z }) => {
        for (let n = 0; n < BURST_COUNT; n++) spawn(x, y, z, 1.6, 1.6);
      }),
    [],
  );

  useEffect(
    () => () => {
      fx.points.geometry.dispose();
      (fx.points.material as PointsMaterial).dispose();
      fx.halo.geometry.dispose();
      (fx.halo.material as MeshBasicMaterial).map?.dispose();
      (fx.halo.material as MeshBasicMaterial).dispose();
    },
    [fx],
  );

  useFrame(({ camera }, delta) => {
    const dt = Math.min(delta, 0.1);
    const t = now();

    // Halo + sparkles over the playing flower.
    const { currentSongId } = useGameStore.getState();
    const playing = currentSongId ? flowerIndex.plantings.find((p) => p.song.id === currentSongId) : undefined;
    if (playing) {
      const y = headHeight(playing.species, playing.plinth) * playing.variant.heightScale;
      fx.halo.visible = true;
      fx.halo.position.set(playing.position[0], y + 0.05, playing.position[1]);
      fx.halo.quaternion.copy(camera.quaternion);
      fx.halo.scale.setScalar(0.9 + Math.sin(t * 3) * 0.12);
      if (t - fx.lastSparkle > 0.22) {
        fx.lastSparkle = t;
        spawn(playing.position[0], y, playing.position[1], 0.35, 2.2);
      }
    } else {
      fx.halo.visible = false;
    }

    // Particles float up, drift, slow down and fade (additive: fading to black = fading out).
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const life = fx.life[i]!;
      if (life <= 0) {
        fx.colors.set([0, 0, 0], i * 3);
        continue;
      }
      const remaining = Math.max(0, life - dt);
      fx.life[i] = remaining;
      const k = i * 3;
      fx.velocity[k] = fx.velocity[k]! * (1 - dt * 1.5);
      fx.velocity[k + 1] = fx.velocity[k + 1]! * (1 - dt * 1.2);
      fx.velocity[k + 2] = fx.velocity[k + 2]! * (1 - dt * 1.5);
      fx.positions[k] = fx.positions[k]! + fx.velocity[k]! * dt;
      fx.positions[k + 1] = fx.positions[k + 1]! + fx.velocity[k + 1]! * dt;
      fx.positions[k + 2] = fx.positions[k + 2]! + fx.velocity[k + 2]! * dt;
      const fade = remaining / (fx.maxLife[i] || 1);
      // Gold, flickering on alternate frames as it dies, like old sprite effects.
      const flicker = fade < 0.3 && Math.floor(t * 20 + i) % 2 === 0 ? 0.3 : 1;
      fx.colors.set([1 * fade * flicker, 0.82 * fade * flicker, 0.45 * fade * flicker], k);
    }
    fx.points.geometry.attributes.position!.needsUpdate = true;
    fx.points.geometry.attributes.color!.needsUpdate = true;
  });

  return (
    <>
      <primitive object={fx.points} />
      <primitive object={fx.halo} />
    </>
  );
}

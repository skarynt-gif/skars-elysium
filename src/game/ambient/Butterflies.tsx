import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, DoubleSide, Euler, InstancedMesh, Matrix4, MeshLambertMaterial, PlaneGeometry, Quaternion, Vector3 } from 'three';
import { seededRandom } from '../../lib/random.ts';
import { useGameStore } from '../../state/gameStore.ts';
import { flowerIndex } from '../flowers/flowerIndex.ts';
import { headHeight } from '../flowers/flowerHeights.ts';
import { playerPose } from '../player/playerPose.ts';
import { retroMaterial } from '../render/retroMaterial.ts';
import { PLOTS, SANCTUARY_PLOTS, WORLD, type Vec2 } from '../world/layout.ts';
import { paintTexture } from '../world/textures.ts';
import { useEnvironment } from '../world/useGardenSettings.ts';
import { createButterfly, stepButterfly, type Butterfly, type Vec3 } from './butterflies.ts';

const WING_COLORS = ['#ff9a4d', '#ff6f91', '#ffd27a', '#8fb8ff', '#d8a0ff', '#fff3c4'];
const BASE_COUNT = 16;

/** Pixel butterflies: two flapping wings each, drawn as two instanced batches. */
export function Butterflies() {
  const particleScale = useGameStore((s) => s.quality?.particleScale ?? 1);
  const amount = useEnvironment().butterflies;
  // At least a few on any device, unless the Studio turned them off.
  const count = amount <= 0 ? 0 : Math.max(Math.min(4, Math.round(4 * amount)), Math.round(BASE_COUNT * particleScale * amount));

  const flock = useMemo(() => {
    const rand = seededRandom('butterflies');
    const homes: Vec2[] = [...PLOTS.map((p) => p.center), ...SANCTUARY_PLOTS.map((p) => p.center), WORLD.grove.center, [0, 10]];
    const butterflies: Butterfly[] = Array.from({ length: count }, (_, i) => createButterfly(homes[i % homes.length]!, rand));

    // Each wing is a small plane hinged at the body (x = 0).
    const wing = new PlaneGeometry(0.13, 0.12).rotateX(-Math.PI / 2).translate(0.065, 0, 0);
    const material = retroMaterial(
      new MeshLambertMaterial({ map: paintTexture('butterflyWing'), alphaTest: 0.5, side: DoubleSide, emissive: '#2a1010' }),
    );
    const left = new InstancedMesh(wing, material, count);
    const right = new InstancedMesh(wing, material, count);
    left.frustumCulled = false;
    right.frustumCulled = false;
    butterflies.forEach((_, i) => {
      const color = new Color(WING_COLORS[i % WING_COLORS.length]);
      left.setColorAt(i, color);
      right.setColorAt(i, color);
    });
    return { butterflies, left, right, wing, material, rand };
  }, [count]);

  useEffect(
    () => () => {
      flock.left.dispose();
      flock.right.dispose();
      flock.wing.dispose();
      flock.material.map?.dispose();
      flock.material.dispose();
    },
    [flock],
  );

  const tmp = useMemo(
    () => ({ m: new Matrix4(), wingM: new Matrix4(), q: new Quaternion(), e: new Euler(), p: new Vector3(), s: new Vector3(1, 1, 1) }),
    [],
  );

  useFrame((_, delta) => {
    const perches: Vec3[] = flowerIndex.plantings.map((f) => [f.position[0], headHeight(f.species, f.plinth) * f.variant.heightScale, f.position[1]]);
    const player = playerPose.active ? playerPose.position : null;

    flock.butterflies.forEach((b, i) => {
      const next = stepButterfly(b, delta, flock.rand, player, perches);
      flock.butterflies[i] = next;
      const heading = Math.atan2(next.velocity[0], next.velocity[2]);
      // Resting wings rise and hold; flying wings beat fast.
      const beat = next.rest > 0 ? 1.1 + Math.sin(next.flap) * 0.15 : Math.sin(next.flap) * 0.9;
      tmp.p.set(...next.position);
      tmp.q.setFromEuler(tmp.e.set(0, next.rest > 0 ? b.flap * 0.05 : heading, 0));
      tmp.m.compose(tmp.p, tmp.q, tmp.s);
      flock.right.setMatrixAt(i, tmp.wingM.makeRotationZ(beat).premultiply(tmp.m));
      // Left wing: mirrored across the body.
      flock.left.setMatrixAt(i, tmp.wingM.makeRotationZ(Math.PI - beat).premultiply(tmp.m));
    });
    flock.left.instanceMatrix.needsUpdate = true;
    flock.right.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <primitive object={flock.left} />
      <primitive object={flock.right} />
    </>
  );
}

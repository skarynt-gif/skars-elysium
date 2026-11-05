import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { ConeGeometry, Group, Mesh, TorusGeometry } from 'three';
import { getAmbient } from '../../audio/ambient/AmbientController.tsx';
import { useGameStore } from '../../state/gameStore.ts';
import { flowerBursts } from '../flowers/flowerIndex.ts';
import { playerPose } from '../player/playerPose.ts';
import { merge, place } from '../world/geometries.ts';
import { getWorldMaterials } from '../world/materials.ts';
import { COLLECTIBLES, allFound, collectibleInReach, loadFound, saveFound } from './collectibles.ts';

/** A small golden laurel wreath: a ring with leaves around it. */
function wreathGeometry() {
  const leaves = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    return place(new ConeGeometry(0.035, 0.1, 3), { rotate: [0, 0, -Math.PI / 2 + 0.6] })
      .rotateZ(a)
      .translate(Math.cos(a) * 0.2, Math.sin(a) * 0.2, 0);
  });
  return merge([place(new TorusGeometry(0.19, 0.022, 4, 12), {}), ...leaves]);
}

/**
 * Hidden golden laurels. Walk into one to collect it: a chime, a burst of
 * gold and a counter. Finding them all turns the fountain to gold.
 */
export function Collectibles() {
  const scene = useMemo(() => {
    const geometry = wreathGeometry();
    const group = new Group();
    const meshes = COLLECTIBLES.map((c) => {
      const mesh = new Mesh(geometry, getWorldMaterials().gold);
      mesh.position.set(c.position[0], c.height, c.position[1]);
      group.add(mesh);
      return mesh;
    });
    return { geometry, group, meshes };
  }, []);

  // Restore progress from earlier visits.
  useEffect(() => {
    const saved = loadFound();
    useGameStore.getState().setLaurels([...saved], allFound(saved));
  }, []);

  useEffect(() => () => scene.geometry.dispose(), [scene]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const foundSet = new Set(useGameStore.getState().laurelsFound);
    COLLECTIBLES.forEach((c, i) => {
      const mesh = scene.meshes[i]!;
      mesh.visible = !foundSet.has(c.id);
      mesh.rotation.y = t * 1.6 + i;
      mesh.position.y = c.height + Math.sin(t * 2 + i) * 0.08;
    });

    if (!playerPose.active || useGameStore.getState().phase !== 'exploring') return;
    const hit = collectibleInReach(playerPose.position, foundSet);
    if (!hit) return;

    foundSet.add(hit.id);
    saveFound(foundSet);
    const complete = allFound(foundSet);
    const store = useGameStore.getState();
    store.setLaurels([...foundSet], complete);
    flowerBursts.emit({ x: hit.position[0], y: hit.height, z: hit.position[1] });
    getAmbient()?.pickup(complete);
    if (complete) {
      store.announce('★ ALL LAURELS FOUND ★', 'THE FOUNTAIN RUNS GOLD');
    } else {
      store.announce('LAUREL FOUND', `${foundSet.size} / ${COLLECTIBLES.length}`);
    }
  });

  return <primitive object={scene.group} />;
}

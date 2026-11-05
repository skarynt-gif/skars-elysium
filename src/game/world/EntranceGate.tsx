import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { useGameStore } from '../../state/gameStore.ts';
import { introClock } from '../intro/introClock.ts';
import { INTRO, gateOpenAmount } from '../intro/introTimeline.ts';
import { WORLD } from './layout.ts';
import { getWorldMaterials } from './materials.ts';
import { getWorldGeometries } from './worldGeometries.ts';

/**
 * Bronze double gate between two marble pillars. Closed on the title screen,
 * swings inward during the intro, and stays open afterwards.
 */
export function EntranceGate() {
  const materials = getWorldMaterials();
  const geometries = getWorldGeometries();
  const left = useRef<Group>(null);
  const right = useRef<Group>(null);

  useFrame(() => {
    const phase = useGameStore.getState().phase;
    const open =
      phase === 'entering' ? gateOpenAmount(introClock.elapsed) : phase === 'booting' || phase === 'title' ? 0 : 1;
    const angle = open * INTRO.gateOpenAngle;
    if (left.current) left.current.rotation.y = angle;
    if (right.current) right.current.rotation.y = -angle;
  });

  const { z, pillarX } = WORLD.gate;
  const hingeX = pillarX - 0.45;

  return (
    <group position={[0, 0, z]}>
      {[-pillarX, pillarX].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh geometry={geometries.gatePillar} material={materials.marbleStone} />
          <mesh geometry={geometries.gateUrn} material={materials.gold} />
        </group>
      ))}
      {/* Left leaf: hinge on the left pillar, extends toward the center. */}
      <group ref={left} position={[-hingeX, 0, 0]}>
        <mesh geometry={geometries.gateBars} material={materials.bronze} />
        <mesh geometry={geometries.gateFinials} material={materials.gold} />
      </group>
      {/* Right leaf: mirrored (Three.js corrects face winding for negative scale). */}
      <group ref={right} position={[hingeX, 0, 0]}>
        <group scale={[-1, 1, 1]}>
          <mesh geometry={geometries.gateBars} material={materials.bronze} />
          <mesh geometry={geometries.gateFinials} material={materials.gold} />
        </group>
      </group>
    </group>
  );
}

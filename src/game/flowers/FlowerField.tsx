import { useEffect, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  Color,
  Euler,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  Quaternion,
  SphereGeometry,
  Vector3,
  type Material,
} from 'three';
import { useGameStore } from '../../state/gameStore.ts';
import { registerPickable } from '../interaction/pickables.ts';
import { assignBeds } from '../world/layout.ts';
import { getWorldMaterials } from '../world/materials.ts';
import { buildFlower, plinthGeometry, type FlowerParts } from './flowerGeometries.ts';
import { headHeight } from './flowerHeights.ts';
import { flowerBursts, flowerIndex, flowerPickId, now, selectFlower, setPlantings } from './flowerIndex.ts';
import { getFlowerMaterials } from './flowerMaterials.ts';
import { flowerPalette } from './flowerPalette.ts';
import { FLOWER_STYLES, PLINTH_HEIGHT, speciesMotion, windAt } from './flowerStyle.ts';
import { plantGarden, type Planting, type VisualSpecies } from './planting.ts';
import { FlowerEffects } from './FlowerEffects.tsx';
import { displayTitle } from '../../content/flowerRules.ts';
import { nextReleaseAt, releaseTimerDelay } from '../../content/releases.ts';
import type { Manifest } from '../../content/types.ts';
import { playerPose } from '../player/playerPose.ts';
import { celebrations, markCelebrated, onReplanted, unfoldTransform } from './celebrations.ts';

/** A celebration starts once the visitor is this close to the newly bloomed flower. */
const CELEBRATE_RANGE = 16;

/**
 * Re-plants the garden at each release moment, so buds bloom in front of
 * visitors without a reload. Returns a timestamp that changes at each moment.
 */
function useReleaseClock(manifest: Manifest | null): number {
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    if (!manifest) return;
    const delay = releaseTimerDelay(nextReleaseAt(manifest, Date.now()), Date.now());
    if (delay === null) return;
    const timer = window.setTimeout(() => setTick(Date.now()), delay);
    return () => window.clearTimeout(timer);
  }, [manifest, tick]);
  return tick;
}

/** Flowers can be selected by clicking/tapping from this far away. */
const FLOWER_REACH = 7;
const STEM_COLOR = new Color('#4f7a3a');

interface FlowerGroup {
  species: VisualSpecies;
  plinth: boolean;
  members: number[];
  parts: FlowerParts;
  meshes: { stem: InstancedMesh; head: InstancedMesh; core: InstancedMesh };
  headBase: Color[];
  /** Per flower: rainbow palette cycling on (spirals without a custom color). */
  cycle: boolean[];
}

const geometryCache = new Map<string, FlowerParts>();
function partsFor(species: VisualSpecies, plinth: boolean): FlowerParts {
  const key = `${species}|${plinth}`;
  let parts = geometryCache.get(key);
  if (!parts) {
    parts = buildFlower(species, plinth);
    geometryCache.set(key, parts);
  }
  return parts;
}

function buildGroups(plantings: Planting[]): FlowerGroup[] {
  const materials = getFlowerMaterials();
  const byKey = new Map<string, number[]>();
  plantings.forEach((p, i) => {
    const key = `${p.species}|${p.plinth}`;
    byKey.set(key, [...(byKey.get(key) ?? []), i]);
  });

  return [...byKey.entries()].map(([key, members]) => {
    const [species, plinthFlag] = key.split('|') as [VisualSpecies, string];
    const plinth = plinthFlag === 'true';
    const style = FLOWER_STYLES[species];
    const parts = partsFor(species, plinth);
    const headMaterial: Material = style.ghost ? materials.ghost : species === 'bud' ? materials.bud : materials.petal;
    const coreMaterial: Material = style.ghost ? materials.ghost : materials.core;
    const make = (geometry: FlowerParts['stem'], material: Material) => {
      const mesh = new InstancedMesh(geometry, material, members.length);
      mesh.frustumCulled = false; // flowers move every frame; bounds are cheap to skip at this count
      return mesh;
    };
    const meshes = {
      stem: make(parts.stem, materials.stem),
      head: make(parts.head, headMaterial),
      core: make(parts.core, coreMaterial),
    };
    const headBase: Color[] = [];
    const cycle: boolean[] = [];
    members.forEach((idx, k) => {
      const p = plantings[idx]!;
      const palette = flowerPalette(p.species, p.variant.hueShift, p.song.flower);
      const head = new Color(palette.petal).offsetHSL(palette.shift / 360, 0, 0);
      headBase.push(head);
      cycle.push(palette.cycle);
      meshes.head.setColorAt(k, head);
      meshes.core.setColorAt(k, new Color(palette.core));
      meshes.stem.setColorAt(k, STEM_COLOR.clone().offsetHSL(p.variant.hueShift / 720, 0, (p.variant.lean * 0.3)));
    });
    return { species, plinth, members, parts, meshes, headBase, cycle };
  });
}

/**
 * Every song's flower, drawn in batches (one draw call per flower part per
 * species), swaying in a shared wind with each species' own character.
 */
export function FlowerField() {
  const content = useGameStore((s) => s.content);
  const manifest = content.status === 'ready' ? content.manifest : null;
  const releaseTick = useReleaseClock(manifest);
  const plantings = useMemo(() => {
    if (!manifest) return [];
    return plantGarden(manifest, assignBeds(manifest.collections), releaseTick);
  }, [manifest, releaseTick]);

  // Queue bloom celebrations for buds this visitor has seen (now or on earlier visits).
  useEffect(() => {
    if (plantings.length) onReplanted(plantings);
  }, [plantings]);

  const groups = useMemo(() => buildGroups(plantings), [plantings]);

  // Invisible hit targets so flowers can be clicked or tapped.
  const hitGroup = useMemo(() => {
    const group = new Group();
    const sphere = new SphereGeometry(0.34, 6, 4);
    for (const p of plantings) {
      const hit = new Mesh(sphere);
      hit.visible = false;
      hit.position.set(p.position[0], headHeight(p.species, p.plinth) * p.variant.heightScale - 0.1, p.position[1]);
      hit.userData.songId = p.song.id;
      group.add(hit);
    }
    return group;
  }, [plantings]);

  // Plinths under singles (static).
  const plinths = useMemo(() => {
    const singles = plantings.filter((p) => p.plinth);
    const mesh = new InstancedMesh(plinthGeometry(), getWorldMaterials().marbleStone, Math.max(1, singles.length));
    mesh.count = singles.length;
    const m = new Matrix4();
    singles.forEach((p, i) => mesh.setMatrixAt(i, m.makeTranslation(p.position[0], 0, p.position[1])));
    mesh.computeBoundingSphere();
    return mesh;
  }, [plantings]);

  const outline = useMemo(() => {
    const mesh = new Mesh(groups[0]?.parts.head, getFlowerMaterials().outline);
    mesh.matrixAutoUpdate = false;
    mesh.visible = false;
    return mesh;
  }, [groups]);

  useEffect(() => {
    setPlantings(plantings);
    const offs = plantings.map((p, i) =>
      registerPickable({
        id: flowerPickId(p.song.id),
        kind: 'flower',
        object: hitGroup.children[i]!,
        label: displayTitle(p.song, p.state),
        maxDistance: FLOWER_REACH,
        onSelect: () => selectFlower(p),
      }),
    );
    return () => offs.forEach((off) => off());
  }, [plantings, hitGroup]);

  useEffect(
    () => () => {
      for (const g of groups) Object.values(g.meshes).forEach((m) => m.dispose());
      plinths.geometry.dispose();
      plinths.dispose();
    },
    [groups, plinths],
  );

  const tmp = useMemo(
    () => ({
      m: new Matrix4(),
      pivot: new Matrix4(),
      unpivot: new Matrix4(),
      outlineScale: new Matrix4(),
      q: new Quaternion(),
      e: new Euler(),
      pos: new Vector3(),
      scale: new Vector3(),
      color: new Color(),
      white: new Color('#ffffff'),
      gold: new Color('#ffd27a'),
    }),
    [],
  );

  useFrame(() => {
    const t = now();
    const { focus, currentSongId } = useGameStore.getState();
    let outlineShown = false;

    // Start any waiting bloom celebration once the visitor is near it.
    if (celebrations.pending.size && playerPose.active) {
      for (const p of plantings) {
        if (!celebrations.pending.has(p.song.id)) continue;
        const d = Math.hypot(p.position[0] - playerPose.position[0], p.position[1] - playerPose.position[1]);
        if (d > CELEBRATE_RANGE) continue;
        celebrations.pending.delete(p.song.id);
        celebrations.started.set(p.song.id, t);
        markCelebrated(p.song.id);
        const y = headHeight(p.species, p.plinth) * p.variant.heightScale;
        flowerBursts.emit({ x: p.position[0], y, z: p.position[1] });
        window.setTimeout(() => flowerBursts.emit({ x: p.position[0], y: y + 0.2, z: p.position[1] }), 700);
        useGameStore.getState().announce('★ NEW RELEASE ★', `${p.song.title.toUpperCase()} HAS BLOOMED`);
      }
    }

    for (const group of groups) {
      const style = FLOWER_STYLES[group.species];
      const pivotY = group.plinth ? PLINTH_HEIGHT : 0;

      group.members.forEach((idx, k) => {
        const p = plantings[idx]!;
        const seed = (p.variant.hueShift + 20) * 0.37 + k;
        const [wx, wz] = windAt(p.position[0], p.position[1], t);
        const [mx, mz, motionScale] = speciesMotion(style.motion, t, seed);

        // Selection: a quick bloom-pop and full spin.
        let pop = 1;
        let spin = 0;
        const selected = flowerIndex.selectedAt.get(p.song.id);
        if (selected !== undefined) {
          const u = (t - selected) / 0.8;
          if (u < 1) {
            pop = 1 + 0.4 * Math.sin(Math.PI * Math.min(1, u * 1.4));
            spin = Math.PI * 2 * (1 - (1 - u) ** 3);
          }
        }
        const playing = p.song.id === currentSongId;
        const focused = focus?.id === flowerPickId(p.song.id);
        const breathe = playing ? 1 + Math.sin(t * 3) * 0.04 : 1;
        const unfold = unfoldTransform(celebrations.started.get(p.song.id), t);
        const s = p.variant.heightScale * motionScale * pop * breathe * unfold.scale * (focused ? 1.08 : 1);

        tmp.e.set(p.variant.lean * 0.6 + wx * style.sway + mx, p.rotationY + spin + unfold.spin, wz * style.sway + mz, 'YXZ');
        tmp.q.setFromEuler(tmp.e);
        tmp.pos.set(p.position[0], pivotY, p.position[1]);
        tmp.scale.set(s, s, s);
        // Rotate/scale about the top of the plinth (or the ground), not the world origin.
        tmp.m.compose(tmp.pos, tmp.q, tmp.scale).multiply(tmp.unpivot.makeTranslation(0, -pivotY, 0));
        group.meshes.stem.setMatrixAt(k, tmp.m);
        group.meshes.head.setMatrixAt(k, tmp.m);
        group.meshes.core.setMatrixAt(k, tmp.m);

        // Color: rainbow cycling for psychedelic flowers; brighter when focused or playing.
        tmp.color.copy(group.headBase[k]!);
        if (group.cycle[k]) tmp.color.offsetHSL((t * 0.08 + k * 0.13) % 1, 0, 0);
        if (playing) tmp.color.lerp(tmp.gold, 0.15 + Math.sin(t * 3) * 0.1);
        if (focused) tmp.color.lerp(tmp.white, 0.3);
        group.meshes.head.setColorAt(k, tmp.color);

        if (focused && !outlineShown) {
          // Outline: the head again, slightly larger, drawn back-faces-only in gold.
          const h = (headHeight(group.species, group.plinth) - 0.06) * 1;
          tmp.outlineScale
            .makeTranslation(0, h, 0)
            .multiply(tmp.pivot.makeScale(1.18, 1.18, 1.18))
            .multiply(tmp.unpivot.makeTranslation(0, -h, 0));
          outline.geometry = group.parts.head;
          outline.matrix.copy(tmp.m).multiply(tmp.outlineScale);
          outline.matrixWorldNeedsUpdate = true;
          outlineShown = true;
        }
      });

      group.meshes.stem.instanceMatrix.needsUpdate = true;
      group.meshes.head.instanceMatrix.needsUpdate = true;
      group.meshes.core.instanceMatrix.needsUpdate = true;
      if (group.meshes.head.instanceColor) group.meshes.head.instanceColor.needsUpdate = true;
    }
    outline.visible = outlineShown;
  });

  return (
    <>
      {groups.map((g) => (
        <group key={`${g.species}|${g.plinth}`}>
          <primitive object={g.meshes.stem} />
          <primitive object={g.meshes.head} />
          <primitive object={g.meshes.core} />
        </group>
      ))}
      <primitive object={plinths} />
      <primitive object={hitGroup} />
      <primitive object={outline} />
      <FlowerEffects />
    </>
  );
}

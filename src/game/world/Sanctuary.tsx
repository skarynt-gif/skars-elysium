import { useEffect, useMemo, useState } from 'react';
import { BoxGeometry, MeshLambertMaterial, PlaneGeometry } from 'three';
import { retroMaterial } from '../render/retroMaterial.ts';
import { createSignTexture, pixelFontReady } from './signTexture.ts';
import { merge, planarUV, wallGeometry, groundStrip, bedCurbGeometry, bedSoilGeometry } from './geometries.ts';
import { SANCTUARY_BED, SANCTUARY_PLOTS, WORLD, type Vec2 } from './layout.ts';
import { getWorldMaterials } from './materials.ts';

/**
 * The Upcoming EP Garden: a walled marble sanctuary north of the plaza with
 * a gilded gateway and three golden beds.
 */
export function Sanctuary({ epTitle }: { epTitle: string | null }) {
  const materials = getWorldMaterials();

  const parts = useMemo(() => {
    const { center, width, depth, gateWidth, wallThickness } = WORLD.sanctuary;
    const [cx, cz] = center;
    const x0 = cx - width / 2;
    const x1 = cx + width / 2;
    const zN = cz - depth / 2;
    const zS = cz + depth / 2;
    const h = 2.7;
    const walls: [Vec2, Vec2][] = [
      [[x0, zN], [x1, zN]],
      [[x0, zN], [x0, zS]],
      [[x1, zN], [x1, zS]],
      [[x0, zS], [cx - gateWidth / 2, zS]],
      [[cx + gateWidth / 2, zS], [x1, zS]],
    ];
    const stone = merge(walls.map(([a, b]) => wallGeometry(a as [number, number], b as [number, number], h, wallThickness)));
    const trim = merge(
      walls.map(([a, b]) => {
        const g = wallGeometry(a as [number, number], b as [number, number], 0.18, wallThickness + 0.12);
        g.translate(0, h, 0);
        return g;
      }),
    );

    // Gilded gateway: two posts and a lintel.
    const gx = gateWidth / 2 + 0.2;
    const post = (x: number) => {
      const g = new BoxGeometry(0.45, 3.5, 0.75);
      g.translate(cx + x, 1.75, zS);
      return g;
    };
    const lintel = new BoxGeometry(gateWidth + 1.3, 0.4, 0.85);
    lintel.translate(cx, 3.6, zS);
    const gateway = merge([post(-gx), post(gx), lintel]);

    const floor = planarUV(groundStrip([cx, zS - 0.2], [cx, zN + 0.2], width - 0.4, 0.02), 2.4);

    const beds = SANCTUARY_PLOTS.map((p) => {
      const curb = bedCurbGeometry(SANCTUARY_BED.width, SANCTUARY_BED.depth);
      curb.translate(p.center[0], 0, p.center[1]);
      const soil = bedSoilGeometry(SANCTUARY_BED.width, SANCTUARY_BED.depth);
      soil.translate(p.center[0], 0, p.center[1]);
      return { curb, soil };
    });

    return {
      stone,
      trim,
      gateway,
      floor,
      curbs: merge(beds.map((b) => b.curb)),
      soil: merge(beds.map((b) => b.soil)),
    };
  }, []);

  return (
    <>
      <mesh geometry={parts.floor} material={materials.marbleTiles} />
      <mesh geometry={parts.stone} material={materials.marbleStone} />
      <mesh geometry={parts.trim} material={materials.bronze} />
      <mesh geometry={parts.gateway} material={materials.gold} />
      <mesh geometry={parts.curbs} material={materials.gold} />
      <mesh geometry={parts.soil} material={materials.soil} />
      <GatewayPlaque title={epTitle ? `${epTitle} - COMING SOON` : 'THE UPCOMING GARDEN'} />
    </>
  );
}

/** Gilded plaque on the gateway lintel naming the upcoming EP. */
function GatewayPlaque({ title }: { title: string }) {
  const [fontReady, setFontReady] = useState(false);
  useEffect(() => {
    let alive = true;
    void pixelFontReady().then(() => alive && setFontReady(true));
    return () => {
      alive = false;
    };
  }, []);
  const material = useMemo(
    () => retroMaterial(new MeshLambertMaterial({ map: createSignTexture(title), emissive: '#3a2410' })),
    [title, fontReady],
  );
  const geometry = useMemo(() => new PlaneGeometry(3.6, 0.9), []);
  useEffect(
    () => () => {
      material.map?.dispose();
      material.dispose();
    },
    [material],
  );
  const { center, depth } = WORLD.sanctuary;
  // Front face of the lintel, facing the plaza (south, +z).
  return <mesh geometry={geometry} material={material} position={[center[0], 3.6, center[1] + depth / 2 + 0.44]} />;
}

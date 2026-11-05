import { useEffect, useMemo } from 'react';
import { BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Mesh, MeshBasicMaterial } from 'three';
import { GAME_CONFIG } from '../../config/gameConfig.ts';
import { retroMaterial } from '../render/retroMaterial.ts';
import { MOUNTAIN_LAYERS, SUN, mountainProfile, type MountainLayer } from './atmosphere.ts';
import { skyPalette } from './environment.ts';
import { useEnvironment } from './useGardenSettings.ts';

const SEGMENTS = 96;

/**
 * Three rings of flat mountain silhouettes, like the layered backdrops of
 * 90s adventure games. Each ring fades to fog color at its base, and slopes
 * facing the sun pick up a warm rim.
 */
function buildLayer(layer: MountainLayer, fog: string, horizon: string): Mesh {
  const heights = mountainProfile(layer, SEGMENTS);
  const base = new Color(fog);
  const body = new Color(layer.color);
  const rim = new Color(horizon);
  const sunAz = (SUN.azimuthDeg * Math.PI) / 180;

  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= SEGMENTS; i++) {
    const theta = (i / SEGMENTS) * Math.PI * 2;
    const x = Math.sin(theta) * layer.radius;
    const z = -Math.cos(theta) * layer.radius;
    // How directly this part of the ring faces the setting sun (0..1).
    const facing = Math.max(0, Math.cos(theta - sunAz));
    const top = body.clone().lerp(rim, facing * facing * 0.35);

    positions.push(x, -8, z, x, heights[i]!, z);
    colors.push(base.r, base.g, base.b, top.r, top.g, top.b);
    if (i < SEGMENTS) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();

  const material = retroMaterial(new MeshBasicMaterial({ vertexColors: true, fog: false, side: DoubleSide }));
  const mesh = new Mesh(geometry, material);
  mesh.renderOrder = -9;
  return mesh;
}

export function Mountains() {
  const warmth = useEnvironment().skyWarmth;
  const layers = useMemo(() => {
    const p = skyPalette(GAME_CONFIG.palette, warmth);
    return MOUNTAIN_LAYERS.map((layer) => buildLayer(layer, p.fog, p.skyHorizon));
  }, [warmth]);
  useEffect(
    () => () =>
      layers.forEach((m) => {
        m.geometry.dispose();
        (m.material as MeshBasicMaterial).dispose();
      }),
    [layers],
  );
  return (
    <>
      {layers.map((mesh, i) => (
        <primitive key={i} object={mesh} />
      ))}
    </>
  );
}

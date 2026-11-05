import { DoubleSide, MeshBasicMaterial, MeshLambertMaterial } from 'three';
import { retroMaterial } from '../render/retroMaterial.ts';
import { paintTexture } from './textures.ts';

/**
 * One shared set of retro materials for the whole world. Created on first
 * use and kept for the life of the page (the garden never unloads), so every
 * column, tree and path shares GPU resources.
 */
function build() {
  const lambert = (texture: Parameters<typeof paintTexture>[0], extra: ConstructorParameters<typeof MeshLambertMaterial>[0] = {}) =>
    retroMaterial(new MeshLambertMaterial({ map: paintTexture(texture), ...extra }));

  return {
    grass: lambert('grass'),
    marbleTiles: lambert('marbleTiles'),
    marbleStone: lambert('marbleStone', { flatShading: true }),
    /** For turned shapes (fountain bowls, urns) seen from inside and out. */
    marbleStoneDouble: lambert('marbleStone', { flatShading: true, side: DoubleSide }),
    hedge: lambert('hedge', { flatShading: true }),
    cypress: lambert('cypress', { flatShading: true }),
    olive: lambert('olive', { flatShading: true }),
    bark: lambert('bark', { flatShading: true }),
    soil: lambert('soil'),
    bronze: lambert('bronze', { flatShading: true }),
    // A faint self-glow keeps gold readable as "precious" in the dusk light.
    gold: lambert('gold', { flatShading: true, emissive: '#5a3a10' }),
    // Navigation arrow inlays: brighter gold that pulses (intensity animated each frame).
    arrowGlow: lambert('gold', { flatShading: true, emissive: '#ffb347', emissiveIntensity: 0.5 }),
    arrowGlowFocused: lambert('gold', { flatShading: true, emissive: '#fff0a8', emissiveIntensity: 1 }),
    water: lambert('water', { transparent: true, opacity: 0.85, emissive: '#1a2f45' }),
    grassTuft: lambert('grassTuft', { alphaTest: 0.5, side: DoubleSide }),
    blobShadow: retroMaterial(
      new MeshBasicMaterial({
        map: paintTexture('blobShadow'),
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    ),
  };
}

export type WorldMaterials = ReturnType<typeof build>;

let cache: WorldMaterials | null = null;
export function getWorldMaterials(): WorldMaterials {
  cache ??= build();
  return cache;
}

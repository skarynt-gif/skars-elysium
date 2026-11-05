import { BackSide, DoubleSide, MeshBasicMaterial, MeshLambertMaterial } from 'three';
import { retroMaterial } from '../render/retroMaterial.ts';

/**
 * Flower materials are white; each flower's actual colors come from
 * per-instance colors, so one material serves every song of a species.
 */
function build() {
  return {
    stem: retroMaterial(new MeshLambertMaterial({ flatShading: true })),
    petal: retroMaterial(new MeshLambertMaterial({ flatShading: true, side: DoubleSide })),
    core: retroMaterial(new MeshLambertMaterial({ flatShading: true })),
    /** Upcoming buds glow softly gold. */
    bud: retroMaterial(new MeshLambertMaterial({ flatShading: true, emissive: '#7a5214' })),
    /** Vaulted asphodels: pale and see-through. */
    ghost: retroMaterial(
      new MeshLambertMaterial({
        flatShading: true,
        side: DoubleSide,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        emissive: '#5a6aa0',
      }),
    ),
    /** Gold rim drawn behind the focused flower (inverted-hull outline, a classic PS1-era trick). */
    outline: retroMaterial(new MeshBasicMaterial({ color: '#ffe08a', side: BackSide })),
  };
}

export type FlowerMaterials = ReturnType<typeof build>;
let cache: FlowerMaterials | null = null;
export function getFlowerMaterials(): FlowerMaterials {
  cache ??= build();
  return cache;
}

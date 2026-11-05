import { FLOWER_STYLES, PLINTH_HEIGHT } from './flowerStyle.ts';
import type { VisualSpecies } from './planting.ts';

/** Height of a flower's head above the ground (for effects, outlines and hit targets). */
export function headHeight(species: VisualSpecies, onPlinth: boolean): number {
  return FLOWER_STYLES[species].height + (onPlinth ? PLINTH_HEIGHT : 0) + 0.06;
}

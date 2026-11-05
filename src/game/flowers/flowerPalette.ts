import type { FlowerAppearance } from '../../content/types.ts';
import { FLOWER_STYLES } from './flowerStyle.ts';
import type { VisualSpecies } from './planting.ts';

/**
 * A flower's colors, decided in one place for the game and the Studio's
 * preview. Pure data (no Three.js) so it can be tested.
 *
 * Buds and teaser sprouts keep their state colors (golden bud, green shoot)
 * whatever the song's custom colors, so fans can always tell what's coming.
 */
export interface FlowerPalette {
  /** Base petal color. */
  petal: string;
  /** Hue shift in degrees applied to `petal` (0 when a custom color is chosen). */
  shift: number;
  core: string;
  /** Rainbow palette-cycling (psychedelic spirals), off when a custom color is chosen. */
  cycle: boolean;
}

export function flowerPalette(species: VisualSpecies, hueShift: number, flower: FlowerAppearance | undefined): FlowerPalette {
  const style = FLOWER_STYLES[species];
  const stateColors = species === 'bud' || species === 'sprout';
  const petal = !stateColors && flower?.color ? flower.color : style.petal;
  const custom = petal !== style.petal;
  return {
    petal,
    shift: custom ? 0 : hueShift,
    core: !stateColors && flower?.core ? flower.core : style.core,
    cycle: Boolean(style.cycleHue) && !custom,
  };
}

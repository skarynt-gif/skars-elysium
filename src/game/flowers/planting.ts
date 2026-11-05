import { bloomState, flowerSpecies, flowerVariant, type BloomState, type FlowerVariant } from '../../content/flowerRules.ts';
import type { Collection, FlowerSpecies, Manifest, Song } from '../../content/types.ts';
import { seededRandom } from '../../lib/random.ts';
import { SANCTUARY_BED, WORLD, type BedAssignment, type Vec2 } from '../world/layout.ts';

/**
 * Decides exactly where every song's flower grows. Pure data, so tests can
 * check that every song gets one flower, inside its bed, with room to focus
 * on each one individually.
 */

/** What is actually drawn: buds and teaser sprouts share one model whatever their genre. */
export type VisualSpecies = FlowerSpecies | 'bud' | 'sprout';

export interface Planting {
  song: Song;
  collection: Collection;
  /** World position (x, z). */
  position: Vec2;
  rotationY: number;
  state: BloomState;
  species: VisualSpecies;
  variant: FlowerVariant;
  /** Singles stand alone on a small marble plinth. */
  plinth: boolean;
}

/** Minimum gap between flowers so the nearest one can always be singled out. */
export const MIN_FLOWER_SPACING = 0.55;

/**
 * Evenly spread positions in a rectangle (local x/z, centered on 0), with a
 * little deterministic jitter so beds look planted, not printed.
 */
export function bedSlots(count: number, width: number, depth: number, seed: string): Vec2[] {
  if (count <= 0) return [];
  const cols = Math.max(1, Math.min(count, Math.round(Math.sqrt((count * width) / depth))));
  const rows = Math.ceil(count / cols);
  const cellW = width / cols;
  const cellD = depth / rows;
  const rand = seededRandom(seed);
  const jitter = 0.12;
  const slots: Vec2[] = [];
  for (let r = 0; r < rows; r++) {
    const inRow = Math.min(cols, count - r * cols);
    // Center a short last row.
    const rowOffset = ((cols - inRow) * cellW) / 2;
    for (let c = 0; c < inRow; c++) {
      const x = -width / 2 + rowOffset + cellW * (c + 0.5) + (rand() * 2 - 1) * jitter * cellW;
      // Front rows (toward the plaza, +z) first, so the first songs are nearest.
      const z = depth / 2 - cellD * (r + 0.5) + (rand() * 2 - 1) * jitter * cellD;
      slots.push([x, z]);
    }
  }
  return slots;
}

function toWorld(local: Vec2, center: Vec2, rotationY: number): Vec2 {
  const c = Math.cos(rotationY);
  const s = Math.sin(rotationY);
  return [center[0] + local[0] * c + local[1] * s, center[1] - local[0] * s + local[1] * c];
}

export function plantGarden(manifest: Manifest, assignment: BedAssignment, now: number): Planting[] {
  const songsBy = new Map<string, Song[]>();
  for (const song of manifest.songs) songsBy.set(song.collectionId, [...(songsBy.get(song.collectionId) ?? []), song]);

  const plantings: Planting[] = [];
  const plant = (song: Song, collection: Collection, position: Vec2, rotationY: number) => {
    const state = bloomState(song, collection, now);
    plantings.push({
      song,
      collection,
      position,
      rotationY,
      state,
      species: state === 'bud' ? 'bud' : state === 'sprout' ? 'sprout' : flowerSpecies(song),
      variant: flowerVariant(song),
      plinth: collection.type === 'single',
    });
  };

  // Main beds. Flowers stay clear of the curb and of the sign at the back.
  const bedW = WORLD.bed.width - 0.9;
  const bedD = WORLD.bed.depth - 1.3;
  const bedOffsetZ = 0.25; // shift toward the front, away from the sign
  for (const { plot, collection } of assignment.main) {
    if (!collection) continue;
    const songs = songsBy.get(collection.id) ?? [];
    bedSlots(songs.length, bedW, bedD, collection.id).forEach(([x, z], i) => {
      const facing = plot.rotationY + flowerVariant(songs[i]!).lean * 3;
      plant(songs[i]!, collection, toWorld([x, z + bedOffsetZ], plot.center, plot.rotationY), facing);
    });
  }

  // EP sanctuary beds (unrotated, facing south toward the gateway).
  for (const { plot, collection } of assignment.sanctuary) {
    if (!collection) continue;
    const songs = songsBy.get(collection.id) ?? [];
    bedSlots(songs.length, SANCTUARY_BED.width - 0.7, SANCTUARY_BED.depth - 0.7, collection.id).forEach(([x, z], i) => {
      plant(songs[i]!, collection, [plot.center[0] + x, plot.center[1] + z], 0);
    });
  }

  // Hidden grove: a ring around the shrine.
  if (assignment.grove) {
    const songs = songsBy.get(assignment.grove.id) ?? [];
    const [gx, gz] = WORLD.grove.center;
    const radius = 2.1;
    songs.forEach((song, i) => {
      const angle = (i / Math.max(1, songs.length)) * Math.PI * 2 + 0.3;
      const position: Vec2 = [gx + Math.sin(angle) * radius, gz - Math.cos(angle) * radius];
      // Face the shrine.
      plant(song, assignment.grove!, position, Math.atan2(gx - position[0], gz - position[1]));
    });
  }

  return plantings;
}

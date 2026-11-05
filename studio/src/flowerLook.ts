/**
 * What a song's flower looks like, worked out with the game's own rules
 * (content/flowerRules.ts + game/flowers/flowerPalette.ts), so the Studio
 * preview matches the garden exactly.
 */
import { bloomState, flowerSpecies, flowerVariant, type BloomState } from '../../src/content/flowerRules.ts';
import type { Collection, FlowerAppearance, FlowerSpecies, Song } from '../../src/content/types.ts';
import { flowerPalette, type FlowerPalette } from '../../src/game/flowers/flowerPalette.ts';
import type { VisualSpecies } from '../../src/game/flowers/planting.ts';
import type { CollectionRow, SongRow } from './api.ts';

export function flowerOf(row: SongRow): FlowerAppearance | undefined {
  const flower: FlowerAppearance = {
    ...(row.flower_species ? { species: row.flower_species as FlowerSpecies } : {}),
    ...(row.flower_hue !== null ? { hue: row.flower_hue } : {}),
    ...(row.flower_scale !== null ? { scale: row.flower_scale } : {}),
    ...(row.flower_color ? { color: row.flower_color } : {}),
    ...(row.flower_core ? { core: row.flower_core } : {}),
    ...(row.flower_label ? { label: row.flower_label } : {}),
  };
  return Object.keys(flower).length ? flower : undefined;
}

export function songOf(row: SongRow): Song {
  const flower = flowerOf(row);
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    collectionId: row.collection_id,
    genre: row.genre as Song['genre'],
    status: row.status as Song['status'],
    order: row.sort_order,
    ...(row.release_date ? { releaseDate: row.release_date } : {}),
    ...(row.teaser ? { teaser: true } : {}),
    ...(flower ? { flower } : {}),
  };
}

export interface FlowerLook {
  state: BloomState;
  species: VisualSpecies;
  palette: FlowerPalette;
  heightScale: number;
  plinth: boolean;
}

/** `mode: 'now'` = as visitors see it today; `'bloom'` = how it looks once released. */
export function flowerLook(row: SongRow, bed: CollectionRow | undefined, mode: 'now' | 'bloom', now = Date.now()): FlowerLook {
  const song = songOf(row);
  const collection = { autoBloom: Boolean(bed?.auto_bloom) } as Collection;
  const realState = bloomState(song, collection, now);
  const state: BloomState = mode === 'bloom' && (realState === 'bud' || realState === 'sprout') ? 'bloom' : realState;
  const species: VisualSpecies = state === 'bud' ? 'bud' : state === 'sprout' ? 'sprout' : flowerSpecies(song);
  const variant = flowerVariant(song);
  return {
    state,
    species,
    palette: flowerPalette(species, variant.hueShift, song.flower),
    heightScale: variant.heightScale,
    plinth: bed?.type === 'single',
  };
}

export const SPECIES_INFO: Record<FlowerSpecies, { name: string; about: string }> = {
  rose: { name: 'Rose', about: 'Crimson petals, slow smooth sway (R&B)' },
  spiral: { name: 'Spiral', about: 'Big, rainbow color cycling, wobbly (psychedelic)' },
  iris: { name: 'Iris', about: 'Blue-violet, flowing motion (melodic rap)' },
  thistle: { name: 'Thistle', about: 'Jagged spikes, twitchy pulse (rage)' },
  lily: { name: 'Lily', about: 'Warm peach trumpet (other)' },
  asphodel: { name: 'Asphodel', about: 'Pale and ghostly (the vault)' },
};

/** Ready-made colors that sit well in the sunset palette. */
export const COLOR_SWATCHES = ['#b3203f', '#ff5fb0', '#ff9a4d', '#ffd27a', '#e6ecff', '#8fc29a', '#5b5fd8', '#8a3ab9', '#1f1a2e'];

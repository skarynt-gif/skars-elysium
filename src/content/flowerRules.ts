import type { Collection, FlowerSpecies, Genre, Song } from './types.ts';
import { hashString, seededRandom } from '../lib/random.ts';

/** Re-exported for callers that seed per-song effects. */
export { hashString as hashId };

/**
 * Pure rules that decide how a song's flower looks. The 3D flower system
 * (game/flowers) only renders what these functions return, so the look of the
 * whole garden can be reasoned about and tested without a browser.
 */

/**
 * bloom  = open flower (released)
 * bud    = golden unopened bud (upcoming, title shown)
 * sprout = small shoot labeled "???" (upcoming teaser, title hidden)
 * ghost  = pale vaulted asphodel (unreleased)
 */
export type BloomState = 'bloom' | 'bud' | 'sprout' | 'ghost';

const GENRE_SPECIES: Record<Genre, FlowerSpecies> = {
  rnb: 'rose',
  psychedelic: 'spiral',
  'melodic-rap': 'iris',
  rage: 'thistle',
  other: 'lily',
};

export function bloomState(song: Song, collection: Collection, now: number): BloomState {
  switch (song.status) {
    case 'released':
      return 'bloom';
    case 'unreleased':
      return 'ghost';
    case 'upcoming': {
      const released =
        collection.autoBloom && song.releaseDate !== undefined && Date.parse(song.releaseDate) <= now;
      if (released) return 'bloom';
      return song.teaser ? 'sprout' : 'bud';
    }
  }
}

export function flowerSpecies(song: Song): FlowerSpecies {
  if (song.flower?.species) return song.flower.species;
  if (song.status === 'unreleased') return 'asphodel';
  return GENRE_SPECIES[song.genre];
}

export interface FlowerVariant {
  /** Degrees added to the species palette hue. */
  hueShift: number;
  heightScale: number;
  petalCount: number;
  /** Lean in radians, so a bed doesn't look like a grid of clones. */
  lean: number;
}

/**
 * Per-song variation within a bed: related but distinct, and identical on
 * every visit because it is derived from the song id.
 */
export function flowerVariant(song: Song): FlowerVariant {
  const rand = seededRandom(hashString(song.id));
  const variant: FlowerVariant = {
    hueShift: Math.round((rand() * 2 - 1) * 14),
    heightScale: 0.85 + rand() * 0.3,
    petalCount: 5 + Math.floor(rand() * 4),
    lean: (rand() * 2 - 1) * 0.15,
  };
  if (song.flower?.hue !== undefined) variant.hueShift = song.flower.hue;
  if (song.flower?.scale !== undefined) variant.heightScale *= song.flower.scale;
  return variant;
}

/** What selecting a song's flower offers, shown in the on-screen prompt. */
export type SongAction = 'LISTEN' | 'PREVIEW' | 'DETAILS';

export function songAction(song: Song, state: BloomState): SongAction {
  if (state === 'sprout') return 'DETAILS';
  if (state === 'bloom' && song.audio) return 'LISTEN';
  if (song.preview) return 'PREVIEW';
  if (song.audio && song.status !== 'upcoming') return 'LISTEN';
  return 'DETAILS';
}

/** The audio file to play when a flower is selected, if any. */
export function playableUrl(song: Song, state: BloomState): string | null {
  if (state === 'sprout') return null; // teasers reveal nothing
  if (state === 'bloom' && song.audio) return song.audio;
  return song.preview ?? (song.status === 'unreleased' ? (song.audio ?? null) : null);
}

/** What visitors see as a song's name: teasers stay secret until revealed. */
export function displayTitle(song: Song, state: BloomState): string {
  return state === 'sprout' ? '???' : song.title;
}

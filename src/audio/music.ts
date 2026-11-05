import { bloomState, playableUrl, type BloomState } from '../content/flowerRules.ts';
import type { Manifest, Song } from '../content/types.ts';
import { flowerIndex } from '../game/flowers/flowerIndex.ts';
import { useGameStore } from '../state/gameStore.ts';
import { createAudioEngine, type AudioEngine, type Track } from './engine.ts';
import { adjacentSong } from './queue.ts';
import { createEffectsChain, type EffectsChain } from './effects.ts';
import type { EffectSettings } from './effectsMath.ts';

/**
 * The one music engine for the page, plus the actions the interface and
 * lock-screen controls use. Everything goes through the store's
 * `requestSong`, so flowers, next/previous and auto-advance share one path.
 */
let engine: AudioEngine | null = null;
let effects: EffectsChain | null = null;

/** The engine is created on first use, with the reverb/delay chain built into its graph. */
export function getEngine(): AudioEngine {
  engine ??= createAudioEngine(undefined, (ctx, input, output) => {
    effects = createEffectsChain(ctx, input, output, useGameStore.getState().effects);
  });
  return engine;
}

/** Applies effect settings to the live audio (and speed/pitch to both decks). */
export function applyEffects(settings: EffectSettings): void {
  effects?.apply(settings);
  getEngine().setRate(settings.speed, settings.preservePitch);
}

function manifest(): Manifest | null {
  const content = useGameStore.getState().content;
  return content.status === 'ready' ? content.manifest : null;
}

/** Current bloom state of a song (uses the planted flower when there is one). */
export function stateOf(song: Song): BloomState {
  const planted = flowerIndex.plantings.find((p) => p.song.id === song.id);
  if (planted) return planted.state;
  const m = manifest();
  const collection = m?.collections.find((c) => c.id === song.collectionId);
  return collection ? bloomState(song, collection, Date.now()) : 'bloom';
}

export function trackFor(song: Song): Track | null {
  const url = playableUrl(song, stateOf(song));
  if (!url) return null;
  const collection = manifest()?.collections.find((c) => c.id === song.collectionId);
  const artwork = song.cover ?? collection?.cover;
  return {
    id: song.id,
    url,
    title: song.title,
    artist: song.artist,
    album: collection?.title ?? '',
    ...(artwork ? { artwork } : {}),
  };
}

export function findSong(id: string | null): Song | null {
  if (!id) return null;
  return manifest()?.songs.find((s) => s.id === id) ?? null;
}

const isPlayable = (song: Song) => trackFor(song) !== null;

export function playAdjacent(direction: 1 | -1): void {
  const m = manifest();
  const { currentSongId, requestSong } = useGameStore.getState();
  if (!m || !currentSongId) return;
  const next = adjacentSong(m, currentSongId, direction, isPlayable);
  if (next) requestSong(next.id);
}

export const playNext = () => playAdjacent(1);
export const playPrevious = () => playAdjacent(-1);

export function togglePlay(): void {
  const { playback, currentSongId, requestSong } = useGameStore.getState();
  // Selected a different song than the one loaded? Play the selection.
  if (currentSongId && playback.trackId !== currentSongId) {
    const song = findSong(currentSongId);
    if (song && isPlayable(song)) return requestSong(currentSongId);
  }
  getEngine().toggle();
}

export function seekTo(seconds: number): void {
  getEngine().seek(seconds);
}

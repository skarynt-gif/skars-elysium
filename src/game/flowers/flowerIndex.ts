import { createEmitter } from '../../lib/emitter.ts';
import { displayTitle, playableUrl, songAction } from '../../content/flowerRules.ts';
import { useGameStore, type Focus } from '../../state/gameStore.ts';
import type { Vec2 } from '../world/layout.ts';
import { headHeight } from './flowerHeights.ts';
import type { Planting } from './planting.ts';

/**
 * The flowers currently planted, in a form the interaction system can scan
 * quickly every frame, plus the selection action they all share.
 */
export const flowerIndex: {
  plantings: Planting[];
  positions: Vec2[];
  /** Seconds (performance clock) when each song's flower was last selected. */
  selectedAt: Map<string, number>;
} = { plantings: [], positions: [], selectedAt: new Map() };

export function setPlantings(plantings: Planting[]): void {
  flowerIndex.plantings = plantings;
  flowerIndex.positions = plantings.map((p) => p.position);
}

export const flowerPickId = (songId: string) => `flower:${songId}`;

export function flowerFocus(p: Planting): Focus {
  const status =
    p.state === 'bud'
      ? 'COMING SOON'
      : p.state === 'sprout'
        ? 'SOMETHING IS GROWING…'
        : p.state === 'ghost'
          ? 'FROM THE VAULT'
          : p.song.artist.toUpperCase();
  // Teaser sprouts keep everything secret, including the label.
  const tag = p.state !== 'sprout' ? p.song.flower?.label?.toUpperCase() : undefined;
  return {
    kind: 'flower',
    id: flowerPickId(p.song.id),
    label: displayTitle(p.song, p.state),
    detail: tag ? `${status} · ${tag}` : status,
    action: songAction(p.song, p.state),
  };
}

/** A burst of golden particles at a flower: listened to by the effects layer. */
export const flowerBursts = createEmitter<{ x: number; y: number; z: number }>();

export const now = () => performance.now() / 1000;

/**
 * Selecting a flower: animate it and burst particles, then either play its
 * song (opening the player) or, for buds and teasers, open the Coming Soon card.
 */
export function selectFlower(p: Planting): void {
  flowerIndex.selectedAt.set(p.song.id, now());
  flowerBursts.emit({ x: p.position[0], y: headHeight(p.species, p.plinth) * p.variant.heightScale, z: p.position[1] });
  const store = useGameStore.getState();
  const upcoming = p.state === 'bud' || p.state === 'sprout';
  if (upcoming || !playableUrl(p.song, p.state)) {
    store.openDetails(p.song.id);
    if (document.pointerLockElement) document.exitPointerLock();
  } else {
    store.requestSong(p.song.id);
  }
}

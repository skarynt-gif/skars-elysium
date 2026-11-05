/**
 * Ambient sound levels. The garden's sounds live on their own channel (not
 * through the music effects), dip while music plays, and follow the
 * visitor's ambient volume setting.
 */
export const DUCK_WHILE_MUSIC = 0.4;

export interface AmbientLevels {
  wind: number;
  life: number; // birds, cicadas, chimes
  fountain: number;
}

export function ambientLevels(volume: number, musicPlaying: boolean, active: boolean): AmbientLevels {
  const v = active ? Math.max(0, Math.min(1, volume)) * (musicPlaying ? DUCK_WHILE_MUSIC : 1) : 0;
  return { wind: 0.22 * v, life: 0.35 * v, fountain: 0.5 * v };
}

/** Seconds until the next bird call / cicada burst / wind chime (randomised but bounded). */
export function nextEventDelay(kind: 'bird' | 'cicada' | 'chime', rand: () => number): number {
  switch (kind) {
    case 'bird':
      return 3 + rand() * 9;
    case 'cicada':
      return 7 + rand() * 14;
    case 'chime':
      return 25 + rand() * 40;
  }
}

/** Pentatonic chime notes (Hz): always consonant, whatever the music. */
export const CHIME_NOTES = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5] as const;

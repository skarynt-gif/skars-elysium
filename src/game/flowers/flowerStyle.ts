import type { VisualSpecies } from './planting.ts';

/**
 * The look and motion of each kind of flower, as planned:
 *   rose      R&B           crimson/wine petals, gold heart, slow smooth sway
 *   spiral    psychedelic   oversized, rainbow palette cycling, slow wobble
 *   iris      melodic rap   blue-violet with silver, flowing motion
 *   thistle   rage          jagged red/black/magenta spikes, twitchy pulse
 *   lily      other         warm peach trumpet
 *   asphodel  unreleased    pale, ghostly, semi-transparent
 *   bud       upcoming      closed golden bud, gently pulsing
 *   sprout    teaser        a small shoot with a gold glint, title hidden ("???")
 */
export interface FlowerStyle {
  petal: string;
  core: string;
  /** Stem height in meters: where the flower head sits. */
  height: number;
  /** How far the flower bends in the wind (radians at full gust). */
  sway: number;
  motion: 'smooth' | 'wobble' | 'flow' | 'twitch' | 'drift' | 'pulse';
  /** Rainbow hue cycling (palette cycling, a classic 8/16-bit effect). */
  cycleHue?: boolean;
  ghost?: boolean;
}

export const FLOWER_STYLES: Record<VisualSpecies, FlowerStyle> = {
  rose: { petal: '#b3203f', core: '#ffd27a', height: 0.75, sway: 0.08, motion: 'smooth' },
  spiral: { petal: '#ff5fb0', core: '#ffe066', height: 1.05, sway: 0.12, motion: 'wobble', cycleHue: true },
  iris: { petal: '#5b5fd8', core: '#d8d8f0', height: 0.85, sway: 0.1, motion: 'flow' },
  thistle: { petal: '#d1194f', core: '#2a0f1f', height: 0.72, sway: 0.05, motion: 'twitch' },
  lily: { petal: '#ffb38a', core: '#ffd27a', height: 0.8, sway: 0.09, motion: 'smooth' },
  asphodel: { petal: '#e6ecff', core: '#b8c4ff', height: 1.1, sway: 0.07, motion: 'drift', ghost: true },
  bud: { petal: '#e8b84a', core: '#5a7a3a', height: 0.6, sway: 0.05, motion: 'pulse' },
  sprout: { petal: '#7fae4a', core: '#ffd27a', height: 0.32, sway: 0.04, motion: 'pulse' },
};

/** Extra height for singles standing on their plinths. */
export const PLINTH_HEIGHT = 0.45;

/**
 * Gentle travelling gusts: neighbouring flowers move together, like wind
 * rippling across the garden. Returns lean angles (radians) about x and z.
 */
export function windAt(x: number, z: number, t: number): [number, number] {
  const gust = 0.6 + 0.4 * Math.sin(t * 0.35 + x * 0.05);
  const lx = Math.sin(t * 1.1 + x * 0.18 + z * 0.07) * 0.7 + Math.sin(t * 2.3 + z * 0.31) * 0.3;
  const lz = Math.sin(t * 0.9 + z * 0.15 - x * 0.05) * 0.7 + Math.sin(t * 1.9 + x * 0.27) * 0.3;
  return [lx * gust, lz * gust];
}

/**
 * Per-species character on top of the wind. Returns [extraLeanX, extraLeanZ,
 * scale] for a flower with a unique `seed` phase.
 */
export function speciesMotion(motion: FlowerStyle['motion'], t: number, seed: number): [number, number, number] {
  switch (motion) {
    case 'wobble':
      return [Math.sin(t * 0.7 + seed) * 0.12, Math.cos(t * 0.6 + seed) * 0.12, 1];
    case 'flow':
      return [Math.sin(t * 1.4 + seed) * 0.05, 0, 1];
    case 'twitch': {
      // Sharp, irregular jolts: a stepped pseudo-random pulse.
      const step = Math.floor(t * 6 + seed * 10);
      const jolt = Math.sin(step * 12.9898 + seed) * 43758.5453;
      const r = jolt - Math.floor(jolt);
      return [(r - 0.5) * 0.08, 0, 1 + (r > 0.8 ? 0.06 : 0)];
    }
    case 'drift':
      return [Math.sin(t * 0.5 + seed) * 0.04, Math.sin(t * 0.43 + seed) * 0.04, 1];
    case 'pulse':
      return [0, 0, 1 + Math.sin(t * 2 + seed) * 0.04];
    default:
      return [0, 0, 1];
  }
}

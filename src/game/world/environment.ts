import type { GardenEnvironment } from '../../content/types.ts';

/**
 * The garden's adjustable atmosphere (set in the Creator Studio), kept
 * inside ranges that always look right and run smoothly on phones.
 */
export const ENVIRONMENT_RANGES = {
  /** −1 = cooler dusk, 0 = the original sunset, 1 = warmer golden hour. */
  skyWarmth: { min: -1, max: 1, default: 0 },
  /** Fog thickness: higher = mistier, the garden fades out sooner. */
  fog: { min: 0.7, max: 1.5, default: 1 },
  /** Floating pollen, fireflies and gold dust. */
  particles: { min: 0, max: 2, default: 1 },
  butterflies: { min: 0, max: 2, default: 1 },
  /** Cloud bands in the sky. */
  clouds: { min: 0, max: 1.5, default: 1 },
} as const satisfies Record<keyof GardenEnvironment, { min: number; max: number; default: number }>;

export type EnvironmentKey = keyof typeof ENVIRONMENT_RANGES;
export const ENVIRONMENT_KEYS = Object.keys(ENVIRONMENT_RANGES) as EnvironmentKey[];

export const DEFAULT_ENVIRONMENT: GardenEnvironment = Object.fromEntries(
  ENVIRONMENT_KEYS.map((k) => [k, ENVIRONMENT_RANGES[k].default]),
) as unknown as GardenEnvironment;

export function clampEnvironment(value: Partial<GardenEnvironment> | undefined): GardenEnvironment {
  const env = { ...DEFAULT_ENVIRONMENT };
  for (const k of ENVIRONMENT_KEYS) {
    const v = value?.[k];
    if (typeof v === 'number' && Number.isFinite(v)) env[k] = Math.min(ENVIRONMENT_RANGES[k].max, Math.max(ENVIRONMENT_RANGES[k].min, v));
  }
  return env;
}

// ---------- sky colors ----------

function parse(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const ch = (x: number, y: number) => Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
  return `#${ch(ar, br)}${ch(ag, bg)}${ch(ab, bb)}`;
}

/** Colors warmth pulls toward: golden hour above, violet dusk below. */
const WARM: Record<string, string> = {
  skyZenith: '#5a3a6a',
  skyUpper: '#c0607a',
  skyPink: '#ff8a5a',
  skyHorizon: '#ffc060',
  fog: '#d07a6a',
};
const COOL: Record<string, string> = {
  skyZenith: '#141032',
  skyUpper: '#3a2a6a',
  skyPink: '#a04a8a',
  skyHorizon: '#d0607a',
  fog: '#6a4a7d',
};

export interface SkyPalette {
  skyZenith: string;
  skyUpper: string;
  skyPink: string;
  skyHorizon: string;
  fog: string;
}

const SKY_KEYS = ['skyZenith', 'skyUpper', 'skyPink', 'skyHorizon', 'fog'] as const;

/**
 * The sky and fog colors for a warmth setting (0 returns the originals
 * exactly). `base` may be the whole game palette; only sky colors are used.
 */
export function skyPalette(base: SkyPalette, warmth: number): SkyPalette {
  const target = warmth >= 0 ? WARM : COOL;
  const t = Math.min(1, Math.abs(warmth)) * 0.6;
  const out = {} as SkyPalette;
  for (const key of SKY_KEYS) out[key] = t === 0 ? base[key] : mixHex(base[key], target[key]!, t);
  return out;
}

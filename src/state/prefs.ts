import { DEFAULT_EFFECTS, parseEffects, type EffectSettings } from '../audio/effectsMath.ts';

/**
 * Visitor preferences remembered between visits (in this browser only).
 * Saved data is untrusted: every field is checked and clamped on load, and
 * anything missing or broken falls back to the default.
 */
export type QualityChoice = 'auto' | 'low' | 'medium' | 'high';

export interface Prefs {
  lookSensitivity: number;
  invertY: boolean;
  headBob: boolean;
  quality: QualityChoice;
  volume: number;
  ambientVolume: number;
  effects: EffectSettings;
}

export const DEFAULT_PREFS: Prefs = {
  lookSensitivity: 1,
  invertY: false,
  headBob: true,
  quality: 'auto',
  volume: 0.8,
  ambientVolume: 0.6,
  effects: DEFAULT_EFFECTS,
};

export const SENSITIVITY_RANGE = [0.3, 2.5] as const;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const QUALITY: readonly QualityChoice[] = ['auto', 'low', 'medium', 'high'];

export function parsePrefs(raw: string | null, defaults: Prefs = DEFAULT_PREFS): Prefs {
  if (!raw) return { ...defaults };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ...defaults };
  }
  if (typeof data !== 'object' || data === null) return { ...defaults };
  const d = data as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return {
    lookSensitivity: clamp(num(d.lookSensitivity) ?? defaults.lookSensitivity, ...SENSITIVITY_RANGE),
    invertY: typeof d.invertY === 'boolean' ? d.invertY : defaults.invertY,
    headBob: typeof d.headBob === 'boolean' ? d.headBob : defaults.headBob,
    quality: QUALITY.includes(d.quality as QualityChoice) ? (d.quality as QualityChoice) : defaults.quality,
    volume: clamp(num(d.volume) ?? defaults.volume, 0, 1),
    ambientVolume: clamp(num(d.ambientVolume) ?? defaults.ambientVolume, 0, 1),
    effects: d.effects === undefined ? { ...defaults.effects } : parseEffects(d.effects),
  };
}

export function serializePrefs(prefs: Prefs): string {
  return JSON.stringify(prefs);
}

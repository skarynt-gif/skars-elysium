import { seededRandom } from '../lib/random.ts';

/**
 * Settings for the player's effects. Every knob is 0..1 in the interface and
 * mapped to real audio values here, so the mapping is in one tested place.
 */
export interface EffectSettings {
  /** Reverb space: small courtyard (0) → vast marble temple (1). */
  reverbSize: number;
  /** Reverb wet/dry (0 = dry only). */
  reverbMix: number;
  /** Delay "amount": the echo time. */
  delayTime: number;
  /** How much each echo repeats. Capped well below runaway. */
  delayFeedback: number;
  /** Delay wet/dry (0 = dry only). */
  delayMix: number;
  speed: SpeedOption;
  /** On: speed changes keep the voice's pitch. Off: slower = deeper, like a record. */
  preservePitch: boolean;
}

export const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
export type SpeedOption = (typeof SPEED_OPTIONS)[number];

export const DEFAULT_EFFECTS: EffectSettings = {
  reverbSize: 0.5,
  reverbMix: 0,
  delayTime: 0.35,
  delayFeedback: 0.35,
  delayMix: 0,
  speed: 1,
  preservePitch: true,
};

export const PRESETS: { id: string; label: string; settings: EffectSettings }[] = [
  { id: 'dry', label: 'DRY', settings: DEFAULT_EFFECTS },
  {
    id: 'slowed',
    label: 'SLOWED + REVERB',
    settings: { ...DEFAULT_EFFECTS, speed: 0.75, preservePitch: false, reverbSize: 0.72, reverbMix: 0.45 },
  },
  {
    id: 'temple',
    label: 'TEMPLE ECHO',
    settings: { ...DEFAULT_EFFECTS, reverbSize: 0.9, reverbMix: 0.35, delayTime: 0.45, delayFeedback: 0.45, delayMix: 0.3 },
  },
  {
    id: 'sped',
    label: 'SPED UP',
    settings: { ...DEFAULT_EFFECTS, speed: 1.25, preservePitch: false, reverbSize: 0.25, reverbMix: 0.12 },
  },
];

export const MAX_FEEDBACK = 0.85;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Reverb tail length in seconds. */
export function reverbSeconds(size: number): number {
  return 0.5 + clamp01(size) ** 1.4 * 5.5;
}

/** Friendly name for the reverb size, shown next to the slider. */
export function reverbSpaceName(size: number): string {
  const s = clamp01(size);
  return s < 0.25 ? 'COURTYARD' : s < 0.5 ? 'GARDEN HALL' : s < 0.8 ? 'GRAND HALL' : 'TEMPLE';
}

/** Echo time in seconds (80ms slapback → 900ms long echo). */
export function delaySeconds(amount: number): number {
  return 0.08 + clamp01(amount) ** 1.3 * 0.82;
}

export function feedbackGain(amount: number): number {
  return clamp01(amount) * MAX_FEEDBACK;
}

/**
 * Equal-power wet/dry. The dry signal follows the strongest effect's mix, so
 * turning either effect up never makes the song suddenly louder or quieter.
 */
export function mixGains(reverbMix: number, delayMix: number): { dry: number; reverb: number; delay: number } {
  const r = clamp01(reverbMix);
  const d = clamp01(delayMix);
  return {
    dry: Math.cos((Math.max(r, d) * Math.PI) / 2),
    reverb: Math.sin((r * Math.PI) / 2),
    delay: Math.sin((d * Math.PI) / 2),
  };
}

/**
 * A generated stereo impulse response: a short pre-delay, a few early
 * reflections off marble walls, then a dense tail that decays to −60dB and
 * darkens as it fades (stone absorbs highs). Left and right use different
 * noise so the reverb sounds wide.
 */
export function generateImpulse(
  sampleRate: number,
  seconds: number,
  seed = 'marble',
): [Float32Array<ArrayBuffer>, Float32Array<ArrayBuffer>] {
  const length = Math.max(1, Math.ceil(sampleRate * seconds));
  const preDelay = Math.floor(sampleRate * 0.012);
  const channels: [Float32Array<ArrayBuffer>, Float32Array<ArrayBuffer>] = [new Float32Array(length), new Float32Array(length)];
  channels.forEach((data, ch) => {
    const rand = seededRandom(`${seed}-${ch}`);
    let lowpassed = 0;
    for (let i = preDelay; i < length; i++) {
      const t = (i - preDelay) / (length - preDelay);
      const envelope = Math.exp(-6.91 * t); // −60dB at the end
      const noise = rand() * 2 - 1;
      // Damping grows over time: the tail gets darker as it fades.
      const damping = 0.15 + 0.8 * t;
      lowpassed += (noise - lowpassed) * (1 - damping);
      data[i] = lowpassed * envelope;
    }
    // Early reflections: a few discrete bounces in the first ~80ms.
    for (const [ms, gain] of [
      [17, 0.5],
      [29, 0.38],
      [43, 0.3],
      [61, 0.22],
      [79, 0.16],
    ] as const) {
      const i = preDelay + Math.floor(((ms + ch * 3) / 1000) * sampleRate);
      if (i < length) data[i] = data[i]! + (ch === 0 ? gain : -gain);
    }
  });
  return channels;
}

/** Validates saved effect settings (untrusted browser storage). */
export function parseEffects(value: unknown): EffectSettings {
  if (typeof value !== 'object' || value === null) return { ...DEFAULT_EFFECTS };
  const v = value as Record<string, unknown>;
  const unit = (x: unknown, fallback: number) => (typeof x === 'number' && Number.isFinite(x) ? clamp01(x) : fallback);
  const speed = SPEED_OPTIONS.includes(v.speed as SpeedOption) ? (v.speed as SpeedOption) : DEFAULT_EFFECTS.speed;
  return {
    reverbSize: unit(v.reverbSize, DEFAULT_EFFECTS.reverbSize),
    reverbMix: unit(v.reverbMix, DEFAULT_EFFECTS.reverbMix),
    delayTime: unit(v.delayTime, DEFAULT_EFFECTS.delayTime),
    delayFeedback: unit(v.delayFeedback, DEFAULT_EFFECTS.delayFeedback),
    delayMix: unit(v.delayMix, DEFAULT_EFFECTS.delayMix),
    speed,
    preservePitch: typeof v.preservePitch === 'boolean' ? v.preservePitch : DEFAULT_EFFECTS.preservePitch,
  };
}

/** Which preset (if any) the current settings exactly match, for highlighting. */
export function matchingPreset(settings: EffectSettings): string | null {
  const same = (a: EffectSettings, b: EffectSettings) =>
    (Object.keys(a) as (keyof EffectSettings)[]).every((k) =>
      typeof a[k] === 'number' ? Math.abs((a[k] as number) - (b[k] as number)) < 1e-6 : a[k] === b[k],
    );
  return PRESETS.find((p) => same(p.settings, settings))?.id ?? null;
}

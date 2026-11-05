import {
  delaySeconds,
  feedbackGain,
  generateImpulse,
  mixGains,
  reverbSeconds,
  type EffectSettings,
} from './effectsMath.ts';

/**
 * The reverb and delay, processing the real audio between the decks and
 * the volume control:
 *
 *          ┌─▶ dry ──────────────────────────────────────────────┐
 *   input ─┼─▶ reverb send ─▶ convolver A ─▶ gain A ─────────────┼─▶ output
 *          │                └▶ convolver B ─▶ gain B ─────────────┤
 *          └─▶ delay send ─▶ delay ─▶ tone filter ─┬──────────────┘
 *                              ▲                    │
 *                              └──── feedback ◀─────┘
 *
 * Every change glides over a few milliseconds (no zipper noise or clicks).
 * Changing the reverb size builds the new space on the idle convolver and
 * crossfades to it.
 */
export interface EffectsChain {
  apply(settings: EffectSettings): void;
}

export interface EffectsTimers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const GLIDE = 0.03; // seconds; time constant for knob changes
const DELAY_GLIDE = 0.12; // slower, so changing echo time sweeps instead of crackling
const REVERB_SWAP_SECONDS = 0.35;
const REVERB_REBUILD_DEBOUNCE_MS = 140;

export function createEffectsChain(
  ctx: AudioContext,
  input: AudioNode,
  output: AudioNode,
  initial: EffectSettings,
  timers: EffectsTimers = { setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: (h) => clearTimeout(h as number) },
): EffectsChain {
  // Dry path
  const dry = ctx.createGain();
  input.connect(dry);
  dry.connect(output);

  // Reverb: two convolvers for click-free size changes
  const reverbSend = ctx.createGain();
  reverbSend.gain.value = 0;
  input.connect(reverbSend);
  const makeReverb = (level: number) => {
    const convolver = ctx.createConvolver();
    const gain = ctx.createGain();
    convolver.normalize = true;
    gain.gain.value = level;
    reverbSend.connect(convolver);
    convolver.connect(gain);
    gain.connect(output);
    return { convolver, gain };
  };
  const reverbs = [makeReverb(1), makeReverb(0)] as const;
  let activeReverb: 0 | 1 = 0;
  let builtSize = -1;
  let rebuildTimer: unknown = null;

  // Delay with filtered feedback (each echo a little darker, like tape)
  const delaySend = ctx.createGain();
  delaySend.gain.value = 0;
  const delay = ctx.createDelay(1.0);
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 3400;
  tone.Q.value = 0.5;
  const feedback = ctx.createGain();
  input.connect(delaySend);
  delaySend.connect(delay);
  delay.connect(tone);
  tone.connect(feedback);
  feedback.connect(delay);
  tone.connect(output);

  const glide = (param: AudioParam, value: number, timeConstant = GLIDE) => {
    param.setTargetAtTime(value, ctx.currentTime, timeConstant);
  };

  function buildImpulse(size: number): AudioBuffer {
    const seconds = reverbSeconds(size);
    const [left, right] = generateImpulse(ctx.sampleRate, seconds);
    const buffer = ctx.createBuffer(2, left.length, ctx.sampleRate);
    buffer.copyToChannel(left, 0);
    buffer.copyToChannel(right, 1);
    return buffer;
  }

  function swapReverb(size: number): void {
    if (Math.abs(size - builtSize) < 1e-6) return;
    builtSize = size;
    const next: 0 | 1 = activeReverb === 0 ? 1 : 0;
    reverbs[next].convolver.buffer = buildImpulse(size);
    const t = ctx.currentTime;
    const fade = (param: AudioParam, target: number) => {
      param.cancelScheduledValues(t);
      param.setValueAtTime(param.value, t);
      param.linearRampToValueAtTime(target, t + REVERB_SWAP_SECONDS);
    };
    fade(reverbs[next].gain.gain, 1);
    fade(reverbs[activeReverb].gain.gain, 0);
    activeReverb = next;
  }

  // Build the starting space immediately (no crossfade needed).
  reverbs[0].convolver.buffer = buildImpulse(initial.reverbSize);
  builtSize = initial.reverbSize;

  const chain: EffectsChain = {
    apply(settings) {
      const gains = mixGains(settings.reverbMix, settings.delayMix);
      glide(dry.gain, gains.dry);
      glide(reverbSend.gain, gains.reverb);
      glide(delaySend.gain, gains.delay);
      glide(delay.delayTime, delaySeconds(settings.delayTime), DELAY_GLIDE);
      glide(feedback.gain, feedbackGain(settings.delayFeedback));

      // Rebuilding a reverb takes a moment, so wait until the slider settles.
      if (Math.abs(settings.reverbSize - builtSize) > 1e-6) {
        if (rebuildTimer !== null) timers.clearTimeout(rebuildTimer);
        rebuildTimer = timers.setTimeout(() => {
          rebuildTimer = null;
          swapReverb(settings.reverbSize);
        }, REVERB_REBUILD_DEBOUNCE_MS);
      }
    },
  };
  chain.apply(initial);
  return chain;
}

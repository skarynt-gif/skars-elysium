import { seededRandom } from '../../lib/random.ts';
import { CHIME_NOTES, ambientLevels, nextEventDelay } from './ambientMix.ts';

/**
 * The garden's own sounds, synthesized in code (no audio files):
 *   wind      filtered noise with slow gusts
 *   fountain  bright filtered noise placed at the fountain in 3D
 *   birds     short chirp phrases from random spots around the visitor
 *   cicadas   buzzing bursts at dusk
 *   chimes    rare, soft wind chimes (pentatonic, never clashes with music)
 *
 * Runs on its own channel straight to the speakers, so the music's reverb
 * and delay never touch it, and it dips while a song plays.
 */
export interface AmbientEngine {
  update(listener: { x: number; y: number; z: number; yaw: number }, volume: number, musicPlaying: boolean, active: boolean): void;
  /** Retro "item get" arpeggio for collectibles (not affected by the garden-sounds slider). */
  pickup(big: boolean): void;
}

function noiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  const rand = seededRandom('noise');
  for (let i = 0; i < length; i++) data[i] = rand() * 2 - 1;
  return buffer;
}

export function createAmbientEngine(ctx: AudioContext): AmbientEngine {
  const rand = seededRandom('ambient-events');
  const out = ctx.createGain();
  out.connect(ctx.destination);
  const noise = noiseBuffer(ctx, 3);

  const loopNoise = () => {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    src.loopStart = rand() * 2; // decorrelate the layers
    src.start();
    return src;
  };

  // --- wind
  const windGain = ctx.createGain();
  windGain.gain.value = 0;
  const windFilter = ctx.createBiquadFilter();
  windFilter.type = 'bandpass';
  windFilter.frequency.value = 420;
  windFilter.Q.value = 0.6;
  const windGust = ctx.createGain();
  windGust.gain.value = 0.6;
  loopNoise().connect(windFilter);
  windFilter.connect(windGust);
  windGust.connect(windGain);
  windGain.connect(out);

  // --- fountain, positioned at its real spot
  const fountainGain = ctx.createGain();
  fountainGain.gain.value = 0;
  const fountainHigh = ctx.createBiquadFilter();
  fountainHigh.type = 'highpass';
  fountainHigh.frequency.value = 900;
  const fountainLow = ctx.createBiquadFilter();
  fountainLow.type = 'lowpass';
  fountainLow.frequency.value = 4200;
  const fountainPanner = ctx.createPanner();
  fountainPanner.panningModel = 'equalpower';
  fountainPanner.distanceModel = 'inverse';
  fountainPanner.refDistance = 3;
  fountainPanner.rolloffFactor = 1.4;
  fountainPanner.positionX.value = 0;
  fountainPanner.positionY.value = 1;
  fountainPanner.positionZ.value = 0;
  loopNoise().connect(fountainHigh);
  fountainHigh.connect(fountainLow);
  fountainLow.connect(fountainGain);
  fountainGain.connect(fountainPanner);
  fountainPanner.connect(out);

  // --- creatures and chimes share a bus
  const lifeGain = ctx.createGain();
  lifeGain.gain.value = 0;
  lifeGain.connect(out);

  const placed = (x: number, y: number, z: number) => {
    const p = ctx.createPanner();
    p.panningModel = 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = 4;
    p.positionX.value = x;
    p.positionY.value = y;
    p.positionZ.value = z;
    p.connect(lifeGain);
    return p;
  };

  let listener = { x: 0, y: 1.6, z: 0, yaw: 0 };
  const around = (min: number, max: number) => {
    const a = rand() * Math.PI * 2;
    const r = min + rand() * (max - min);
    return [listener.x + Math.cos(a) * r, 2 + rand() * 4, listener.z + Math.sin(a) * r] as const;
  };

  function bird(): void {
    const dest = placed(...around(6, 18));
    const t0 = ctx.currentTime + 0.05;
    const notes = 2 + Math.floor(rand() * 4);
    const base = 2200 + rand() * 1600;
    for (let n = 0; n < notes; n++) {
      const t = t0 + n * (0.09 + rand() * 0.07);
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(base * (0.9 + rand() * 0.3), t);
      osc.frequency.exponentialRampToValueAtTime(base * (1.2 + rand() * 0.5), t + 0.07);
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(0.25, t + 0.01);
      env.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
      osc.connect(env);
      env.connect(dest);
      osc.start(t);
      osc.stop(t + 0.1);
    }
  }

  function cicadas(): void {
    const dest = placed(...around(8, 20));
    const t = ctx.currentTime + 0.05;
    const duration = 2 + rand() * 3;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 4800 + rand() * 1200;
    band.Q.value = 9;
    const buzz = ctx.createGain();
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 28 + rand() * 12;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.5;
    lfo.connect(lfoDepth);
    lfoDepth.connect(buzz.gain);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.18, t + 0.6);
    env.gain.setValueAtTime(0.18, t + duration - 0.8);
    env.gain.linearRampToValueAtTime(0, t + duration);
    src.connect(band);
    band.connect(buzz);
    buzz.connect(env);
    env.connect(dest);
    src.start(t, rand() * 2);
    lfo.start(t);
    src.stop(t + duration);
    lfo.stop(t + duration);
  }

  function chime(): void {
    const dest = placed(...around(4, 10));
    const t0 = ctx.currentTime + 0.05;
    const strikes = 2 + Math.floor(rand() * 3);
    for (let s = 0; s < strikes; s++) {
      const t = t0 + s * (0.25 + rand() * 0.5);
      const f = CHIME_NOTES[Math.floor(rand() * CHIME_NOTES.length)]!;
      for (const [mult, level] of [
        [1, 0.12],
        [2.76, 0.04],
        [5.4, 0.02],
      ] as const) {
        const osc = ctx.createOscillator();
        const env = ctx.createGain();
        osc.frequency.value = f * mult;
        env.gain.setValueAtTime(level, t);
        env.gain.exponentialRampToValueAtTime(0.0005, t + 2.5);
        osc.connect(env);
        env.connect(dest);
        osc.start(t);
        osc.stop(t + 2.6);
      }
    }
  }

  const next = { bird: 2, cicada: 6, chime: 20, gust: 0 };
  let lastTime = ctx.currentTime;

  return {
    update(l, volume, musicPlaying, active) {
      listener = l;
      const now = ctx.currentTime;
      const dt = Math.max(0, now - lastTime);
      lastTime = now;

      // Where the visitor's ears are, and which way they face.
      const L = ctx.listener;
      if (L.positionX) {
        L.positionX.value = l.x;
        L.positionY.value = l.y;
        L.positionZ.value = l.z;
        L.forwardX.value = -Math.sin(l.yaw);
        L.forwardY.value = 0;
        L.forwardZ.value = -Math.cos(l.yaw);
        L.upX.value = 0;
        L.upY.value = 1;
        L.upZ.value = 0;
      } else {
        // Older Safari
        (L as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(l.x, l.y, l.z);
        (L as unknown as { setOrientation(...v: number[]): void }).setOrientation(-Math.sin(l.yaw), 0, -Math.cos(l.yaw), 0, 1, 0);
      }

      const levels = ambientLevels(volume, musicPlaying, active);
      windGain.gain.setTargetAtTime(levels.wind, now, 0.5);
      fountainGain.gain.setTargetAtTime(levels.fountain, now, 0.5);
      lifeGain.gain.setTargetAtTime(levels.life, now, 0.5);
      if (!active || volume <= 0) return;

      // Wind gusts drift in and out.
      next.gust -= dt;
      if (next.gust <= 0) {
        next.gust = 3 + rand() * 5;
        windGust.gain.setTargetAtTime(0.35 + rand() * 0.9, now, 1.5);
        windFilter.frequency.setTargetAtTime(300 + rand() * 350, now, 2);
      }
      for (const kind of ['bird', 'cicada', 'chime'] as const) {
        next[kind] -= dt;
        if (next[kind] <= 0) {
          next[kind] = nextEventDelay(kind, rand);
          if (kind === 'bird') bird();
          else if (kind === 'cicada') cicadas();
          else chime();
        }
      }
    },

    pickup(big) {
      const t0 = ctx.currentTime + 0.01;
      const notes = big ? [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98] : [659.25, 987.77, 1318.5];
      notes.forEach((f, i) => {
        const t = t0 + i * 0.07;
        const osc = ctx.createOscillator();
        const env = ctx.createGain();
        osc.type = 'square'; // classic 8-bit chime
        osc.frequency.value = f;
        env.gain.setValueAtTime(0.09, t);
        env.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        osc.connect(env);
        env.connect(out);
        osc.start(t);
        osc.stop(t + 0.2);
      });
    },
  };
}

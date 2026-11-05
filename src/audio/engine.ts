import { CROSSFADE_SECONDS, CROSSFADE_STEPS, equalPowerPoints } from './fades.ts';
import { silentWavDataUri } from './silence.ts';

/**
 * The music engine.
 *
 *   deck A ─┐
 *           ├─▶ effects in ──[ reverb / delay (effects.ts) ]──▶ volume ──▶ analyser ──▶ speakers
 *   deck B ─┘
 *
 * The graph is built once (inside the PRESS START tap) and lives for the
 * whole visit. Songs stream through two <audio> "decks": the next song loads
 * on the idle deck and crossfades in, so switching flowers never cuts or
 * stutters. Original files are only ever read, never modified.
 */

export interface Track {
  id: string;
  url: string;
  title: string;
  artist: string;
  album: string;
  artwork?: string;
}

export type PlaybackStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'blocked';

export interface EngineState {
  status: PlaybackStatus;
  /** Song currently audible (or loading). */
  trackId: string | null;
  position: number;
  duration: number;
  /** Last load failure, shown in the player; playback of the previous song continues. */
  error: string | null;
}

/** Builds the reverb/delay chain (effects.ts) between the decks and the volume control. */
export type EffectsBuilder = (ctx: AudioContext, input: AudioNode, output: AudioNode) => void;

export interface AudioEnv {
  createContext(): AudioContext;
  createMediaElement(): HTMLAudioElement;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface AudioEngine {
  /** Call inside a user gesture (PRESS START). Safe to call repeatedly. */
  unlock(): void;
  play(track: Track): Promise<void>;
  pause(): void;
  resume(): void;
  toggle(): void;
  seek(seconds: number): void;
  setVolume(volume: number): void;
  setRate(rate: number, preservePitch: boolean): void;
  getState(): EngineState;
  subscribe(listener: (state: EngineState) => void): () => void;
  onEnded(listener: () => void): () => void;
  /** Available after unlock/first play; used by the visualizer and effects. */
  getAnalyser(): AnalyserNode | null;
  getContext(): AudioContext | null;
}

interface Deck {
  element: HTMLAudioElement;
  gain: GainNode;
}

export const LOAD_TIMEOUT_MS = 20000;

export function browserAudioEnv(): AudioEnv {
  return {
    createContext: () => {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      return new Ctor({ latencyHint: 'playback' });
    },
    createMediaElement: () => new Audio(),
    setTimeout: (fn, ms) => window.setTimeout(fn, ms),
    clearTimeout: (handle) => window.clearTimeout(handle as number),
  };
}

function applyRate(element: HTMLAudioElement, rate: number, preservePitch: boolean) {
  element.playbackRate = rate;
  // Browsers keep pitch by default; turning it off gives the "slowed" record sound.
  const el = element as HTMLAudioElement & { webkitPreservesPitch?: boolean; mozPreservesPitch?: boolean };
  el.preservesPitch = preservePitch;
  el.webkitPreservesPitch = preservePitch;
  el.mozPreservesPitch = preservePitch;
}

export function createAudioEngine(env: AudioEnv = browserAudioEnv(), buildEffects?: EffectsBuilder): AudioEngine {
  let ctx: AudioContext | null = null;
  let decks: [Deck, Deck] | null = null;
  let master: GainNode | null = null;
  let analyser: AnalyserNode | null = null;
  let active = 0;
  let requestId = 0;
  let current: Track | null = null;
  let volume = 0.8;
  let rate = 1;
  let preservePitch = true;
  let unlocked = false;
  const fadeTimers = new Set<unknown>();

  let state: EngineState = { status: 'idle', trackId: null, position: 0, duration: 0, error: null };
  const listeners = new Set<(s: EngineState) => void>();
  const endedListeners = new Set<() => void>();

  const setState = (patch: Partial<EngineState>) => {
    state = { ...state, ...patch };
    for (const l of listeners) l(state);
  };

  const activeDeck = () => decks?.[active];

  function makeDeck(context: AudioContext, input: AudioNode, index: number): Deck {
    const element = env.createMediaElement();
    // Media hosted on another domain must send CORS headers, or the browser
    // refuses to route it through Web Audio (it would play silence).
    element.crossOrigin = 'anonymous';
    element.preload = 'auto';
    applyRate(element, rate, preservePitch);
    const source = context.createMediaElementSource(element);
    const gain = context.createGain();
    gain.gain.value = 0;
    source.connect(gain);
    gain.connect(input);

    const isActive = () => active === index && current !== null;
    element.addEventListener('timeupdate', () => {
      if (isActive()) setState({ position: element.currentTime, duration: element.duration || state.duration });
    });
    element.addEventListener('durationchange', () => {
      if (isActive() && Number.isFinite(element.duration)) setState({ duration: element.duration });
    });
    element.addEventListener('ended', () => {
      if (isActive()) {
        setState({ status: 'paused', position: element.duration || state.position });
        for (const l of endedListeners) l();
      }
    });
    // Track pauses/plays from outside (lock screen, headphones, OS interruptions).
    element.addEventListener('pause', () => {
      if (isActive() && state.status === 'playing' && !element.ended) setState({ status: 'paused' });
    });
    element.addEventListener('play', () => {
      if (isActive() && state.status !== 'loading') setState({ status: 'playing' });
    });
    return { element, gain };
  }

  function ensureGraph(): void {
    if (ctx) return;
    ctx = env.createContext();
    const input = ctx.createGain();
    master = ctx.createGain();
    master.gain.value = volume;
    analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    if (buildEffects) buildEffects(ctx, input, master);
    else input.connect(master);
    master.connect(analyser);
    analyser.connect(ctx.destination);
    decks = [makeDeck(ctx, input, 0), makeDeck(ctx, input, 1)];
  }

  function resumeContext(): void {
    if (ctx && ctx.state !== 'running') void ctx.resume().catch(() => {});
  }

  function waitUntilPlayable(element: HTMLAudioElement): Promise<boolean> {
    return new Promise((resolve) => {
      if (element.readyState >= 3) return resolve(true);
      let timer: unknown;
      const done = (ok: boolean) => {
        element.removeEventListener('canplay', onReady);
        element.removeEventListener('error', onError);
        env.clearTimeout(timer);
        resolve(ok);
      };
      const onReady = () => done(true);
      const onError = () => done(false);
      element.addEventListener('canplay', onReady);
      element.addEventListener('error', onError);
      timer = env.setTimeout(() => done(false), LOAD_TIMEOUT_MS);
    });
  }

  /** Schedules an equal-power ramp starting from wherever the gain is right now. */
  function ramp(gain: GainNode, direction: 'in' | 'out'): void {
    const context = ctx!;
    const t0 = context.currentTime;
    const from = gain.gain.value;
    gain.gain.cancelScheduledValues(t0);
    gain.gain.setValueAtTime(from, t0);
    for (const [offset, value] of equalPowerPoints(CROSSFADE_SECONDS, CROSSFADE_STEPS, direction, from)) {
      gain.gain.linearRampToValueAtTime(value, t0 + offset);
    }
  }

  function crossfade(from: Deck, to: Deck): void {
    ramp(to.gain, 'in');
    ramp(from.gain, 'out');
    const timer = env.setTimeout(() => {
      fadeTimers.delete(timer);
      // Only silence the old deck if it hasn't been reused for a newer song.
      if (decks && from !== activeDeck()) from.element.pause();
    }, CROSSFADE_SECONDS * 1000 + 60);
    fadeTimers.add(timer);
  }

  const engine: AudioEngine = {
    unlock() {
      ensureGraph();
      resumeContext();
      if (unlocked || !decks) return;
      unlocked = true;
      const silent = silentWavDataUri();
      for (const deck of decks) {
        if (deck.element.src) continue;
        deck.element.src = silent;
        const p = deck.element.play();
        void p?.then(() => deck.element.pause()).catch(() => {});
      }
    },

    async play(track) {
      ensureGraph();
      resumeContext();
      const id = ++requestId;
      const previous = activeDeck()!;
      // The first song uses the active deck; later songs load on the idle one.
      const nextIndex = current ? 1 - active : active;
      const deck = decks![nextIndex]!;

      setState({ status: 'loading', trackId: track.id, position: 0, duration: 0, error: null });
      deck.element.pause();
      deck.element.src = track.url;
      applyRate(deck.element, rate, preservePitch);
      deck.element.load();

      const ok = await waitUntilPlayable(deck.element);
      if (id !== requestId) return; // a newer selection took over

      if (!ok) {
        // Keep whatever was already playing; just report the problem.
        const stillPlaying = current && previous !== deck && !previous.element.paused;
        setState({
          status: current ? (stillPlaying ? 'playing' : 'paused') : 'idle',
          trackId: current?.id ?? null,
          position: current ? previous.element.currentTime : 0,
          duration: current ? previous.element.duration || 0 : 0,
          error: `Couldn't load "${track.title}".`,
        });
        return;
      }

      deck.element.currentTime = 0;
      let blocked = false;
      try {
        await deck.element.play();
      } catch {
        // Autoplay refused (rare after PRESS START); the player shows a play button.
        blocked = true;
      }
      if (id !== requestId) {
        deck.element.pause();
        return;
      }

      if (previous !== deck) crossfade(previous, deck);
      else ramp(deck.gain, 'in');
      active = nextIndex;
      current = track;
      setState({
        status: blocked ? 'blocked' : 'playing',
        trackId: track.id,
        position: 0,
        duration: deck.element.duration || 0,
        error: null,
      });
    },

    pause() {
      const deck = activeDeck();
      if (!deck || !current) return;
      deck.element.pause();
      setState({ status: 'paused' });
    },

    resume() {
      const deck = activeDeck();
      if (!deck || !current) return;
      resumeContext();
      if (deck.element.ended) deck.element.currentTime = 0;
      if (deck.gain.gain.value < 0.99) ramp(deck.gain, 'in');
      void deck.element
        .play()
        .then(() => setState({ status: 'playing' }))
        .catch(() => setState({ status: 'blocked' }));
    },

    toggle() {
      if (state.status === 'playing' || state.status === 'loading') engine.pause();
      else engine.resume();
    },

    seek(seconds) {
      const deck = activeDeck();
      if (!deck || !current) return;
      const duration = deck.element.duration;
      const clamped = Math.max(0, Number.isFinite(duration) ? Math.min(seconds, duration) : seconds);
      deck.element.currentTime = clamped;
      setState({ position: clamped });
    },

    setVolume(v) {
      volume = Math.max(0, Math.min(1, v));
      if (master && ctx) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.03);
    },

    setRate(r, keepPitch) {
      rate = r;
      preservePitch = keepPitch;
      if (decks) for (const d of decks) applyRate(d.element, rate, preservePitch);
    },

    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onEnded(listener) {
      endedListeners.add(listener);
      return () => endedListeners.delete(listener);
    },
    getAnalyser: () => analyser,
    getContext: () => ctx,
  };
  return engine;
}

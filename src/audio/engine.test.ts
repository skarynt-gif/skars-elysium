import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAudioEngine, LOAD_TIMEOUT_MS, type AudioEnv, type Track } from './engine.ts';
import { equalPowerPoints } from './fades.ts';
import { silentWavBytes } from './silence.ts';

// ---------------------------------------------------------------------------
// A small simulated Web Audio + <audio> environment.
// Loads resolve when the test calls `flush()`; URLs containing "missing"
// fail to load, URLs containing "blocked" refuse to autoplay.
// ---------------------------------------------------------------------------

class FakeParam {
  value: number;
  events: { type: string; value: number; time: number }[] = [];
  constructor(value: number) {
    this.value = value;
  }
  cancelScheduledValues(time: number) {
    this.events = this.events.filter((e) => e.time < time);
  }
  setValueAtTime(value: number, time: number) {
    this.events.push({ type: 'set', value, time });
    this.value = value;
  }
  linearRampToValueAtTime(value: number, time: number) {
    this.events.push({ type: 'ramp', value, time });
  }
  setTargetAtTime(value: number, time: number) {
    this.events.push({ type: 'target', value, time });
  }
  /** Where the automation ends up. */
  get target() {
    return this.events.at(-1)?.value ?? this.value;
  }
}

class FakeNode {
  connections: FakeNode[] = [];
  connect(node: FakeNode) {
    this.connections.push(node);
    return node;
  }
  disconnect() {
    this.connections = [];
  }
}
class FakeGain extends FakeNode {
  gain = new FakeParam(1);
}

class FakeContext {
  currentTime = 0;
  state = 'suspended';
  destination = new FakeNode();
  resume() {
    this.state = 'running';
    return Promise.resolve();
  }
  createGain() {
    return new FakeGain();
  }
  createAnalyser() {
    return Object.assign(new FakeNode(), { fftSize: 2048 });
  }
  createMediaElementSource(element: FakeAudio) {
    const node = new FakeNode();
    element.sourceNode = node;
    return node;
  }
}

const pendingLoads: (() => void)[] = [];

class FakeAudio {
  src = '';
  currentTime = 0;
  duration = NaN;
  paused = true;
  ended = false;
  playbackRate = 1;
  preservesPitch = true;
  readyState = 0;
  crossOrigin: string | null = null;
  preload = '';
  sourceNode: FakeNode | null = null;
  private listeners = new Map<string, Set<() => void>>();
  addEventListener(type: string, fn: () => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(fn);
  }
  removeEventListener(type: string, fn: () => void) {
    this.listeners.get(type)?.delete(fn);
  }
  emit(type: string) {
    for (const fn of [...(this.listeners.get(type) ?? [])]) fn();
  }
  load() {
    this.readyState = 0;
    const src = this.src;
    pendingLoads.push(() => {
      if (this.src !== src) return; // replaced before it finished
      if (src.includes('missing')) return this.emit('error');
      this.readyState = 4;
      this.duration = 180;
      this.emit('durationchange');
      this.emit('canplay');
    });
  }
  play() {
    if (this.src.includes('blocked')) return Promise.reject(new Error('NotAllowedError'));
    this.paused = false;
    this.emit('play');
    return Promise.resolve();
  }
  pause() {
    if (!this.paused) {
      this.paused = true;
      this.emit('pause');
    }
  }
}

function setup() {
  pendingLoads.length = 0;
  const timers: (() => void)[] = [];
  let context!: FakeContext;
  const audios: FakeAudio[] = [];
  const env: AudioEnv = {
    createContext: () => (context = new FakeContext()) as unknown as AudioContext,
    createMediaElement: () => {
      const a = new FakeAudio();
      audios.push(a);
      return a as unknown as HTMLAudioElement;
    },
    setTimeout: (fn, ms) => {
      if (ms < LOAD_TIMEOUT_MS) timers.push(fn); // run crossfade timers on demand
      return fn;
    },
    clearTimeout: () => {},
  };
  const engine = createAudioEngine(env);
  /** Completes pending loads and lets promises settle. */
  const flush = async () => {
    for (let i = 0; i < 5; i++) {
      while (pendingLoads.length) pendingLoads.shift()!();
      await new Promise((r) => setImmediate(r));
    }
  };
  const runTimers = () => {
    while (timers.length) timers.shift()!();
  };
  return { engine, env, audios, flush, runTimers, ctx: () => context };
}

const track = (id: string, url = `https://media.example.com/${id}.mp3`): Track => ({
  id,
  url,
  title: id,
  artist: 'Artist',
  album: 'Album',
});

// ---------------------------------------------------------------------------

test('equal-power fades keep combined power steady', () => {
  const fadeIn = equalPowerPoints(1, 10, 'in');
  const fadeOut = equalPowerPoints(1, 10, 'out');
  fadeIn.forEach(([, a], i) => {
    const b = fadeOut[i]![1];
    assert.ok(Math.abs(a * a + b * b - 1) < 1e-9);
  });
  assert.equal(fadeIn.at(-1)![1], 1);
  assert.ok(Math.abs(fadeOut.at(-1)![1]) < 1e-9);
});

test('silent unlock clip is a valid WAV', () => {
  const bytes = silentWavBytes();
  const text = (a: number, b: number) => String.fromCharCode(...bytes.slice(a, b));
  assert.equal(text(0, 4), 'RIFF');
  assert.equal(text(8, 12), 'WAVE');
  assert.equal(text(36, 40), 'data');
  assert.ok(bytes.slice(44).every((b) => b === 0));
});

test('the graph is built once, on unlock, and the context is resumed', () => {
  const { engine, ctx, audios } = setup();
  assert.equal(engine.getContext(), null);
  engine.unlock();
  engine.unlock();
  assert.equal(audios.length, 2, 'two decks, created once');
  assert.equal(ctx().state, 'running');
  for (const a of audios) assert.equal(a.crossOrigin, 'anonymous');
});

test('first song loads, plays and fades in', async () => {
  const { engine, audios, flush } = setup();
  engine.unlock();
  const playing = engine.play(track('a'));
  assert.equal(engine.getState().status, 'loading');
  await flush();
  await playing;
  const s = engine.getState();
  assert.equal(s.status, 'playing');
  assert.equal(s.trackId, 'a');
  assert.equal(s.duration, 180);
  const deck = audios.find((a) => a.src.includes('a.mp3'))!;
  assert.equal(deck.paused, false);
});

test('switching flowers crossfades to the other deck, then stops the old one', async () => {
  const { engine, audios, flush, runTimers } = setup();
  engine.unlock();
  const first = engine.play(track('a'));
  await flush();
  await first;
  const second = engine.play(track('b'));
  await flush();
  await second;

  const [deckA, deckB] = audios.map((a) => a);
  const a = deckA!.src.includes('a.mp3') ? deckA! : deckB!;
  const b = a === deckA ? deckB! : deckA!;
  assert.ok(b.src.includes('b.mp3'));
  assert.equal(engine.getState().trackId, 'b');
  assert.equal(a.paused, false, 'old song still audible during the fade');
  runTimers();
  assert.equal(a.paused, true, 'old song stopped after the fade');
  assert.equal(b.paused, false);
});

test('rapid clicking: only the last selection plays', async () => {
  const { engine, audios, flush } = setup();
  engine.unlock();
  const a = engine.play(track('a'));
  const b = engine.play(track('b'));
  const c = engine.play(track('c'));
  await flush();
  await Promise.all([a, b, c]);
  assert.equal(engine.getState().trackId, 'c');
  assert.equal(engine.getState().status, 'playing');
  const audible = audios.filter((x) => !x.paused);
  assert.equal(audible.length, 1);
  assert.ok(audible[0]!.src.includes('c.mp3'));
});

test('a song that fails to load reports an error and the current song keeps playing', async () => {
  const { engine, audios, flush } = setup();
  engine.unlock();
  const ok = engine.play(track('a'));
  await flush();
  await ok;
  const bad = engine.play(track('broken', 'https://media.example.com/missing.mp3'));
  await flush();
  await bad;
  const s = engine.getState();
  assert.equal(s.trackId, 'a');
  assert.equal(s.status, 'playing');
  assert.match(s.error ?? '', /broken/);
  assert.ok(audios.some((x) => x.src.includes('a.mp3') && !x.paused));
});

test('the error clears when the next song loads', async () => {
  const { engine, flush } = setup();
  engine.unlock();
  const bad = engine.play(track('x', 'https://m/missing.mp3'));
  await flush();
  await bad;
  assert.equal(engine.getState().status, 'idle');
  const good = engine.play(track('a'));
  await flush();
  await good;
  assert.equal(engine.getState().error, null);
});

test('autoplay refusal shows a play button state; resume fixes it', async () => {
  const { engine, audios, flush } = setup();
  engine.unlock();
  const p = engine.play(track('a', 'https://m/blocked.mp3'));
  await flush();
  await p;
  assert.equal(engine.getState().status, 'blocked');
  audios.forEach((a) => (a.src = a.src.replace('blocked', 'ok')));
  engine.resume();
  await flush();
  assert.equal(engine.getState().status, 'playing');
});

test('pause, resume, toggle and seek act on the playing deck', async () => {
  const { engine, flush } = setup();
  engine.unlock();
  const p = engine.play(track('a'));
  await flush();
  await p;
  engine.pause();
  assert.equal(engine.getState().status, 'paused');
  engine.toggle();
  await flush();
  assert.equal(engine.getState().status, 'playing');
  engine.seek(999);
  assert.equal(engine.getState().position, 180, 'clamped to the song length');
  engine.seek(-5);
  assert.equal(engine.getState().position, 0);
});

test('volume and speed apply to the real audio path', async () => {
  const { engine, audios, flush } = setup();
  engine.unlock();
  const p = engine.play(track('a'));
  await flush();
  await p;
  engine.setRate(0.75, false);
  for (const a of audios) {
    assert.equal(a.playbackRate, 0.75);
    assert.equal(a.preservesPitch, false);
  }
  engine.setVolume(1.7);
  // Master gain is the node feeding the analyser: find it via the deck chain.
  const deckGain = audios[0]!.sourceNode!.connections[0]! as FakeGain;
  const input = deckGain.connections[0]!;
  const master = input.connections[0]! as FakeGain;
  assert.equal(master.gain.target, 1, 'volume clamped to 0..1');
});

test('end of song notifies listeners (for auto-advance)', async () => {
  const { engine, audios, flush } = setup();
  let ended = 0;
  engine.onEnded(() => ended++);
  engine.unlock();
  const p = engine.play(track('a'));
  await flush();
  await p;
  const deck = audios.find((a) => a.src.includes('a.mp3'))!;
  deck.ended = true;
  deck.emit('ended');
  assert.equal(ended, 1);
  // An "ended" from the idle deck is ignored.
  audios.find((a) => a !== deck)!.emit('ended');
  assert.equal(ended, 1);
});

test('state listeners receive updates and can unsubscribe', async () => {
  const { engine, flush } = setup();
  const seen: string[] = [];
  const off = engine.subscribe((s) => seen.push(s.status));
  engine.unlock();
  const p = engine.play(track('a'));
  await flush();
  await p;
  off();
  engine.pause();
  assert.deepEqual(seen.slice(0, 1), ['loading']);
  assert.ok(seen.includes('playing'));
  assert.ok(!seen.includes('paused'));
});

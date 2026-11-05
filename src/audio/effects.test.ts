import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEffectsChain } from './effects.ts';
import { DEFAULT_EFFECTS, MAX_FEEDBACK, PRESETS, delaySeconds, reverbSeconds, type EffectSettings } from './effectsMath.ts';

// --- Minimal simulated Web Audio graph -------------------------------------

class Param {
  value: number;
  target: number;
  constructor(v: number) {
    this.value = v;
    this.target = v;
  }
  setTargetAtTime(v: number) {
    this.target = v;
  }
  cancelScheduledValues() {}
  setValueAtTime(v: number) {
    this.value = v;
  }
  linearRampToValueAtTime(v: number) {
    this.target = v;
  }
}
class Node {
  name: string;
  out: Node[] = [];
  constructor(name: string) {
    this.name = name;
  }
  connect(n: Node) {
    this.out.push(n);
    return n;
  }
}
class Gain extends Node {
  gain = new Param(1);
}
class Convolver extends Node {
  normalize = false;
  buffer: { length: number; channels: Float32Array[] } | null = null;
}
class Delay extends Node {
  delayTime = new Param(0);
  maxDelay: number;
  constructor(maxDelay: number) {
    super('delay');
    this.maxDelay = maxDelay;
  }
}
class Biquad extends Node {
  type = '';
  frequency = new Param(350);
  Q = new Param(1);
}
class Ctx {
  currentTime = 0;
  sampleRate = 4000; // small, keeps impulse generation fast in tests
  createGain = () => new Gain('gain');
  createConvolver = () => new Convolver('convolver');
  createDelay = (max: number) => new Delay(max);
  createBiquadFilter = () => new Biquad('filter');
  createBuffer = (channels: number, length: number) => {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { length, channels: data, copyToChannel: (src: Float32Array, ch: number) => data[ch]!.set(src) };
  };
}

function build(initial: EffectSettings = DEFAULT_EFFECTS) {
  const ctx = new Ctx();
  const input = new Node('input');
  const output = new Node('output');
  const timers: (() => void)[] = [];
  const chain = createEffectsChain(ctx as unknown as AudioContext, input as unknown as AudioNode, output as unknown as AudioNode, initial, {
    setTimeout: (fn) => {
      timers.push(fn);
      return fn;
    },
    clearTimeout: (h) => {
      const i = timers.indexOf(h as () => void);
      if (i >= 0) timers.splice(i, 1);
    },
  });
  const [dry, reverbSend, delaySend] = input.out as [Gain, Gain, Gain];
  const convolvers = reverbSend.out as Convolver[];
  const convGains = convolvers.map((c) => c.out[0] as Gain);
  const delay = delaySend.out[0] as Delay;
  const tone = delay.out[0] as Biquad;
  const feedback = tone.out.find((n) => n !== output) as Gain;
  const runTimers = () => {
    while (timers.length) timers.shift()!();
  };
  return { chain, input, output, dry, reverbSend, delaySend, convolvers, convGains, delay, tone, feedback, runTimers, timers };
}

/** Every node reachable from `from` (to confirm everything ends at the output). */
function reaches(from: Node, to: Node, seen = new Set<Node>()): boolean {
  if (from === to) return true;
  if (seen.has(from)) return false;
  seen.add(from);
  return from.out.some((n) => reaches(n, to, seen));
}

// ---------------------------------------------------------------------------

test('all three paths (dry, reverb, delay) reach the output', () => {
  const g = build();
  assert.ok(reaches(g.dry, g.output));
  assert.ok(g.convolvers.every((c) => reaches(c, g.output)));
  assert.ok(reaches(g.delay, g.output));
});

test('the delay loop feeds back through the tone filter', () => {
  const g = build();
  assert.ok(g.feedback.out.includes(g.delay), 'feedback returns into the delay');
  assert.equal(g.tone.type, 'lowpass');
});

test('with default settings the song passes through untouched', () => {
  const g = build();
  assert.equal(g.dry.gain.target, 1);
  assert.equal(g.reverbSend.gain.target, 0);
  assert.equal(g.delaySend.gain.target, 0);
});

test('mix knobs drive the real gain nodes', () => {
  const g = build();
  g.chain.apply({ ...DEFAULT_EFFECTS, reverbMix: 0.5, delayMix: 0.25 });
  assert.ok(g.reverbSend.gain.target > 0.6 && g.reverbSend.gain.target < 0.8);
  assert.ok(g.delaySend.gain.target > 0.3 && g.delaySend.gain.target < 0.45);
  assert.ok(g.dry.gain.target < 1);
});

test('delay time and feedback map to real values, with feedback capped', () => {
  const g = build();
  g.chain.apply({ ...DEFAULT_EFFECTS, delayTime: 1, delayFeedback: 1 });
  assert.ok(Math.abs(g.delay.delayTime.target - delaySeconds(1)) < 1e-9);
  assert.ok(g.delay.maxDelay >= delaySeconds(1), 'delay line long enough');
  assert.equal(g.feedback.gain.target, MAX_FEEDBACK);
});

test('starts with a real reverb space sized to the setting', () => {
  const g = build({ ...DEFAULT_EFFECTS, reverbSize: 0.3 });
  const buffer = g.convolvers[0]!.buffer!;
  assert.equal(buffer.length, Math.ceil(4000 * reverbSeconds(0.3)));
  assert.ok(buffer.channels[0]!.some((v) => v !== 0));
  assert.equal(g.convGains[0]!.gain.value, 1);
  assert.equal(g.convGains[1]!.gain.value, 0);
});

test('changing reverb size waits for the slider, then crossfades to a new space', () => {
  const g = build({ ...DEFAULT_EFFECTS, reverbSize: 0.2 });
  // Dragging the slider: several quick changes, only the last builds.
  g.chain.apply({ ...DEFAULT_EFFECTS, reverbSize: 0.4 });
  g.chain.apply({ ...DEFAULT_EFFECTS, reverbSize: 0.6 });
  g.chain.apply({ ...DEFAULT_EFFECTS, reverbSize: 0.9 });
  assert.equal(g.timers.length, 1, 'one pending rebuild');
  g.runTimers();
  const newBuffer = g.convolvers[1]!.buffer!;
  assert.equal(newBuffer.length, Math.ceil(4000 * reverbSeconds(0.9)));
  assert.equal(g.convGains[1]!.gain.target, 1, 'new space fades in');
  assert.equal(g.convGains[0]!.gain.target, 0, 'old space fades out');
});

test('every preset applies cleanly', () => {
  const g = build();
  for (const p of PRESETS) assert.doesNotThrow(() => g.chain.apply(p.settings), p.id);
});

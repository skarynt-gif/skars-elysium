import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_EFFECTS,
  MAX_FEEDBACK,
  PRESETS,
  SPEED_OPTIONS,
  delaySeconds,
  feedbackGain,
  generateImpulse,
  matchingPreset,
  mixGains,
  parseEffects,
  reverbSeconds,
  reverbSpaceName,
} from './effectsMath.ts';

test('speed options are exactly the six requested', () => {
  assert.deepEqual([...SPEED_OPTIONS], [0.5, 0.75, 1, 1.25, 1.5, 2]);
});

test('wet/dry is equal-power for each effect alone', () => {
  for (let m = 0; m <= 1.0001; m += 0.1) {
    const r = mixGains(m, 0);
    assert.ok(Math.abs(r.dry ** 2 + r.reverb ** 2 - 1) < 1e-9);
    const d = mixGains(0, m);
    assert.ok(Math.abs(d.dry ** 2 + d.delay ** 2 - 1) < 1e-9);
  }
});

test('at zero mix the effects are fully off and the song is untouched', () => {
  assert.deepEqual(mixGains(0, 0), { dry: 1, reverb: 0, delay: 0 });
});

test('mix values are clamped', () => {
  const g = mixGains(5, -2);
  assert.ok(g.reverb <= 1 && g.delay === 0 && g.dry >= 0);
});

test('reverb size spans a courtyard to a temple', () => {
  assert.ok(reverbSeconds(0) < 1);
  assert.ok(reverbSeconds(1) >= 5.5);
  assert.ok(reverbSeconds(0.3) < reverbSeconds(0.6));
  assert.equal(reverbSpaceName(0), 'COURTYARD');
  assert.equal(reverbSpaceName(1), 'TEMPLE');
});

test('delay time goes from slapback to long echo', () => {
  assert.ok(Math.abs(delaySeconds(0) - 0.08) < 1e-9);
  assert.ok(Math.abs(delaySeconds(1) - 0.9) < 1e-9);
});

test('feedback can never reach runaway levels', () => {
  assert.equal(feedbackGain(1), MAX_FEEDBACK);
  assert.ok(feedbackGain(99) < 1);
  assert.equal(feedbackGain(-1), 0);
});

test('impulse response decays to near silence and is stereo', () => {
  const sr = 8000;
  const [l, r] = generateImpulse(sr, 2);
  assert.equal(l.length, 16000);
  const energy = (a: Float32Array, from: number, to: number) => {
    let e = 0;
    for (let i = from; i < to; i++) e += a[i]! ** 2;
    return e;
  };
  const head = energy(l, 0, 1600);
  const tail = energy(l, 14400, 16000);
  assert.ok(tail < head * 0.001, `tail ${tail} vs head ${head}`);
  assert.ok(l.every(Number.isFinite) && r.every(Number.isFinite));
  let different = 0;
  for (let i = 0; i < 2000; i++) if (l[i] !== r[i]) different++;
  assert.ok(different > 1500, 'left and right differ (wide stereo)');
});

test('impulse responses are deterministic', () => {
  assert.deepEqual(generateImpulse(4000, 0.5)[0], generateImpulse(4000, 0.5)[0]);
});

test('presets are valid and include Slowed + Reverb', () => {
  for (const p of PRESETS) {
    assert.deepEqual(parseEffects(p.settings), p.settings, p.id);
  }
  const slowed = PRESETS.find((p) => p.id === 'slowed')!.settings;
  assert.equal(slowed.speed, 0.75);
  assert.equal(slowed.preservePitch, false);
  assert.ok(slowed.reverbMix > 0);
});

test('saved effects are validated', () => {
  assert.deepEqual(parseEffects(null), DEFAULT_EFFECTS);
  const p = parseEffects({ speed: 3, reverbMix: 7, preservePitch: 'no', delayMix: 0.2 });
  assert.equal(p.speed, 1);
  assert.equal(p.reverbMix, 1);
  assert.equal(p.preservePitch, true);
  assert.equal(p.delayMix, 0.2);
});

test('the active preset is recognised until a knob moves', () => {
  const temple = PRESETS.find((p) => p.id === 'temple')!.settings;
  assert.equal(matchingPreset(temple), 'temple');
  assert.equal(matchingPreset({ ...temple, delayMix: 0.31 }), null);
  assert.equal(matchingPreset(DEFAULT_EFFECTS), 'dry');
});

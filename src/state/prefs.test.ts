import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PREFS, parsePrefs, serializePrefs } from './prefs.ts';

test('round-trips saved preferences', () => {
  const prefs = {
    lookSensitivity: 1.6,
    invertY: true,
    headBob: false,
    quality: 'low' as const,
    volume: 0.35,
    ambientVolume: 0.2,
    effects: { ...DEFAULT_PREFS.effects, reverbMix: 0.4, speed: 0.75 as const, preservePitch: false },
  };
  assert.deepEqual(parsePrefs(serializePrefs(prefs)), prefs);
});

test('missing or corrupt data falls back to defaults', () => {
  assert.deepEqual(parsePrefs(null), DEFAULT_PREFS);
  assert.deepEqual(parsePrefs('{not json'), DEFAULT_PREFS);
  assert.deepEqual(parsePrefs('42'), DEFAULT_PREFS);
});

test('out-of-range values are clamped; wrong types ignored', () => {
  const p = parsePrefs(JSON.stringify({ lookSensitivity: 99, volume: -3, invertY: 'yes', quality: 'ultra' }));
  assert.equal(p.lookSensitivity, 2.5);
  assert.equal(p.volume, 0);
  assert.equal(p.invertY, false);
  assert.equal(p.quality, 'auto');
});

test('partial saves keep the other defaults', () => {
  const p = parsePrefs(JSON.stringify({ volume: 0.5 }));
  assert.equal(p.volume, 0.5);
  assert.equal(p.headBob, DEFAULT_PREFS.headBob);
});

test('custom defaults (e.g. reduced motion) apply when nothing was saved', () => {
  assert.equal(parsePrefs(null, { ...DEFAULT_PREFS, headBob: false }).headBob, false);
});

test('saved effects survive a reload and bad values are repaired', () => {
  const p = parsePrefs(JSON.stringify({ effects: { speed: 9, delayFeedback: 0.5 } }));
  assert.equal(p.effects.speed, 1);
  assert.equal(p.effects.delayFeedback, 0.5);
});

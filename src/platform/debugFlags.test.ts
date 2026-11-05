import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDebugFlags } from './debugFlags.ts';

test('everything on by default, debug panel only in dev', () => {
  assert.deepEqual(parseDebugFlags('', false), {
    debug: false,
    retro: true,
    wobble: true,
    dither: true,
    skipIntro: false,
    orbit: false,
  });
  assert.equal(parseDebugFlags('', true).debug, true);
});

test('URL switches turn individual effects off', () => {
  const flags = parseDebugFlags('?debug&retro=off&dither=off', false);
  assert.deepEqual(flags, { debug: true, retro: false, wobble: true, dither: false, skipIntro: false, orbit: false });
});

test('only the exact value "off" disables an effect', () => {
  assert.equal(parseDebugFlags('?wobble=no', false).wobble, true);
  assert.equal(parseDebugFlags('?wobble=off', false).wobble, false);
});

test('development camera switches', () => {
  const flags = parseDebugFlags('?skipintro&orbit', false);
  assert.equal(flags.skipIntro, true);
  assert.equal(flags.orbit, true);
});

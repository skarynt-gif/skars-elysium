import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UNFOLD_SECONDS, unfoldTransform } from './celebrations.ts';

test('no celebration means no change', () => {
  assert.deepEqual(unfoldTransform(undefined, 5), { scale: 1, spin: 0 });
});

test('unfold grows from a speck, overshoots, and settles exactly', () => {
  const start = 10;
  assert.ok(unfoldTransform(start, start).scale < 0.2);
  let peak = 0;
  for (let t = 0; t <= UNFOLD_SECONDS; t += 0.01) peak = Math.max(peak, unfoldTransform(start, start + t).scale);
  assert.ok(peak > 1.05 && peak < 1.4, `peak ${peak}`);
  assert.deepEqual(unfoldTransform(start, start + UNFOLD_SECONDS), { scale: 1, spin: 0 });
});

test('spins two full turns, ending facing forward', () => {
  const near = unfoldTransform(0, UNFOLD_SECONDS - 0.001).spin;
  assert.ok(Math.abs(near - Math.PI * 4) < 0.01);
});

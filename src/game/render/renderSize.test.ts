import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeRenderSize } from './renderSize.ts';

test('uses a whole-number scale and stays close to the target height', () => {
  const r = computeRenderSize(1920, 1080, 320);
  assert.ok(Number.isInteger(r.scale));
  assert.equal(r.scale, 3);
  assert.equal(r.height, 360);
  assert.equal(r.width, 640);
});

test('frame always covers the whole screen', () => {
  for (const [w, h] of [
    [1366, 768],
    [390, 844],
    [844, 390],
    [2560, 1440],
    [1001, 667],
  ] as const) {
    for (const target of [240, 320, 448]) {
      const r = computeRenderSize(w, h, target);
      assert.ok(r.width * r.scale >= w, `width covers ${w}x${h}@${target}`);
      assert.ok(r.height * r.scale >= h, `height covers ${w}x${h}@${target}`);
      // ...without wasting more than one retro pixel per axis.
      assert.ok((r.width - 1) * r.scale < w);
      assert.ok((r.height - 1) * r.scale < h);
    }
  }
});

test('landscape phone gets a chunky but readable frame', () => {
  const r = computeRenderSize(844, 390, 240);
  assert.equal(r.scale, 2);
  assert.equal(r.height, 195);
});

test('small viewports never go below scale 1 or size 1', () => {
  assert.deepEqual(computeRenderSize(100, 80, 240), { width: 100, height: 80, scale: 1 });
  assert.deepEqual(computeRenderSize(0, 0, 240), { width: 1, height: 1, scale: 1 });
});

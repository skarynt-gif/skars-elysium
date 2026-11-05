import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MOUNTAIN_LAYERS, mountainProfile, sunDirection } from './atmosphere.ts';

test('sun direction is a unit vector, low and in the north-west', () => {
  const [x, y, z] = sunDirection();
  assert.ok(Math.abs(Math.hypot(x, y, z) - 1) < 1e-9);
  assert.ok(y > 0 && y < 0.2, 'low above the horizon');
  assert.ok(x < 0 && z < 0, 'north-west (−x, −z)');
});

test('mountain rings close seamlessly and stay within their height range', () => {
  for (const layer of MOUNTAIN_LAYERS) {
    const heights = mountainProfile(layer, 96);
    assert.equal(heights.length, 97);
    assert.equal(heights[0], heights[96]);
    for (const h of heights) assert.ok(h >= layer.minHeight && h <= layer.maxHeight, `${layer.seed}: ${h}`);
  }
});

test('mountains have real ridges, not a flat band', () => {
  for (const layer of MOUNTAIN_LAYERS) {
    const heights = mountainProfile(layer, 96);
    const range = Math.max(...heights) - Math.min(...heights);
    assert.ok(range > (layer.maxHeight - layer.minHeight) * 0.4, layer.seed);
  }
});

test('far layers are taller, so every layer peeks over the one in front', () => {
  // Compare apparent elevation angles: height / radius.
  const angles = MOUNTAIN_LAYERS.map((l) => Math.max(...mountainProfile(l, 96)) / l.radius);
  assert.ok(angles[0]! > angles[2]!);
});

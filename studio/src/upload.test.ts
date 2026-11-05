import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coverCrop, formatBytes, formatDuration } from './upload.ts';

test('artwork is center-cropped to a square', () => {
  assert.deepEqual(coverCrop(1200, 800), { sx: 200, sy: 0, size: 800 });
  assert.deepEqual(coverCrop(500, 900), { sx: 0, sy: 200, size: 500 });
  assert.deepEqual(coverCrop(600, 600), { sx: 0, sy: 0, size: 600 });
});

test('sizes and lengths read naturally', () => {
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(2048), '2 KB');
  assert.equal(formatBytes(5.5 * 1024 * 1024), '5.5 MB');
  assert.equal(formatDuration(185.4), '3:05');
  assert.equal(formatDuration(null), '');
});

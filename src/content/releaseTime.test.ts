import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeReleaseDate } from './releaseTime.ts';

const NY = 'America/New_York';

test('date-only means midnight in the release zone (winter, UTC-5)', () => {
  assert.equal(normalizeReleaseDate('2026-12-04', NY), '2026-12-04T05:00:00.000Z');
});

test('date-only respects daylight saving (summer, UTC-4)', () => {
  assert.equal(normalizeReleaseDate('2026-07-10', NY), '2026-07-10T04:00:00.000Z');
});

test('explicit offsets are honoured exactly', () => {
  assert.equal(normalizeReleaseDate('2026-12-04T09:30:00-08:00', NY), '2026-12-04T17:30:00.000Z');
  assert.equal(normalizeReleaseDate('2026-12-04T00:00Z', NY), '2026-12-04T00:00:00.000Z');
});

test('times without an offset are rejected as ambiguous', () => {
  assert.equal(normalizeReleaseDate('2026-12-04T00:00:00', NY), null);
});

test('nonsense is rejected', () => {
  assert.equal(normalizeReleaseDate('soon', NY), null);
  assert.equal(normalizeReleaseDate('2026-13-45', NY), null);
});

test('impossible calendar dates are rejected in both formats', () => {
  assert.equal(normalizeReleaseDate('2026-02-30', NY), null);
  assert.equal(normalizeReleaseDate('2026-02-30T00:00:00-05:00', NY), null);
  assert.equal(normalizeReleaseDate('2028-02-29', NY), '2028-02-29T05:00:00.000Z');
});

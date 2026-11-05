import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Collection, Manifest, Song } from './types.ts';
import { countdown, formatCountdown, lushness, newlyBloomed, nextReleaseAt, releaseTimerDelay, updateSeenBuds } from './releases.ts';

const NOW = Date.parse('2026-11-01T12:00:00Z');
const col = (id: string, autoBloom: boolean): Collection => ({ id, title: id, type: 'ep', area: 'ep-garden', autoBloom, order: 0 });
const song = (id: string, collectionId: string, status: Song['status'], releaseDate?: string): Song => ({
  id,
  title: id,
  artist: 'A',
  collectionId,
  genre: 'rnb',
  status,
  order: 0,
  ...(releaseDate ? { releaseDate } : {}),
});

const manifest: Manifest = {
  version: 1,
  collections: [col('auto', true), col('manual', false)],
  songs: [
    song('past', 'auto', 'upcoming', '2026-10-01T00:00:00Z'),
    song('soon', 'auto', 'upcoming', '2026-11-03T05:00:00Z'),
    song('later', 'auto', 'upcoming', '2026-12-01T05:00:00Z'),
    song('manual-soon', 'manual', 'upcoming', '2026-11-02T00:00:00Z'),
    song('out', 'auto', 'released'),
  ],
};

test('next release is the earliest future auto-bloom date', () => {
  assert.equal(nextReleaseAt(manifest, NOW), Date.parse('2026-11-03T05:00:00Z'));
});

test('no next release when nothing is scheduled', () => {
  assert.equal(nextReleaseAt({ ...manifest, songs: [] }, NOW), null);
});

test('timer wakes at the release moment, but at least hourly', () => {
  assert.equal(releaseTimerDelay(NOW + 5000, NOW), 5250);
  assert.equal(releaseTimerDelay(NOW + 40 * 86400000, NOW), 3600000 + 250);
  assert.equal(releaseTimerDelay(null, NOW), null);
});

test('countdown breaks time into days, hours, minutes, seconds', () => {
  const ms = ((2 * 24 + 3) * 3600 + 4 * 60 + 5) * 1000 + 999;
  assert.deepEqual(countdown(ms), { days: 2, hours: 3, minutes: 4, seconds: 5, done: false });
  assert.equal(formatCountdown(ms), '2D 03H 04M 05S');
  assert.equal(formatCountdown(65_000), '00H 01M 05S');
  assert.equal(countdown(-5).done, true);
});

test('blooms a visitor saw as buds are celebrated once', () => {
  const seen = new Set(['soon', 'other']);
  const flowers = [
    { song: { id: 'soon' }, state: 'bloom' as const },
    { song: { id: 'later' }, state: 'bud' as const },
    { song: { id: 'out' }, state: 'bloom' as const },
  ];
  const fresh = newlyBloomed(seen, flowers);
  assert.deepEqual(fresh, ['soon']);
  const next = updateSeenBuds(seen, flowers, fresh);
  assert.deepEqual([...next].sort(), ['later'], 'remembers new buds, forgets celebrated and removed songs');
  assert.deepEqual(newlyBloomed(next, flowers), []);
});

test('first-time visitors get no celebration (they never saw the bud)', () => {
  assert.deepEqual(newlyBloomed(new Set(), [{ song: { id: 'out' }, state: 'bloom' }]), []);
});

test('teaser sprouts count as seen too', () => {
  const next = updateSeenBuds(new Set(), [{ song: { id: 't' }, state: 'sprout' }], []);
  assert.ok(next.has('t'));
});

test('the garden grows lusher with more releases, within limits', () => {
  const base = lushness({ ...manifest, songs: [] });
  const grown = lushness({ ...manifest, songs: Array.from({ length: 25 }, (_, i) => song(`s${i}`, 'auto', 'released')) });
  const huge = lushness({ ...manifest, songs: Array.from({ length: 500 }, (_, i) => song(`s${i}`, 'auto', 'released')) });
  assert.equal(base, 0.75);
  assert.ok(grown > base);
  assert.ok(Math.abs(huge - 1.35) < 1e-9);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatMoment,
  groupByBed,
  issueWhere,
  plural,
  releaseChoice,
  releaseChoiceFields,
  songAdvice,
  songBadge,
  timeAgo,
  toLocalInputs,
  zoneAbbreviation,
} from './format.ts';
import type { CollectionRow, SongRow } from '../server/mapping.ts';

const NOW = Date.parse('2026-10-30T20:00:00Z');

test('song badges', () => {
  assert.deepEqual(songBadge({ status: 'released', teaser: 0, release_date: null }), { label: 'Released', tone: 'live' });
  assert.deepEqual(songBadge({ status: 'unreleased', teaser: 0, release_date: null }), { label: 'Unreleased', tone: 'vault' });
  // Midnight New York on Dec 4 is 05:00 UTC.
  assert.deepEqual(songBadge({ status: 'upcoming', teaser: 0, release_date: '2026-12-04T05:00:00.000Z' }, NOW), {
    label: 'Upcoming · Dec 4, 2026',
    tone: 'soon',
  });
  assert.equal(songBadge({ status: 'upcoming', teaser: 1, release_date: '2026-12-04T05:00:00.000Z' }, NOW).tone, 'secret');
  assert.equal(songBadge({ status: 'upcoming', teaser: 0, release_date: null }, NOW).label, 'Upcoming');
  assert.equal(songBadge({ status: 'upcoming', teaser: 0, release_date: '2026-10-01T04:00:00.000Z' }, NOW).tone, 'live');
});

test('dates show in the release time zone', () => {
  assert.equal(formatMoment('2026-12-04T05:00:00.000Z'), 'Dec 4, 2026, 12:00 AM');
  assert.equal(formatMoment('not a date'), 'not a date');
});

test('relative times', () => {
  const ago = (s: number) => timeAgo(new Date(NOW - s * 1000).toISOString(), NOW);
  assert.equal(ago(10), 'just now');
  assert.equal(ago(60), '1 minute ago');
  assert.equal(ago(5 * 60), '5 minutes ago');
  assert.equal(ago(2 * 3600), '2 hours ago');
  assert.equal(ago(86400), '1 day ago');
  assert.match(ago(40 * 86400), /2026/);
});

test('songs grouped under their beds, empty beds kept', () => {
  const bed = (id: string) => ({ id }) as CollectionRow;
  const song = (id: string, c: string) => ({ id, collection_id: c }) as SongRow;
  const groups = groupByBed([bed('a'), bed('b')], [song('1', 'a'), song('2', 'a')]);
  assert.deepEqual(groups.map((g) => [g.bed.id, g.songs.map((s) => s.id)]), [['a', ['1', '2']], ['b', []]]);
});

test('friendly issue locations', () => {
  assert.equal(issueWhere({ severity: 'error', path: 'songs[3] "slow-burn"', message: '' }), 'Song “slow-burn”');
  assert.equal(issueWhere({ severity: 'warning', path: 'collections "demo-ep"', message: '' }), 'Bed “demo-ep”');
  assert.equal(issueWhere({ severity: 'error', path: 'manifest.version', message: '' }), 'Garden');
  assert.equal(plural(1, 'song'), '1 song');
  assert.equal(plural(3, 'bed'), '3 beds');
});

test('release moments round-trip through the date/time inputs', () => {
  assert.deepEqual(toLocalInputs('2026-12-05T02:30:00.000Z'), { date: '2026-12-04', time: '21:30' });
  assert.deepEqual(toLocalInputs('2026-07-04T16:00:00.000Z'), { date: '2026-07-04', time: '12:00' });
  assert.deepEqual(toLocalInputs(null), { date: '', time: '' });
  assert.equal(zoneAbbreviation('2026-12-05T02:30:00.000Z'), 'EST');
  assert.equal(zoneAbbreviation('2026-07-04T16:00:00.000Z'), 'EDT');
});

test('release choices map to status + teaser', () => {
  assert.equal(releaseChoice({ status: 'upcoming', teaser: 1 }), 'teaser');
  assert.equal(releaseChoice({ status: 'upcoming', teaser: 0 }), 'upcoming');
  assert.deepEqual(releaseChoiceFields('teaser'), { status: 'upcoming', teaser: true });
  assert.deepEqual(releaseChoiceFields('released'), { status: 'released', teaser: false });
});

test('song advice covers leaks and timing', () => {
  const base = { status: 'upcoming', teaser: 0, audio: null, release_date: null } as unknown as SongRow;
  assert.match(songAdvice(base, true)[0]!, /No release date/);
  assert.match(songAdvice({ ...base, audio: 'media/audio/x.mp3' }, true)[0]!, /download/);
  assert.match(songAdvice({ ...base, release_date: '2027-01-01T05:00:00.000Z' }, true, NOW)[0]!, /no full track/);
  assert.match(songAdvice({ ...base, release_date: '2026-10-01T04:00:00.000Z', audio: 'media/audio/x.mp3' }, false, NOW)[1]!, /auto-bloom is off/);
  assert.deepEqual(songAdvice({ ...base, status: 'released', audio: 'media/audio/x.mp3' }, false), []);
});

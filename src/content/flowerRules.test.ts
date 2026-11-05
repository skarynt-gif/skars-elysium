import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bloomState, flowerSpecies, flowerVariant } from './flowerRules.ts';
import type { Collection, Song } from './types.ts';

const bed: Collection = { id: 'bed', title: 'Bed', type: 'ep', area: 'ep-garden', autoBloom: true, order: 0 };
const base: Song = {
  id: 'first-light',
  title: 'First Light',
  artist: 'Artist',
  collectionId: 'bed',
  genre: 'melodic-rap',
  status: 'upcoming',
  releaseDate: '2026-12-04T05:00:00.000Z',
  order: 0,
};
const BEFORE = Date.parse('2026-12-04T04:59:59Z');
const AFTER = Date.parse('2026-12-04T05:00:00Z');

test('upcoming songs are buds until release, then bloom when autoBloom is on', () => {
  assert.equal(bloomState(base, bed, BEFORE), 'bud');
  assert.equal(bloomState(base, bed, AFTER), 'bloom');
});

test('without autoBloom, only a manifest status change blooms the flower', () => {
  assert.equal(bloomState(base, { ...bed, autoBloom: false }, AFTER), 'bud');
  assert.equal(bloomState({ ...base, status: 'released' }, { ...bed, autoBloom: false }, BEFORE), 'bloom');
});

test('upcoming songs without a date stay buds', () => {
  const { releaseDate: _omit, ...noDate } = base;
  assert.equal(bloomState(noDate, bed, AFTER), 'bud');
});

test('unreleased songs are ghosts', () => {
  assert.equal(bloomState({ ...base, status: 'unreleased' }, bed, AFTER), 'ghost');
});

test('species come from genre, with asphodel for the vault and manual overrides winning', () => {
  assert.equal(flowerSpecies({ ...base, genre: 'rnb' }), 'rose');
  assert.equal(flowerSpecies({ ...base, genre: 'psychedelic' }), 'spiral');
  assert.equal(flowerSpecies({ ...base, genre: 'melodic-rap' }), 'iris');
  assert.equal(flowerSpecies({ ...base, genre: 'rage' }), 'thistle');
  assert.equal(flowerSpecies({ ...base, status: 'unreleased' }), 'asphodel');
  assert.equal(flowerSpecies({ ...base, flower: { species: 'lily' } }), 'lily');
});

test('variants are stable for the same song and differ between songs', () => {
  assert.deepEqual(flowerVariant(base), flowerVariant({ ...base }));
  assert.notDeepEqual(flowerVariant(base), flowerVariant({ ...base, id: 'sun-dial' }));
});

test('variants stay within their ranges across many songs', () => {
  for (let i = 0; i < 500; i++) {
    const v = flowerVariant({ ...base, id: `song-${i}` });
    assert.ok(v.hueShift >= -14 && v.hueShift <= 14);
    assert.ok(v.heightScale >= 0.85 && v.heightScale <= 1.15);
    assert.ok(v.petalCount >= 5 && v.petalCount <= 8);
    assert.ok(Math.abs(v.lean) <= 0.15);
  }
});

test('manual hue and scale overrides apply', () => {
  const plain = flowerVariant(base);
  const custom = flowerVariant({ ...base, flower: { hue: 90, scale: 2 } });
  assert.equal(custom.hueShift, 90);
  assert.ok(Math.abs(custom.heightScale - plain.heightScale * 2) < 1e-9);
});

test('released songs offer LISTEN; teasers offer PREVIEW; otherwise DETAILS', async () => {
  const { songAction, playableUrl } = await import('./flowerRules.ts');
  const released = { ...base, status: 'released' as const, audio: 'a.mp3' };
  assert.equal(songAction(released, 'bloom'), 'LISTEN');
  assert.equal(playableUrl(released, 'bloom'), 'a.mp3');

  const teaser = { ...base, preview: 'p.mp3' };
  assert.equal(songAction(teaser, 'bud'), 'PREVIEW');
  assert.equal(playableUrl(teaser, 'bud'), 'p.mp3');

  assert.equal(songAction(base, 'bud'), 'DETAILS');
  assert.equal(playableUrl(base, 'bud'), null);

  // An upcoming song with audio already uploaded stays hidden until it blooms.
  const early = { ...base, audio: 'secret.mp3' };
  assert.equal(playableUrl(early, 'bud'), null);
  assert.equal(playableUrl(early, 'bloom'), 'secret.mp3');
});

test('teasers are sprouts with a hidden title, nothing playable, until release', async () => {
  const { displayTitle, songAction, playableUrl } = await import('./flowerRules.ts');
  const teaser = { ...base, teaser: true, preview: 'p.mp3', audio: 'a.mp3' };
  assert.equal(bloomState(teaser, bed, BEFORE), 'sprout');
  assert.equal(displayTitle(teaser, 'sprout'), '???');
  assert.equal(songAction(teaser, 'sprout'), 'DETAILS');
  assert.equal(playableUrl(teaser, 'sprout'), null);
  // Release passes: blooms normally, title revealed.
  assert.equal(bloomState(teaser, bed, AFTER), 'bloom');
  assert.equal(displayTitle(teaser, 'bloom'), 'First Light');
});

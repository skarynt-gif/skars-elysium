import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flowerLook } from './flowerLook.ts';
import type { CollectionRow, SongRow } from './api.ts';

const row = (over: Partial<SongRow> = {}) =>
  ({
    id: 'slow-burn',
    title: 'Slow Burn',
    artist: 'Skar',
    collection_id: 'a',
    genre: 'rnb',
    status: 'released',
    teaser: 0,
    release_date: null,
    flower_species: null,
    flower_hue: null,
    flower_scale: null,
    flower_color: null,
    flower_core: null,
    flower_label: null,
    sort_order: 0,
    ...over,
  }) as SongRow;
const bed = { id: 'a', type: 'album', auto_bloom: 0 } as CollectionRow;
const NOW = Date.parse('2026-10-30T20:00:00Z');

test('preview follows the game’s rules: genre picks the flower, custom colors win', () => {
  const plain = flowerLook(row(), bed, 'now', NOW);
  assert.equal(plain.species, 'rose');
  assert.equal(plain.state, 'bloom');
  const custom = flowerLook(row({ flower_species: 'iris', flower_color: '#123456', flower_scale: 2 }), bed, 'now', NOW);
  assert.equal(custom.species, 'iris');
  assert.equal(custom.palette.petal, '#123456');
  assert.ok(custom.heightScale > 1.6, 'size applies');
});

test('upcoming songs preview as buds now, or in bloom on request; singles stand on plinths', () => {
  const upcoming = row({ status: 'upcoming', release_date: '2027-01-01T05:00:00.000Z', flower_color: '#123456' });
  assert.equal(flowerLook(upcoming, bed, 'now', NOW).species, 'bud');
  assert.equal(flowerLook(upcoming, bed, 'bloom', NOW).palette.petal, '#123456');
  assert.equal(flowerLook(row({ status: 'upcoming', teaser: 1 }), bed, 'now', NOW).species, 'sprout');
  assert.equal(flowerLook(row({ status: 'unreleased' }), bed, 'now', NOW).species, 'asphodel');
  assert.equal(flowerLook(row(), { ...bed, type: 'single' }, 'now', NOW).plinth, true);
});

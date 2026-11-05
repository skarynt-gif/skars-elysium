import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moveSong } from './beds.ts';
import { draftAssignment, spotName } from './mapData.ts';
import type { CollectionRow, SongRow } from './api.ts';

const song = (id: string, bed: string, order: number) => ({ id, collection_id: bed, sort_order: order }) as SongRow;
const garden = { songs: [song('a', 'x', 0), song('b', 'x', 1), song('c', 'y', 0)] };

test('dropping a song before another, or at the end', () => {
  assert.deepEqual(moveSong(garden, 'c', 'x', 'b'), ['a', 'c', 'b']);
  assert.deepEqual(moveSong(garden, 'c', 'x', null), ['a', 'b', 'c']);
  assert.deepEqual(moveSong(garden, 'b', 'x', 'a'), ['b', 'a'], 'reorder within a bed');
});

test('spot names read like directions', () => {
  assert.equal(spotName('plot-19--55'), 'North-west, inner ring');
  assert.equal(spotName('plot-29-115'), 'South-east, outer ring');
  assert.equal(spotName('sanctuary-east'), 'EP sanctuary, right');
});

test('the Studio map uses the game’s own bed placement', () => {
  const bed = (id: string, plot: string | null = null) => ({ id, title: id, type: 'album', area: 'main', auto_bloom: 0, sort_order: 0, plot }) as CollectionRow;
  const a = draftAssignment([bed('one'), bed('two', 'plot-29-115')]);
  assert.equal(a.main.find((s) => s.collection?.id === 'two')?.plot.id, 'plot-29-115');
  assert.equal(a.main[0]?.collection?.id, 'one');
});

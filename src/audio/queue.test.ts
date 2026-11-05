import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Manifest, Song } from '../content/types.ts';
import { adjacentSong, formatTime } from './queue.ts';

const song = (id: string, collectionId: string, order: number, playable = true): Song => ({
  id,
  title: id,
  artist: 'A',
  collectionId,
  genre: 'rnb',
  status: playable ? 'released' : 'upcoming',
  order,
  ...(playable ? { audio: `${id}.mp3` } : {}),
});

const manifest: Manifest = {
  version: 1,
  collections: [],
  songs: [song('a1', 'A', 0), song('a2', 'A', 1), song('a3', 'A', 2, false), song('a4', 'A', 3), song('b1', 'B', 0)],
};
const playable = (s: Song) => Boolean(s.audio);

test('next and previous stay within the bed', () => {
  assert.equal(adjacentSong(manifest, 'a1', 1, playable)?.id, 'a2');
  assert.equal(adjacentSong(manifest, 'a2', -1, playable)?.id, 'a1');
});

test('unplayable songs are skipped', () => {
  assert.equal(adjacentSong(manifest, 'a2', 1, playable)?.id, 'a4');
});

test('wraps around both ways', () => {
  assert.equal(adjacentSong(manifest, 'a4', 1, playable)?.id, 'a1');
  assert.equal(adjacentSong(manifest, 'a1', -1, playable)?.id, 'a4');
});

test('a bed with one song has no next', () => {
  assert.equal(adjacentSong(manifest, 'b1', 1, playable), null);
});

test('works when the current song itself is not playable', () => {
  assert.equal(adjacentSong(manifest, 'a3', 1, playable)?.id, 'a4');
});

test('formats times like a game clock', () => {
  assert.equal(formatTime(0), '0:00');
  assert.equal(formatTime(7.9), '0:07');
  assert.equal(formatTime(187), '3:07');
  assert.equal(formatTime(3765), '1:02:45');
  assert.equal(formatTime(NaN), '0:00');
  assert.equal(formatTime(Infinity), '0:00');
});

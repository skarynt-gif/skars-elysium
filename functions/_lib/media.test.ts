import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cacheControlFor, contentRange, contentTypeFor, mediaKey } from './media.ts';

test('serves known media types at their bucket key', () => {
  assert.equal(mediaKey(['manifest.json']), 'manifest.json');
  assert.equal(mediaKey(['media', 'audio', 'slow-burn.mp3']), 'media/audio/slow-burn.mp3');
  assert.equal(mediaKey(['media', 'covers', 'My%20Album.webp']), 'media/covers/My Album.webp');
});

test('refuses path tricks, hidden files and unknown types', () => {
  assert.equal(mediaKey(['..', 'secret.mp3']), null);
  assert.equal(mediaKey(['media', '%2e%2e', 'x.mp3']), null);
  assert.equal(mediaKey(['media', 'a%2Fb.mp3']), null, 'encoded slash');
  assert.equal(mediaKey(['.env']), null);
  assert.equal(mediaKey(['notes.txt']), null);
  assert.equal(mediaKey(['script.js']), null);
  assert.equal(mediaKey([]), null);
  assert.equal(mediaKey(['%E0%A4%A']), null, 'malformed encoding');
});

test('content types', () => {
  assert.equal(contentTypeFor('a.MP3'), 'audio/mpeg');
  assert.equal(contentTypeFor('cover.webp'), 'image/webp');
  assert.equal(contentTypeFor('manifest.json'), 'application/json; charset=utf-8');
});

test('the manifest is always rechecked; media is cached', () => {
  assert.equal(cacheControlFor('manifest.json'), 'no-cache');
  assert.match(cacheControlFor('media/audio/a.mp3'), /max-age=86400/);
});

test('range headers for audio seeking', () => {
  assert.deepEqual(contentRange({ offset: 0, length: 100 }, 1000), { start: 0, end: 99, header: 'bytes 0-99/1000' });
  assert.equal(contentRange({ offset: 500 }, 1000)?.header, 'bytes 500-999/1000');
  assert.equal(contentRange({ suffix: 200 }, 1000)?.header, 'bytes 800-999/1000');
  assert.equal(contentRange({ offset: 990, length: 100 }, 1000)?.header, 'bytes 990-999/1000', 'clamped to the end');
  assert.equal(contentRange({ offset: 2000 }, 1000), null, 'out of range');
  assert.equal(contentRange(undefined, 1000), null);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkUpload, detectFormat, mediaKeyFor, slugify } from './media.ts';
import { releaseMoment, uniqueId } from './edits.ts';

import { call, imported, mp3, webp } from './testing/apiHarness.ts';

// ---------- file checks ----------

test('real files are recognised by their contents', () => {
  assert.equal((detectFormat(mp3) as { ext: string }).ext, 'mp3');
  assert.equal((detectFormat(webp) as { ext: string }).ext, 'webp');
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  assert.equal((detectFormat(png) as { ext: string }).ext, 'png');
  const m4a = new Uint8Array([0, 0, 0, 0x20, ...new TextEncoder().encode('ftypM4A '), 0, 0, 0, 0]);
  assert.equal((detectFormat(m4a) as { ext: string }).ext, 'm4a');
  const ogg = new TextEncoder().encode('OggS\0\0\0\0\0\0\0\0\0\0');
  assert.ok('unsupported' in (detectFormat(ogg) as object));
});

test('uploads are checked: right kind, real format, size limits', () => {
  assert.equal(checkUpload('audio', 'Slow Burn.mp3', mp3).ok, true);
  assert.equal(checkUpload('cover', 'cover.webp', webp).ok, true);
  const wrongKind = checkUpload('cover', 'song.mp3', mp3);
  assert.equal(wrongKind.ok, false);
  assert.match((wrongKind as { error: string }).error, /not artwork/);
  const html = new TextEncoder().encode('<html><script>alert(1)</script></html>');
  assert.equal(checkUpload('audio', 'evil.mp3', html).ok, false, 'a renamed web page is refused');
  assert.equal(checkUpload('audio', 'x.mp3', new Uint8Array(0)).ok, false);
  assert.equal(checkUpload('video', 'x.mp3', mp3).ok, false);
  const huge = new Uint8Array(7 * 1024 * 1024);
  huge.set(webp.subarray(0, 16));
  assert.equal((checkUpload('cover', 'big.webp', huge) as { status: number }).status, 413);
});

test('stored names are clean and unique', () => {
  assert.equal(slugify('My Song (Final Mix) v2.MP3'), 'my-song-final-mix-v2');
  assert.equal(slugify('Café Noël.wav'), 'cafe-noel');
  assert.equal(slugify('???.mp3', 'audio'), 'audio');
  assert.equal(mediaKeyFor('cover', 'Art.png', 'png', 'abc123'), 'media/covers/art-abc123.png');
  const a = checkUpload('audio', 'same.mp3', mp3);
  const b = checkUpload('audio', 'same.mp3', mp3);
  assert.ok(a.ok && b.ok && a.key !== b.key, 'every upload gets a fresh name');
  assert.equal(uniqueId('Slow Burn', new Set(['slow-burn', 'slow-burn-2']), 'song'), 'slow-burn-3');
});

test('release moments: date = midnight, date+time = that time, both in New York', () => {
  assert.equal(releaseMoment('2026-12-04', 'releaseDate'), '2026-12-04T05:00:00.000Z');
  assert.equal(releaseMoment('2026-12-04T21:30', 'releaseDate'), '2026-12-05T02:30:00.000Z');
  assert.equal(releaseMoment('2026-07-04T12:00', 'releaseDate'), '2026-07-04T16:00:00.000Z', 'summer time');
  assert.equal(releaseMoment('', 'releaseDate'), null);
  assert.throws(() => releaseMoment('2026-02-30', 'releaseDate'));
  assert.throws(() => releaseMoment('2026-12-04T25:00', 'releaseDate'));
});

// ---------- uploads through the API ----------

test('upload → library → stream (with seeking) → delete when unused', async () => {
  const env = await imported();
  const up = await call(env, 'PUT', '/api/media?kind=audio&name=New%20Song.mp3&duration=12.5', mp3);
  assert.equal(up.status, 201);
  const key: string = up.data.file.key;
  assert.match(key, /^media\/audio\/new-song-[a-z0-9]{6}\.mp3$/);
  assert.equal(env.MEDIA.files.get(key)?.contentType, 'audio/mpeg');

  const library = await call(env, 'GET', '/api/media');
  const entry = library.data.files.find((f: { key: string }) => f.key === key);
  assert.equal(entry.duration, 12.5);
  const fromImport = library.data.files.find((f: { key: string }) => f.key === 'media/audio/slow-burn.mp3');
  assert.equal(fromImport?.size, mp3.length, 'imported files are listed with their real size');
  const missing = library.data.files.find((f: { key: string }) => f.key === 'media/audio/honey-static.mp3');
  assert.equal(missing?.size, 0, 'files the garden references but storage lacks show as missing (size 0)');

  const ranged = await call(env, 'GET', `/api/draft/${key}`, undefined, { range: 'bytes=0-99' });
  assert.equal(ranged.status, 206);
  assert.equal(ranged.headers.get('content-range'), `bytes 0-99/${mp3.length}`);

  const removed = await call(env, 'DELETE', `/api/media?key=${encodeURIComponent(key)}`);
  assert.equal(removed.status, 200);
  assert.equal(env.MEDIA.files.has(key), false);
});

test('files in use (draft or any published version) cannot be deleted', async () => {
  const env = await imported();
  const inDraft = await call(env, 'DELETE', `/api/media?key=${encodeURIComponent('media/audio/slow-burn.mp3')}`);
  assert.equal(inDraft.status, 409);
  assert.match(inDraft.data.error, /Slow Burn/);

  // Remove it from the draft: still protected because the imported version uses it.
  await call(env, 'DELETE', '/api/songs/demo-slow-burn');
  const inHistory = await call(env, 'DELETE', `/api/media?key=${encodeURIComponent('media/audio/slow-burn.mp3')}`);
  assert.equal(inHistory.status, 409);
  assert.ok(env.MEDIA.files.has('media/audio/slow-burn.mp3'));
});

test('a bad upload is refused and nothing is stored', async () => {
  const env = await imported();
  const before = env.MEDIA.files.size;
  const res = await call(env, 'PUT', '/api/media?kind=cover&name=song.mp3', mp3);
  assert.equal(res.status, 415);
  assert.equal(env.MEDIA.files.size, before);
});

// ---------- songs ----------

test('add a song with an uploaded track; it lands in its bed as released', async () => {
  const env = await imported();
  const key = (await call(env, 'PUT', '/api/media?kind=audio&name=fresh.mp3', mp3)).data.file.key;
  const res = await call(env, 'POST', '/api/songs', { title: 'Fresh Bloom', collectionId: 'demo-singles', audio: key, genre: 'rnb' });
  assert.equal(res.status, 201);
  assert.equal(res.data.id, 'fresh-bloom');
  const song = res.data.songs.find((s: { id: string }) => s.id === 'fresh-bloom');
  assert.equal(song.status, 'released');
  assert.equal(song.artist, 'Skar', 'artist defaults to the one you use most');
  assert.equal(song.audio, key);
  assert.equal(res.data.issues.filter((i: { severity: string }) => i.severity === 'error').length, 0);
});

test('a new song without audio starts in the vault (unreleased), not broken', async () => {
  const env = await imported();
  const res = await call(env, 'POST', '/api/songs', { title: 'Idea', collectionId: 'demo-vault' });
  assert.equal(res.data.songs.find((s: { id: string }) => s.id === 'idea').status, 'unreleased');
});

test('autosaved edits: change state, date and teaser; teaser only sticks to upcoming songs', async () => {
  const env = await imported();
  let res = await call(env, 'PATCH', '/api/songs/demo-sun-dial', { releaseDate: '2026-12-24T18:00', teaser: true });
  assert.equal(res.status, 200);
  let song = res.data.songs.find((s: { id: string }) => s.id === 'demo-sun-dial');
  assert.equal(song.release_date, '2026-12-24T23:00:00.000Z');
  assert.equal(song.teaser, 1);

  res = await call(env, 'PATCH', '/api/songs/demo-sun-dial', { status: 'unreleased' });
  song = res.data.songs.find((s: { id: string }) => s.id === 'demo-sun-dial');
  assert.equal(song.teaser, 0, 'teaser cleared when the song leaves "upcoming"');
});

test('released without a full track is saved but flagged as a problem', async () => {
  const env = await imported();
  const res = await call(env, 'PATCH', '/api/songs/demo-lost-tape', { status: 'released' });
  assert.equal(res.status, 200);
  assert.ok(res.data.issues.some((i: { severity: string; path: string }) => i.severity === 'error' && i.path.includes('demo-lost-tape')));
});

test('invalid edits are refused with the field named', async () => {
  const env = await imported();
  const cases: [Record<string, unknown>, string][] = [
    [{ title: '' }, 'title'],
    [{ title: 'x'.repeat(121) }, 'title'],
    [{ genre: 'polka' }, 'genre'],
    [{ status: 'leaked' }, 'status'],
    [{ releaseDate: 'next friday' }, 'releaseDate'],
    [{ audio: 'javascript:alert(1)' }, 'audio'],
    [{ audio: 'media/audio/never-uploaded.mp3' }, 'audio'],
    [{ collectionId: 'no-such-bed' }, 'collectionId'],
    [{ teaser: 'yes' }, 'teaser'],
  ];
  for (const [body, field] of cases) {
    const res = await call(env, 'PATCH', '/api/songs/demo-slow-burn', body);
    assert.equal(res.status, 422, JSON.stringify(body));
    assert.equal(res.data.field, field, JSON.stringify(body));
  }
  const unchanged = (await call(env, 'GET', '/api/garden')).data.songs.find((s: { id: string }) => s.id === 'demo-slow-burn');
  assert.equal(unchanged.title, 'Slow Burn');
});

test('unknown fields are ignored, never written', async () => {
  const env = await imported();
  const res = await call(env, 'PATCH', '/api/songs/demo-slow-burn', { id: 'hacked', sort_order: 99, 'title = 1; --': 'x' });
  assert.equal(res.status, 200);
  assert.ok(res.data.songs.some((s: { id: string }) => s.id === 'demo-slow-burn'));
});

test('editing or deleting a missing song is a clear 404', async () => {
  const env = await imported();
  assert.equal((await call(env, 'PATCH', '/api/songs/nope', { title: 'X' })).status, 404);
  assert.equal((await call(env, 'DELETE', '/api/songs/nope')).status, 404);
});

test('deleting a song removes only that song', async () => {
  const env = await imported();
  const before = (await call(env, 'GET', '/api/garden')).data.songs.length;
  const res = await call(env, 'DELETE', '/api/songs/demo-honey-static');
  assert.equal(res.data.songs.length, before - 1);
  assert.ok(!res.data.songs.some((s: { id: string }) => s.id === 'demo-honey-static'));
});

test('auto-bloom is switched per bed', async () => {
  const env = await imported();
  const res = await call(env, 'PATCH', '/api/collections/demo-next-ep', { autoBloom: false });
  assert.equal(res.status, 200);
  assert.equal(res.data.collections.find((c: { id: string }) => c.id === 'demo-next-ep').auto_bloom, 0);
  assert.equal((await call(env, 'PATCH', '/api/collections/demo-next-ep', { autoBloom: 'sure' })).status, 422);
});

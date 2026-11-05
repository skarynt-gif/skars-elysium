import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateManifest } from '../../src/content/validate.ts';
import { diffManifests } from './diff.ts';
import { rowsToManifestJson } from './mapping.ts';
import { call, imported, type Env } from './testing/apiHarness.ts';

const live = (env: Env) => JSON.parse(new TextDecoder().decode(env.MEDIA.files.get('manifest.json')!.bytes));
/** What a visitor's game makes of the live song list. */
const visitorSees = (env: Env) =>
  validateManifest(live(env), { manifestUrl: 'https://skars-elysium.pages.dev/media/manifest.json', releaseTimeZone: 'America/New_York' }).manifest;

test('right after import there is nothing to publish', async () => {
  const env = await imported(true);
  const changes = await call(env, 'GET', '/api/changes');
  assert.deepEqual(changes.data.changes, []);
  const res = await call(env, 'POST', '/api/publish', { note: 'nothing' });
  assert.equal(res.status, 422);
  assert.match(res.data.error, /Nothing has changed/);
});

test('edit → see the change → publish → visitors get it, history grows', async () => {
  const env = await imported(true);
  await call(env, 'PATCH', '/api/songs/demo-slow-burn', { title: 'Slow Burn (Remix)', flowerColor: '#22aaee' });
  const status = await call(env, 'GET', '/api/status');
  assert.equal(status.data.draft.changes, 1);
  const { data } = await call(env, 'GET', '/api/changes');
  assert.deepEqual(data.changes, [{ kind: 'changed', what: 'song', name: 'Slow Burn (Remix)', details: ['title', 'flower look'] }]);

  const before = visitorSees(env).songs.find((s) => s.id === 'demo-slow-burn')!;
  assert.equal(before.title, 'Slow Burn', 'nothing reaches visitors before publishing');

  const res = await call(env, 'POST', '/api/publish', { note: 'Remix out now' });
  assert.equal(res.status, 200);
  assert.equal(res.data.version.note, 'Remix out now');
  const after = visitorSees(env).songs.find((s) => s.id === 'demo-slow-burn')!;
  assert.equal(after.title, 'Slow Burn (Remix)');
  assert.equal(after.flower?.color, '#22aaee');
  assert.equal(after.audio, 'https://skars-elysium.pages.dev/media/media/audio/slow-burn.mp3', 'media paths resolve where the media function serves them');
  assert.equal(env.MEDIA.files.get('manifest.json')!.contentType, 'application/json; charset=utf-8');

  const history = await call(env, 'GET', '/api/publishes');
  assert.deepEqual(history.data.versions.map((v: { note: string }) => v.note), ['Remix out now', 'Imported from the live garden']);
  assert.equal((await call(env, 'GET', '/api/status')).data.draft.changes, 0);
});

test('problems block publishing and leave the live garden untouched', async () => {
  const env = await imported(true);
  const original = live(env);
  await call(env, 'PATCH', '/api/songs/demo-lost-tape', { status: 'released' }); // released without a full track
  const res = await call(env, 'POST', '/api/publish', {});
  assert.equal(res.status, 409);
  assert.equal(res.data.code, 'blocked');
  assert.ok(res.data.problems.some((p: string) => p.includes('demo-lost-tape')));
  assert.deepEqual(live(env), original);
});

test('missing files block publishing', async () => {
  const env = await imported(true);
  env.MEDIA.files.delete('media/covers/prism-garden.webp');
  await call(env, 'PATCH', '/api/songs/demo-slow-burn', { title: 'Changed' });
  const res = await call(env, 'POST', '/api/publish', {});
  assert.equal(res.status, 409);
  assert.deepEqual(res.data.problems, ['media/covers/prism-garden.webp']);
});

test('one-click rollback: an older version goes live again and becomes the draft', async () => {
  const env = await imported(true);
  const v1 = live(env);
  await call(env, 'DELETE', '/api/songs/demo-honey-static');
  await call(env, 'POST', '/api/publish', { note: 'Removed Honey Static' });
  assert.ok(!visitorSees(env).songs.some((s) => s.id === 'demo-honey-static'));

  const versions = (await call(env, 'GET', '/api/publishes')).data.versions;
  const first = versions.at(-1).id;
  const res = await call(env, 'POST', `/api/publishes/${first}/restore`, {});
  assert.equal(res.status, 200);
  assert.ok(visitorSees(env).songs.some((s) => s.id === 'demo-honey-static'), 'the song is back for visitors');
  assert.ok(res.data.songs.some((s: { id: string }) => s.id === 'demo-honey-static'), 'and in the draft');
  assert.deepEqual(visitorSees(env), validateManifest(v1, { manifestUrl: 'https://skars-elysium.pages.dev/media/manifest.json', releaseTimeZone: 'America/New_York' }).manifest);
  const history = (await call(env, 'GET', '/api/publishes')).data.versions;
  assert.equal(history[0].note, `Restored version ${first}`);
  assert.equal(history.length, 3, 'the rollback itself is a version, so it can be undone');
  assert.equal((await call(env, 'POST', '/api/publishes/999/restore', {})).status, 404);
});

test('the Studio notices if the live garden was changed outside it', async () => {
  const env = await imported(true);
  assert.equal((await call(env, 'GET', '/api/status')).data.live.changedOutside, false);
  const edited = live(env);
  edited.songs[0].title = 'Edited by hand';
  env.MEDIA.files.set('manifest.json', { bytes: new TextEncoder().encode(JSON.stringify(edited)), uploaded: new Date() });
  assert.equal((await call(env, 'GET', '/api/status')).data.live.changedOutside, true);
});

test('the private preview reads the draft, and its media resolves through the Studio', async () => {
  const env = await imported(true);
  await call(env, 'PATCH', '/api/songs/demo-slow-burn', { title: 'Draft Title' });
  const res = await call(env, 'GET', '/api/draft/manifest.json');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const preview = validateManifest(res.data, { manifestUrl: 'https://studio.pages.dev/api/draft/manifest.json', releaseTimeZone: 'America/New_York' });
  const song = preview.manifest.songs.find((s) => s.id === 'demo-slow-burn')!;
  assert.equal(song.title, 'Draft Title');
  const path = new URL(song.audio!).pathname; // /api/draft/media/audio/slow-burn.mp3
  const audio = await call(env, 'GET', path, undefined, { range: 'bytes=0-9' });
  assert.equal(audio.status, 206);
});

test('change summaries read naturally', () => {
  const base = { collections: [{ id: 'a', title: 'A', order: 0 }], songs: [{ id: 's', title: 'S', status: 'upcoming', order: 0 }] };
  const next = {
    collections: [{ id: 'a', title: 'A', order: 0, plot: 'plot-19--55' }, { id: 'b', title: 'B', order: 1 }],
    songs: [{ id: 's', title: 'S', status: 'released', audio: 'media/audio/s.mp3', order: 0 }],
    garden: { decorations: [{ id: 'urn-1' }], environment: { skyWarmth: 0, fog: 1, particles: 1, butterflies: 1, clouds: 1 } },
  };
  assert.deepEqual(diffManifests(base, next), [
    { kind: 'changed', what: 'bed', name: 'A', details: ['spot'] },
    { kind: 'added', what: 'bed', name: 'B', details: [] },
    { kind: 'changed', what: 'song', name: 'S', details: ['release state', 'full song'] },
    { kind: 'changed', what: 'decorations', name: 'Decorations', details: ['1 added'] },
  ]);
  assert.equal(diffManifests(null, rowsToManifestJson({ collections: [], songs: [] })).length, 0);
});

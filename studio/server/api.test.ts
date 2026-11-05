import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { handleApi, LIVE_MANIFEST_KEY, type ApiDeps } from './api.ts';
import type { StudioEnv } from './cloudflare.ts';
import { checkManifest, manifestToRows, rowsToManifestJson, type GardenRows } from './mapping.ts';
import { migrate, MIGRATIONS } from './migrations.ts';
import { createTestD1, createTestR2 } from './testing/sqliteD1.ts';

const demoText = readFileSync('public/content/manifest.json', 'utf8');
const demo = JSON.parse(demoText) as { collections: unknown[]; songs: unknown[] };

const signedIn: ApiDeps = { authenticate: async () => ({ ok: true, email: 'skar@example.com' }) };
const BASE = 'https://studio.pages.dev';

function call(env: StudioEnv, method: string, path: string, init: { body?: unknown; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = method === 'GET' ? {} : { 'x-studio': '1', origin: BASE, 'content-type': 'application/json' };
  const request = new Request(BASE + path, {
    method,
    headers: { ...headers, ...init.headers },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  return handleApi(request, env, signedIn);
}

function freshEnv(files: Record<string, string> = { [LIVE_MANIFEST_KEY]: demoText }): StudioEnv {
  return { DB: createTestD1(), MEDIA: createTestR2(files), GARDEN_URL: 'https://skars-elysium.pages.dev' };
}

// ---------- migrations ----------

test('migrations create the tables once and are safe to re-run', async () => {
  const db = createTestD1();
  assert.deepEqual(await migrate(db), MIGRATIONS.map((m) => m.id));
  assert.deepEqual(await migrate(db), []);
  const tables = db.raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map((r) => r.name);
  for (const t of ['collections', 'songs', 'publishes', 'studio_migrations']) assert.ok(tables.includes(t), t);
});

test('a broken migration leaves nothing half-applied', async () => {
  const db = createTestD1();
  await migrate(db);
  const bad = [{ id: 99, name: 'bad', statements: ['CREATE TABLE ok_table (x)', 'THIS IS NOT SQL'] }];
  await assert.rejects(migrate(db, bad));
  const leftover = db.raw.prepare("SELECT name FROM sqlite_master WHERE name = 'ok_table'").all();
  assert.equal(leftover.length, 0);
  assert.equal(db.raw.prepare('SELECT id FROM studio_migrations WHERE id = 99').all().length, 0);
});

// ---------- manifest <-> rows ----------

test('the demo garden survives a round trip through the database format unchanged', () => {
  const first = checkManifest(demo);
  const rows = manifestToRows(first.manifest);
  const second = checkManifest(rowsToManifestJson(rows));
  assert.deepEqual(second.manifest, first.manifest);
  assert.deepEqual(second.issues, first.issues);
});

test('media paths are stored relative to the live manifest, full URLs kept as-is', () => {
  const { manifest } = checkManifest({
    version: 1,
    collections: [{ id: 'a', title: 'A', type: 'album', cover: 'media/covers/my cover.webp' }],
    songs: [
      { id: 's', title: 'S', artist: 'Skar', collectionId: 'a', genre: 'rnb', status: 'released', audio: 'https://cdn.example.com/s.mp3' },
    ],
  });
  const rows = manifestToRows(manifest);
  assert.equal(rows.collections[0]?.cover, 'media/covers/my cover.webp');
  assert.equal(rows.songs[0]?.audio, 'https://cdn.example.com/s.mp3');
});

// ---------- API ----------

test('a request that fails sign-in gets the reason, nothing else', async () => {
  const locked: ApiDeps = { authenticate: async () => ({ ok: false, status: 401, reason: 'Not signed in.' }) };
  const response = await handleApi(new Request(`${BASE}/api/garden`), freshEnv(), locked);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: 'Not signed in.', code: 'auth' });
});

test('status on a fresh Studio: everything connected, live garden found, draft empty', async () => {
  const body = (await (await call(freshEnv(), 'GET', '/api/status')).json()) as Record<string, any>;
  assert.equal(body.email, 'skar@example.com');
  assert.equal(body.database.ok, true);
  assert.equal(body.storage.ok, true);
  assert.equal(body.live.found, true);
  assert.equal(body.live.songs, checkManifest(demo).manifest.songs.length);
  assert.deepEqual({ ...body.draft }, { collections: 0, songs: 0, problems: 0, warnings: 0, changes: 0 });
  assert.equal(body.lastPublish, null);
  assert.equal(body.gardenUrl, 'https://skars-elysium.pages.dev');
});

test('status explains missing bindings instead of failing', async () => {
  const body = (await (await call({}, 'GET', '/api/status')).json()) as Record<string, any>;
  assert.equal(body.database.ok, false);
  assert.match(body.database.message, /DB binding/);
  assert.equal(body.storage.ok, false);
  assert.match(body.storage.message, /MEDIA binding/);
  const garden = await call({}, 'GET', '/api/garden');
  assert.equal(garden.status, 503);
});

test('import copies the live garden into the draft and starts the history', async () => {
  const env = freshEnv();
  const response = await call(env, 'POST', '/api/import', { body: {} });
  assert.equal(response.status, 200);
  const result = (await response.json()) as { collections: number; songs: number };
  const expected = checkManifest(demo).manifest;
  assert.equal(result.collections, expected.collections.length);
  assert.equal(result.songs, expected.songs.length);

  const garden = (await (await call(env, 'GET', '/api/garden')).json()) as GardenRows;
  assert.equal(garden.songs.length, expected.songs.length);
  assert.deepEqual(checkManifest(rowsToManifestJson(garden)).manifest, expected, 'draft matches what visitors see');

  const status = (await (await call(env, 'GET', '/api/status')).json()) as Record<string, any>;
  assert.equal(status.lastPublish.note, 'Imported from the live garden');
  assert.equal(status.lastPublish.author, 'skar@example.com');
  assert.equal(status.draft.songs, expected.songs.length);
  assert.equal(status.draft.problems, 0);
});

test('import will not silently overwrite a draft', async () => {
  const env = freshEnv();
  await call(env, 'POST', '/api/import', { body: {} });
  const again = await call(env, 'POST', '/api/import', { body: {} });
  assert.equal(again.status, 409);
  assert.equal(((await again.json()) as { code: string }).code, 'draft-not-empty');
  const replaced = await call(env, 'POST', '/api/import', { body: { replace: true } });
  assert.equal(replaced.status, 200);
  const history = (env.DB as ReturnType<typeof createTestD1>).raw.prepare('SELECT COUNT(*) AS n FROM publishes').get();
  assert.equal(history?.n, 2);
});

test('import with no live garden explains what to do', async () => {
  const response = await call(freshEnv({}), 'POST', '/api/import', { body: {} });
  assert.equal(response.status, 404);
  assert.match(((await response.json()) as { error: string }).error, /No live garden/);
});

test('import refuses a corrupt manifest without touching the draft', async () => {
  const response = await call(freshEnv({ [LIVE_MANIFEST_KEY]: '{ nope' }), 'POST', '/api/import', { body: {} });
  assert.equal(response.status, 422);
});

test('changes from another website are refused', async () => {
  const env = freshEnv();
  await migrate(env.DB!);
  const noHeader = await call(env, 'POST', '/api/import', { body: {}, headers: { 'x-studio': '' } });
  assert.equal(noHeader.status, 403);
  const otherOrigin = await call(env, 'POST', '/api/import', { body: {}, headers: { origin: 'https://evil.example' } });
  assert.equal(otherOrigin.status, 403);
  const counts = (env.DB as ReturnType<typeof createTestD1>).raw.prepare('SELECT COUNT(*) AS n FROM songs').all();
  assert.equal(counts[0]?.n ?? 0, 0);
});

test('unknown routes are a clear 404', async () => {
  const response = await call(freshEnv(), 'GET', '/api/nothing-here');
  assert.equal(response.status, 404);
});

test('responses are never cached', async () => {
  const response = await call(freshEnv(), 'GET', '/api/me');
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

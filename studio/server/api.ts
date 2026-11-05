/**
 * The Studio's API (everything under /api). Every request is signed-in
 * checked first; changes additionally require a same-site request so another
 * website can't trigger them through your browser.
 *
 *   GET    /api/me                 who is signed in
 *   GET    /api/status             database, storage, live garden and draft health
 *   GET    /api/garden             the draft garden (beds, songs, problems)
 *   POST   /api/import             copy the live garden into the draft
 *   GET    /api/media              the media library
 *   PUT    /api/media?kind&name    upload a file (raw body)
 *   DELETE /api/media?key          delete an unused upload
 *   GET    /api/draft/<key>        stream a media file (Studio previews)
 *   POST   /api/songs              add a song
 *   PATCH  /api/songs/<id>         change a song (autosave)
 *   DELETE /api/songs/<id>         delete a song
 *   POST   /api/collections        add a bed
 *   PATCH  /api/collections/<id>   change a bed (incl. its spot on the map)
 *   DELETE /api/collections/<id>   delete an empty bed
 *   POST   /api/collections/order  set the order of beds
 *   POST   /api/collections/<id>/songs  put songs in a bed, in order
 *   POST   /api/decorations        place a decoration (walkability checked)
 *   PATCH  /api/decorations/<id>   move, turn or resize it
 *   DELETE /api/decorations/<id>   remove it
 *   PUT    /api/environment        sky warmth, fog, particles… ({reset:true} = original sunset)
 *   GET    /api/draft/manifest.json  the draft as the game reads it (private preview)
 *   GET    /api/changes            what publishing would change, and any problems
 *   POST   /api/publish            make the draft live ({note})
 *   GET    /api/publishes          version history
 *   POST   /api/publishes/<n>/restore  make version n live again (and the draft)
 */
import { authenticate as defaultAuthenticate, type AuthResult } from './auth.ts';
import type { D1Database, R2Bucket, StudioEnv } from './cloudflare.ts';
import {
  createDecoration,
  deleteDecoration,
  saveEnvironment,
  updateDecoration,
  createCollection,
  createSong,
  deleteCollection,
  deleteSong,
  NotFound,
  orderCollections,
  placeSongs,
  updateCollection,
  updateSong,
} from './draft.ts';
import { EditError } from './edits.ts';
import { gardenCounts, lastPublish, loadGarden, publishEntry, replaceGarden } from './garden.ts';
import { checkManifest, manifestToRows, rowsToManifestJson, type GardenRows } from './mapping.ts';
import { checkUpload, isMediaKey, listMedia, mediaUsage, recordMedia, type MediaKind } from './media.ts';
import { migrate } from './migrations.ts';
import { LIVE_MANIFEST_KEY, draftManifest, latestVersion, listVersions, liveMatches, pendingChanges, publishDraft, PublishBlocked, restoreVersion } from './publish.ts';
import { contentRange } from '../../functions/_lib/media.ts';

/** Where the public game reads its song list (functions/media serves this key). */
export { LIVE_MANIFEST_KEY };

export interface ApiDeps {
  authenticate: (request: Request, env: StudioEnv) => Promise<AuthResult>;
}

const NO_STORE = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...NO_STORE } });

export const problem = (status: number, error: string, extra: Record<string, unknown> = {}) =>
  json({ error, ...extra }, status);

/** Databases this isolate has already brought up to date. */
const migrated = new WeakMap<D1Database, Promise<unknown>>();

function ensureMigrated(db: D1Database): Promise<unknown> {
  let ready = migrated.get(db);
  if (!ready) {
    ready = migrate(db).catch((error: unknown) => {
      migrated.delete(db); // Try again on the next request.
      throw error;
    });
    migrated.set(db, ready);
  }
  return ready;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Changes must come from the Studio page itself, never another site. */
function isSameSite(request: Request): boolean {
  if (request.headers.get('x-studio') !== '1') return false;
  const origin = request.headers.get('origin');
  return origin === null || origin === new URL(request.url).origin;
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await request.json();
    return typeof body === 'object' && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

interface Ctx {
  request: Request;
  url: URL;
  env: StudioEnv;
  db: D1Database;
  media: R2Bucket | undefined;
  email: string;
  /** Path segments after /api/ (decoded). */
  parts: string[];
}

type Handler = (ctx: Ctx) => Promise<Response>;

/** Routes that need the database, keyed "METHOD first-segment". */
const ROUTES: Record<string, Handler> = {
  'GET garden': async ({ db }) => json(await gardenPayload(db)),
  'POST import': async (ctx) => importLiveGarden(ctx, (await readBody(ctx.request)).replace === true),
  'GET media': async ({ db }) => json({ files: await listMedia(db) }),
  'PUT media': uploadMedia,
  'DELETE media': deleteMedia,
  'GET draft': async (ctx) =>
    // The private preview of the game reads the draft from here.
    ctx.parts.length === 2 && ctx.parts[1] === 'manifest.json' ? json(await draftManifest(ctx.db)) : streamDraftFile(ctx),
  'HEAD draft': streamDraftFile,
  'GET changes': async ({ db }) => json({ ...(await pendingChanges(db)), lastPublish: await lastPublish(db) }),
  'GET publishes': async ({ db }) => json({ versions: await listVersions(db) }),
  'POST publish': async ({ db, media, request, email }) => {
    if (!media) return problem(503, 'Media storage is not connected.');
    const note = (await readBody(request)).note;
    const version = await publishDraft(db, media, email, typeof note === 'string' ? note.trim().slice(0, 200) : '');
    return json({ version });
  },
  'POST publishes': async ({ db, media, parts, email }) => {
    if (parts.length !== 3 || parts[2] !== 'restore' || !/^\d+$/.test(parts[1]!)) return notFound();
    if (!media) return problem(503, 'Media storage is not connected.');
    const version = await restoreVersion(db, media, email, Number(parts[1]));
    return json({ version, ...(await gardenPayload(db)) });
  },
  'POST songs': async ({ db, request, parts }) => {
    if (parts.length !== 1) return notFound();
    const id = await createSong(db, await readBody(request));
    return json({ id, ...(await gardenPayload(db)) }, 201);
  },
  'PATCH songs': async ({ db, request, parts }) => {
    if (parts.length !== 2) return notFound();
    await updateSong(db, parts[1]!, await readBody(request));
    return json(await gardenPayload(db));
  },
  'DELETE songs': async ({ db, parts }) => {
    if (parts.length !== 2) return notFound();
    await deleteSong(db, parts[1]!);
    return json(await gardenPayload(db));
  },
  'PATCH collections': async ({ db, request, parts }) => {
    if (parts.length !== 2) return notFound();
    await updateCollection(db, parts[1]!, await readBody(request));
    return json(await gardenPayload(db));
  },
  'POST collections': async ({ db, request, parts }) => {
    if (parts.length === 1) {
      const id = await createCollection(db, await readBody(request));
      return json({ id, ...(await gardenPayload(db)) }, 201);
    }
    if (parts.length === 2 && parts[1] === 'order') {
      await orderCollections(db, (await readBody(request)).ids);
      return json(await gardenPayload(db));
    }
    if (parts.length === 3 && parts[2] === 'songs') {
      await placeSongs(db, parts[1], (await readBody(request)).ids);
      return json(await gardenPayload(db));
    }
    return notFound();
  },
  'POST decorations': async ({ db, request, parts }) => {
    if (parts.length !== 1) return notFound();
    const id = await createDecoration(db, await readBody(request));
    return json({ id, ...(await gardenPayload(db)) }, 201);
  },
  'PATCH decorations': async ({ db, request, parts }) => {
    if (parts.length !== 2) return notFound();
    await updateDecoration(db, parts[1]!, await readBody(request));
    return json(await gardenPayload(db));
  },
  'DELETE decorations': async ({ db, parts }) => {
    if (parts.length !== 2) return notFound();
    await deleteDecoration(db, parts[1]!);
    return json(await gardenPayload(db));
  },
  'PUT environment': async ({ db, request }) => {
    await saveEnvironment(db, await readBody(request));
    return json(await gardenPayload(db));
  },
  'DELETE collections': async ({ db, parts }) => {
    if (parts.length !== 2) return notFound();
    await deleteCollection(db, parts[1]!);
    return json(await gardenPayload(db));
  },
};

const notFound = () => problem(404, 'Unknown Studio request.');

export async function handleApi(
  request: Request,
  env: StudioEnv,
  deps: ApiDeps = { authenticate: defaultAuthenticate },
): Promise<Response> {
  const auth = await deps.authenticate(request, env);
  if (!auth.ok) return problem(auth.status, auth.reason, { code: 'auth' });

  const url = new URL(request.url);
  let parts: string[];
  try {
    parts = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  } catch {
    return notFound();
  }
  const method = request.method;
  if (method !== 'GET' && method !== 'HEAD' && !isSameSite(request)) {
    return problem(403, 'This change must be made from the Studio page.');
  }

  if (method === 'GET' && parts.join('/') === 'me') return json({ email: auth.email });
  if (method === 'GET' && parts.join('/') === 'status') return json(await status(env, auth.email));

  const handler = ROUTES[`${method} ${parts[0] ?? ''}`];
  if (!handler) return notFound();

  // Everything below needs the database.
  if (!env.DB) return problem(503, 'The database is not connected. Add the DB binding (see DEPLOY.md, Studio step 2).');
  try {
    await ensureMigrated(env.DB);
  } catch (error) {
    return problem(503, `The database could not be set up: ${describe(error)}`);
  }

  try {
    return await handler({ request, url, env, db: env.DB, media: env.MEDIA, email: auth.email, parts });
  } catch (error) {
    if (error instanceof EditError) return problem(422, error.message, { field: error.field });
    if (error instanceof NotFound) return problem(404, error.message);
    if (error instanceof PublishBlocked) return problem(409, error.message, { problems: error.problems, code: 'blocked' });
    console.error('[studio] request failed', error);
    return problem(500, `Something went wrong: ${describe(error)}`);
  }
}

// ---------- garden ----------

export async function gardenPayload(db: D1Database): Promise<GardenRows & { issues: ReturnType<typeof checkManifest>['issues'] }> {
  const rows = await loadGarden(db);
  return { ...rows, issues: checkManifest(rowsToManifestJson(rows)).issues };
}

// ---------- status ----------

interface Check {
  ok: boolean;
  message: string;
}

async function status(env: StudioEnv, email: string) {
  const database: Check = { ok: false, message: 'Not connected. Add the DB binding (see DEPLOY.md, Studio step 2).' };
  let draft: { collections: number; songs: number; problems: number; warnings: number; changes: number } | null = null;
  let lastManifest: string | null = null;
  let published: Awaited<ReturnType<typeof lastPublish>> = null;
  if (env.DB) {
    try {
      await ensureMigrated(env.DB);
      const counts = await gardenCounts(env.DB);
      const issues = counts.songs + counts.collections > 0 ? checkManifest(rowsToManifestJson(await loadGarden(env.DB))).issues : [];
      draft = {
        ...counts,
        problems: issues.filter((i) => i.severity === 'error').length,
        warnings: issues.filter((i) => i.severity === 'warning').length,
        changes: (await pendingChanges(env.DB)).changes.length,
      };
      lastManifest = (await latestVersion(env.DB))?.manifest ?? null;
      published = await lastPublish(env.DB);
      database.ok = true;
      database.message = 'Connected';
    } catch (error) {
      database.message = `Connected, but not working: ${describe(error)}`;
    }
  }

  const storage: Check = { ok: false, message: 'Not connected. Add the MEDIA binding (see DEPLOY.md, Studio step 2).' };
  let live: { found: boolean; updatedAt?: string; collections?: number; songs?: number; changedOutside?: boolean } = { found: false };
  if (env.MEDIA) {
    try {
      const object = await env.MEDIA.get(LIVE_MANIFEST_KEY);
      storage.ok = true;
      storage.message = 'Connected';
      if (object) {
        const raw: unknown = JSON.parse(await object.text());
        const { manifest } = checkManifest(raw);
        live = {
          found: true,
          changedOutside: lastManifest !== null && !liveMatches(raw, lastManifest),
          updatedAt: object.uploaded.toISOString(),
          collections: manifest.collections.length,
          songs: manifest.songs.length,
        };
      }
    } catch (error) {
      storage.message = storage.ok
        ? `Connected, but the live song list couldn't be read: ${describe(error)}`
        : `Connected, but not working: ${describe(error)}`;
    }
  }

  return { email, gardenUrl: env.GARDEN_URL ?? null, database, storage, live, draft, lastPublish: published };
}

// ---------- import ----------

async function importLiveGarden({ db, media, email }: Ctx, replace: boolean): Promise<Response> {
  if (!media) return problem(503, 'Media storage is not connected. Add the MEDIA binding (see DEPLOY.md, Studio step 2).');

  const object = await media.get(LIVE_MANIFEST_KEY);
  if (!object) {
    return problem(404, 'No live garden found yet. Publish your music once (DEPLOY.md step 5), or build your garden here from scratch.');
  }
  let raw: unknown;
  try {
    raw = JSON.parse(await object.text());
  } catch {
    return problem(422, 'The live song list (manifest.json) is not valid JSON, so it could not be imported.');
  }

  const counts = await gardenCounts(db);
  if (counts.collections + counts.songs > 0 && !replace) {
    return problem(409, 'Your draft already has beds or songs. Importing would replace them.', { code: 'draft-not-empty' });
  }

  const { manifest, issues } = checkManifest(raw);
  const rows = manifestToRows(manifest);

  // Register the files the garden already uses, so they show in the media library.
  const referenced = new Map<string, MediaKind>();
  for (const s of rows.songs) {
    if (s.audio) referenced.set(s.audio, 'audio');
    if (s.preview) referenced.set(s.preview, 'preview');
    if (s.cover) referenced.set(s.cover, 'cover');
  }
  for (const c of rows.collections) if (c.cover) referenced.set(c.cover, 'cover');
  const registrations = [];
  for (const [key, kind] of referenced) {
    if (!key.startsWith('media/')) continue;
    const info = await media.head(key);
    registrations.push(
      recordMedia(db, {
        key,
        kind,
        content_type: kind === 'cover' ? 'image/*' : 'audio/*',
        size: info?.size ?? 0,
        original_name: key.split('/').pop() ?? key,
        duration: null,
      }),
    );
  }

  // The live version becomes the first entry in your history, so you can always return to it.
  await replaceGarden(db, rows, [
    ...registrations,
    publishEntry(db, {
      author: email,
      note: 'Imported from the live garden',
      manifest: rowsToManifestJson(rows),
      collections: rows.collections.length,
      songs: rows.songs.length,
    }),
  ]);
  return json({ collections: rows.collections.length, songs: rows.songs.length, issues });
}

// ---------- media ----------

async function uploadMedia({ db, media, request, url }: Ctx): Promise<Response> {
  if (!media) return problem(503, 'Media storage is not connected. Add the MEDIA binding (see DEPLOY.md, Studio step 2).');
  const kind = url.searchParams.get('kind') ?? '';
  const name = (url.searchParams.get('name') ?? 'file').slice(0, 200);
  const durationParam = Number(url.searchParams.get('duration'));
  const duration = Number.isFinite(durationParam) && durationParam > 0 && durationParam < 36000 ? durationParam : null;

  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > 100 * 1024 * 1024) return problem(413, 'That file is too large.');
  const bytes = new Uint8Array(await request.arrayBuffer());
  const check = checkUpload(kind, name, bytes);
  if (!check.ok) return problem(check.status, check.error);

  await media.put(check.key, bytes, {
    httpMetadata: { contentType: check.contentType, cacheControl: 'public, max-age=31536000, immutable' },
  });
  const row = {
    key: check.key,
    kind: kind as MediaKind,
    content_type: check.contentType,
    size: bytes.length,
    original_name: name,
    duration,
  };
  await recordMedia(db, row).run();
  return json({ file: row }, 201);
}

async function deleteMedia({ db, media, url }: Ctx): Promise<Response> {
  const key = url.searchParams.get('key') ?? '';
  const known = await db.prepare('SELECT key FROM media WHERE key = ?').bind(key).first();
  if (!known) return problem(404, 'That file is not in your media library.');
  const usage = await mediaUsage(db, key);
  if (usage.draft.length) return problem(409, `Still used by: ${usage.draft.join(', ')}. Remove it there first.`);
  if (usage.publishedVersions.length) {
    return problem(409, 'A published version uses this file, so it’s kept: restoring that version needs it.');
  }
  if (media && isMediaKey(key)) await media.delete(key);
  await db.prepare('DELETE FROM media WHERE key = ?').bind(key).run();
  return json({ deleted: key });
}

/** Streams a bucket file to the Studio page (audio previews, artwork, the private game preview). */
async function streamDraftFile({ media, request, parts }: Ctx): Promise<Response> {
  if (!media) return problem(503, 'Media storage is not connected.');
  const key = parts.slice(1).join('/');
  if (!key.startsWith('media/') || key.includes('..')) return problem(404, 'Not found.');
  const object = await media.get(key, { range: request.headers, onlyIf: request.headers });
  if (!object) return problem(404, 'That file is missing from storage.');

  const headers = new Headers({ 'cache-control': 'private, max-age=3600', 'accept-ranges': 'bytes', 'x-content-type-options': 'nosniff' });
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  if (request.method === 'HEAD') {
    headers.set('content-length', String(object.size));
    return new Response(null, { status: 200, headers });
  }
  if (!object.body) return new Response(null, { status: 304, headers });
  const ranged = request.headers.has('range') ? contentRange(object.range, object.size) : null;
  if (ranged) {
    headers.set('content-range', ranged.header);
    headers.set('content-length', String(ranged.end - ranged.start + 1));
    return new Response(object.body, { status: 206, headers });
  }
  headers.set('content-length', String(object.size));
  return new Response(object.body, { status: 200, headers });
}

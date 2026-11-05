/**
 * Publishing: the moment the draft becomes what visitors see.
 *
 * The game only ever reads manifest.json from the media bucket, so publishing
 * is one file write, and every published version is kept in the database so
 * any of them can be restored with one click.
 */
import type { D1Database, R2Bucket } from './cloudflare.ts';
import { diffManifests, type Change } from './diff.ts';
import { loadGarden, publishEntry, replaceGarden } from './garden.ts';
import { checkManifest, manifestToRows, rowsToManifestJson } from './mapping.ts';
import type { ContentIssue } from '../../src/content/types.ts';
import { EditError } from './edits.ts';
import { NotFound } from './draft.ts';

export const LIVE_MANIFEST_KEY = 'manifest.json';

type Json = Record<string, unknown>;

export interface Version {
  id: number;
  createdAt: string;
  author: string;
  note: string | null;
  collections: number;
  songs: number;
}

export async function draftManifest(db: D1Database): Promise<Json> {
  return rowsToManifestJson(await loadGarden(db));
}

export async function latestVersion(db: D1Database): Promise<(Version & { manifest: string }) | null> {
  return db
    .prepare(
      `SELECT id, created_at AS createdAt, author, note, collection_count AS collections, song_count AS songs, manifest
       FROM publishes ORDER BY id DESC LIMIT 1`,
    )
    .first<Version & { manifest: string }>();
}

export async function listVersions(db: D1Database, limit = 50): Promise<Version[]> {
  const { results } = await db
    .prepare(
      `SELECT id, created_at AS createdAt, author, note, collection_count AS collections, song_count AS songs
       FROM publishes ORDER BY id DESC LIMIT ?`,
    )
    .bind(limit)
    .all<Version>();
  return results;
}

/** What publishing now would change, and anything that stops it. */
export async function pendingChanges(db: D1Database): Promise<{ changes: Change[]; issues: ContentIssue[] }> {
  const draft = await draftManifest(db);
  const latest = await latestVersion(db);
  const before = latest ? (JSON.parse(latest.manifest) as Json) : null;
  return { changes: diffManifests(before, draft), issues: checkManifest(draft).issues };
}

/** Bucket files a manifest points to (full web addresses are left alone). */
export function mediaKeysIn(manifest: Json): string[] {
  const keys = new Set<string>();
  const add = (v: unknown) => typeof v === 'string' && v.startsWith('media/') && keys.add(v);
  for (const c of (manifest.collections as Json[] | undefined) ?? []) add(c.cover);
  for (const s of (manifest.songs as Json[] | undefined) ?? []) {
    add(s.audio);
    add(s.preview);
    add(s.cover);
  }
  return [...keys];
}

export class PublishBlocked extends Error {
  readonly problems: string[];
  constructor(message: string, problems: string[]) {
    super(message);
    this.problems = problems;
  }
}

async function ensurePublishable(manifest: Json, media: R2Bucket): Promise<void> {
  const errors = checkManifest(manifest).issues.filter((i) => i.severity === 'error');
  if (errors.length) {
    throw new PublishBlocked(
      'Fix these problems first, so nothing goes missing for visitors.',
      errors.map((e) => `${e.path}: ${e.message}`),
    );
  }
  const keys = mediaKeysIn(manifest);
  const found = await Promise.all(keys.map((k) => media.head(k)));
  const missing = keys.filter((_, i) => !found[i]);
  if (missing.length) {
    throw new PublishBlocked('Some files are missing from storage. Upload them again first.', missing);
  }
}

async function goLive(media: R2Bucket, manifest: Json): Promise<void> {
  await media.put(LIVE_MANIFEST_KEY, JSON.stringify(manifest), {
    // Visitors re-check the song list on every visit, so changes show up right away.
    httpMetadata: { contentType: 'application/json; charset=utf-8', cacheControl: 'no-cache' },
  });
}

const counts = (m: Json) => ({
  collections: ((m.collections as unknown[]) ?? []).length,
  songs: ((m.songs as unknown[]) ?? []).length,
});

export async function publishDraft(db: D1Database, media: R2Bucket, author: string, note: string): Promise<Version> {
  const manifest = await draftManifest(db);
  const latest = await latestVersion(db);
  if (latest && latest.manifest === JSON.stringify(manifest)) {
    throw new EditError('publish', 'Nothing has changed since the last publish.');
  }
  await ensurePublishable(manifest, media);
  await goLive(media, manifest);
  await publishEntry(db, { author, note: note || 'Published', manifest, ...counts(manifest) }).run();
  return (await latestVersion(db))!;
}

/**
 * Makes an earlier version live again and puts it in the draft, so the
 * Studio and the garden match. Recorded as a new version, so it can be undone.
 */
export async function restoreVersion(db: D1Database, media: R2Bucket, author: string, id: number): Promise<Version> {
  const row = await db.prepare('SELECT manifest FROM publishes WHERE id = ?').bind(id).first<{ manifest: string }>();
  if (!row) throw new NotFound('That version no longer exists.');
  const stored = JSON.parse(row.manifest) as Json;
  const rows = manifestToRows(checkManifest(stored).manifest);
  const manifest = rowsToManifestJson(rows);
  await ensurePublishable(manifest, media);
  await goLive(media, manifest);
  await replaceGarden(db, rows, [
    publishEntry(db, { author, note: `Restored version ${id}`, manifest, ...counts(manifest) }),
  ]);
  return (await latestVersion(db))!;
}

/**
 * Whether the live song list is still the one the Studio last published (it
 * isn't if someone ran `npm run publish-media` afterwards, for example).
 */
export function liveMatches(liveRaw: unknown, lastPublished: string): boolean {
  const live = rowsToManifestJson(manifestToRows(checkManifest(liveRaw).manifest));
  return JSON.stringify(live) === lastPublished;
}

/**
 * Editing the draft garden: songs now, beds/decorations as later stages add
 * them. Every change is saved immediately (that's the Studio's autosave);
 * nothing reaches visitors until you publish.
 */
import type { D1Database } from './cloudflare.ts';
import { PLOTS, SANCTUARY_PLOTS, assignBeds } from '../../src/game/world/layout.ts';
import { environmentStatement, loadGarden } from './garden.ts';
import { DECORATION_PRESETS_LIST, type Decoration, type DecorationPreset } from '../../src/content/types.ts';
import { DECORATION_LIMITS, placementProblem } from '../../src/game/world/decorations.ts';
import { clampEnvironment, DEFAULT_ENVIRONMENT, ENVIRONMENT_KEYS, ENVIRONMENT_RANGES } from '../../src/game/world/environment.ts';
import { checkManifest, rowsToManifestJson } from './mapping.ts';
import { COLLECTION_FIELDS, EditError, MEDIA_COLUMNS, parseFields, SONG_FIELDS, uniqueId } from './edits.ts';

export class NotFound extends Error {}

const NOW = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`;

async function ids(db: D1Database, table: 'songs' | 'collections'): Promise<Set<string>> {
  const { results } = await db.prepare(`SELECT id FROM ${table}`).all<{ id: string }>();
  return new Set(results.map((r) => r.id));
}

async function checkReferences(db: D1Database, columns: Record<string, string | number | null>): Promise<void> {
  if (typeof columns.collection_id === 'string') {
    const bed = await db.prepare('SELECT id FROM collections WHERE id = ?').bind(columns.collection_id).first();
    if (!bed) throw new EditError('collectionId', 'That bed doesn’t exist any more. Pick another.');
  }
  for (const column of MEDIA_COLUMNS) {
    const value = columns[column];
    if (typeof value !== 'string' || !value.startsWith('media/')) continue;
    const known = await db.prepare('SELECT key FROM media WHERE key = ?').bind(value).first();
    if (!known) throw new EditError(column, 'That file isn’t in your media library. Upload it again.');
  }
}

/** Keeps release fields consistent: only upcoming songs can be teasers. */
function normalizeSong(row: Record<string, string | number | null>): void {
  if (row.status !== 'upcoming') row.teaser = 0;
}

export async function createSong(db: D1Database, body: Record<string, unknown>): Promise<string> {
  const defaults = await db
    .prepare(
      `SELECT (SELECT artist FROM songs GROUP BY artist ORDER BY COUNT(*) DESC LIMIT 1) AS artist,
              (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM songs) AS next_order`,
    )
    .first<{ artist: string | null; next_order: number }>();
  const columns = parseFields(SONG_FIELDS, {
    artist: defaults?.artist ?? 'Skar',
    genre: 'other',
    status: typeof body.audio === 'string' && body.audio ? 'released' : 'unreleased',
    teaser: false,
    ...body,
  });
  if (typeof columns.title !== 'string') throw new EditError('title', 'Title can’t be empty.');
  if (typeof columns.collection_id !== 'string') throw new EditError('collectionId', 'Choose a bed for the song.');
  await checkReferences(db, columns);
  normalizeSong(columns);

  const id = uniqueId(columns.title, await ids(db, 'songs'), 'song');
  const row = { id, sort_order: defaults?.next_order ?? 0, ...columns };
  const keys = Object.keys(row);
  await db
    .prepare(`INSERT INTO songs (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`)
    .bind(...keys.map((k) => row[k as keyof typeof row]))
    .run();
  return id;
}

export async function updateSong(db: D1Database, id: string, body: Record<string, unknown>): Promise<void> {
  const current = await db.prepare('SELECT * FROM songs WHERE id = ?').bind(id).first<Record<string, string | number | null>>();
  if (!current) throw new NotFound('That song doesn’t exist any more. It may have been deleted.');
  const changes = parseFields(SONG_FIELDS, body);
  if (Object.keys(changes).length === 0) return;
  await checkReferences(db, changes);
  const next = { ...current, ...changes };
  normalizeSong(next);
  const columns = [...new Set([...Object.keys(changes), 'teaser'])];
  await db
    .prepare(`UPDATE songs SET ${columns.map((c) => `${c} = ?`).join(', ')}, updated_at = ${NOW} WHERE id = ?`)
    .bind(...columns.map((c) => next[c] ?? null), id)
    .run();
}

export async function deleteSong(db: D1Database, id: string): Promise<void> {
  const found = await db.prepare('SELECT id FROM songs WHERE id = ?').bind(id).first();
  if (!found) throw new NotFound('That song was already deleted.');
  await db.prepare('DELETE FROM songs WHERE id = ?').bind(id).run();
}

// ---------- beds ----------

/** Spots a bed in each garden area can be pinned to. The vault (hidden) has a single shrine. */
export function spotsFor(area: string): string[] {
  if (area === 'main') return PLOTS.map((p) => p.id);
  if (area === 'ep-garden') return SANCTUARY_PLOTS.map((p) => p.id);
  return [];
}

/** Where the game currently places each bed (bed id → spot id). */
async function currentSpots(db: D1Database): Promise<Map<string, string>> {
  const { manifest } = checkManifest(rowsToManifestJson(await loadGarden(db)));
  const a = assignBeds(manifest.collections);
  return new Map([
    ...a.main.filter((s) => s.collection).map((s) => [s.collection!.id, s.plot.id] as [string, string]),
    ...a.sanctuary.filter((s) => s.collection).map((s) => [s.collection!.id, s.plot.id] as [string, string]),
  ]);
}

export async function createCollection(db: D1Database, body: Record<string, unknown>): Promise<string> {
  const columns = parseFields(COLLECTION_FIELDS, { type: 'album', area: 'main', autoBloom: false, ...body });
  if (typeof columns.title !== 'string') throw new EditError('title', 'Give the bed a name.');
  await checkReferences(db, columns);
  const next = await db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM collections').first<{ n: number }>();
  const id = uniqueId(columns.title, await ids(db, 'collections'), 'bed');
  const row = { id, sort_order: next?.n ?? 0, ...columns };
  const keys = Object.keys(row);
  await db
    .prepare(`INSERT INTO collections (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`)
    .bind(...keys.map((k) => row[k as keyof typeof row]))
    .run();
  return id;
}

export async function updateCollection(db: D1Database, id: string, body: Record<string, unknown>): Promise<void> {
  const current = await db
    .prepare('SELECT id, area, plot FROM collections WHERE id = ?')
    .bind(id)
    .first<{ id: string; area: string; plot: string | null }>();
  if (!current) throw new NotFound('That bed doesn’t exist any more. It may have been deleted.');
  const changes = parseFields(COLLECTION_FIELDS, body);
  await checkReferences(db, changes);
  const area = (changes.area as string | undefined) ?? current.area;
  const statements = [];

  if ('plot' in body) {
    const plot = body.plot;
    if (plot === null || plot === '') {
      changes.plot = null;
    } else if (typeof plot === 'string' && spotsFor(area).includes(plot)) {
      changes.plot = plot;
      // Whoever is in that spot now (pinned or placed automatically) swaps
      // into this bed's current spot, so both stay exactly where you expect.
      const spots = await currentSpots(db);
      const occupant = [...spots].find(([, spot]) => spot === plot)?.[0];
      if (occupant && occupant !== id) {
        const mine = area === current.area ? spots.get(id) ?? null : null;
        statements.push(db.prepare(`UPDATE collections SET plot = ?, updated_at = ${NOW} WHERE id = ?`).bind(mine, occupant));
      }
    } else {
      throw new EditError('plot', 'That spot isn’t in this part of the garden.');
    }
  } else if (changes.area !== undefined && changes.area !== current.area) {
    changes.plot = null; // Spots belong to an area.
  }

  const columns = Object.keys(changes);
  if (columns.length === 0) return;
  statements.push(
    db
      .prepare(`UPDATE collections SET ${columns.map((c) => `${c} = ?`).join(', ')}, updated_at = ${NOW} WHERE id = ?`)
      .bind(...columns.map((c) => changes[c] ?? null), id),
  );
  await db.batch(statements);
}

export async function deleteCollection(db: D1Database, id: string): Promise<void> {
  const row = await db
    .prepare('SELECT title, (SELECT COUNT(*) FROM songs WHERE collection_id = ?1) AS songs FROM collections WHERE id = ?1')
    .bind(id)
    .first<{ title: string; songs: number }>();
  if (!row) throw new NotFound('That bed was already deleted.');
  if (row.songs > 0) {
    throw new EditError('collection', `“${row.title}” still has ${row.songs} song${row.songs === 1 ? '' : 's'}. Move or delete them first.`);
  }
  await db.prepare('DELETE FROM collections WHERE id = ?').bind(id).run();
}

/** Sets the order of beds (it decides which spots automatic beds fill first). */
export async function orderCollections(db: D1Database, order: unknown): Promise<void> {
  const known = await ids(db, 'collections');
  if (!Array.isArray(order) || order.length !== known.size || !order.every((id) => typeof id === 'string' && known.has(id))) {
    throw new EditError('order', 'The bed list changed while you were sorting. Reload and try again.');
  }
  await db.batch(order.map((id, i) => db.prepare('UPDATE collections SET sort_order = ? WHERE id = ?').bind(i, id)));
}

/**
 * Puts songs into a bed in the given order (drag a song into another bed, or
 * reorder within one). Songs not listed keep their place.
 */
export async function placeSongs(db: D1Database, collectionId: unknown, songIds: unknown): Promise<void> {
  if (typeof collectionId !== 'string') throw new EditError('collectionId', 'Choose a bed.');
  const bed = await db.prepare('SELECT id FROM collections WHERE id = ?').bind(collectionId).first();
  if (!bed) throw new EditError('collectionId', 'That bed doesn’t exist any more.');
  const known = await ids(db, 'songs');
  if (!Array.isArray(songIds) || songIds.length === 0 || songIds.length > 500 || !songIds.every((id) => typeof id === 'string' && known.has(id))) {
    throw new EditError('order', 'Some of those songs no longer exist. Reload and try again.');
  }
  await db.batch(
    songIds.map((id, i) =>
      db.prepare(`UPDATE songs SET collection_id = ?, sort_order = ?, updated_at = ${NOW} WHERE id = ?`).bind(collectionId, i, id),
    ),
  );
}

// ---------- decorations & atmosphere ----------

const num = (v: unknown, field: string, min: number, max: number, label: string): number => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw new EditError(field, `${label} must be a number from ${min} to ${max}.`);
  return v;
};

async function allDecorations(db: D1Database): Promise<Decoration[]> {
  const { results } = await db.prepare('SELECT id, preset, x, z, rotation, scale FROM decorations').all<Decoration>();
  return results;
}

/** Applies placement rules shared with the game; refuses spots that would block the way. */
function checkSpot(d: Decoration, others: Decoration[]): void {
  const problem = placementProblem(d, others);
  if (problem) throw new EditError('position', problem);
}

function parseDecoration(body: Record<string, unknown>, current?: Decoration): Decoration {
  const preset = body.preset ?? current?.preset;
  if (typeof preset !== 'string' || !(DECORATION_PRESETS_LIST as readonly string[]).includes(preset)) {
    throw new EditError('preset', 'Pick a decoration from the catalog.');
  }
  return {
    id: current?.id ?? '',
    preset: preset as DecorationPreset,
    x: Math.round(num(body.x ?? current?.x, 'position', -40, 40, 'Position') * 100) / 100,
    z: Math.round(num(body.z ?? current?.z, 'position', -40, 40, 'Position') * 100) / 100,
    rotation: ((Math.round(num(body.rotation ?? current?.rotation ?? 0, 'rotation', -720, 720, 'Rotation')) % 360) + 360) % 360,
    scale: num(body.scale ?? current?.scale ?? 1, 'scale', DECORATION_LIMITS.minScale, DECORATION_LIMITS.maxScale, 'Size'),
  };
}

export async function createDecoration(db: D1Database, body: Record<string, unknown>): Promise<string> {
  const others = await allDecorations(db);
  if (others.length >= DECORATION_LIMITS.max) {
    throw new EditError('preset', `The garden holds up to ${DECORATION_LIMITS.max} decorations, so it stays smooth on phones. Remove one first.`);
  }
  const d = parseDecoration(body);
  checkSpot(d, others);
  const taken = new Set(others.map((o) => o.id));
  let n = 1;
  while (taken.has(`${d.preset}-${n}`)) n++;
  d.id = `${d.preset}-${n}`;
  await db
    .prepare('INSERT INTO decorations (id, preset, x, z, rotation, scale) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(d.id, d.preset, d.x, d.z, d.rotation, d.scale)
    .run();
  return d.id;
}

export async function updateDecoration(db: D1Database, id: string, body: Record<string, unknown>): Promise<void> {
  const others = await allDecorations(db);
  const current = others.find((o) => o.id === id);
  if (!current) throw new NotFound('That decoration was removed.');
  const d = parseDecoration({ ...body, preset: current.preset }, current);
  checkSpot(d, others);
  await db.prepare('UPDATE decorations SET x = ?, z = ?, rotation = ?, scale = ? WHERE id = ?').bind(d.x, d.z, d.rotation, d.scale, id).run();
}

export async function deleteDecoration(db: D1Database, id: string): Promise<void> {
  const found = await db.prepare('SELECT id FROM decorations WHERE id = ?').bind(id).first();
  if (!found) throw new NotFound('That decoration was already removed.');
  await db.prepare('DELETE FROM decorations WHERE id = ?').bind(id).run();
}

/** Saves atmosphere settings, clamped to the game's safe ranges. */
export async function saveEnvironment(db: D1Database, body: Record<string, unknown>): Promise<void> {
  if (body.reset === true) {
    await environmentStatement(db, null).run();
    return;
  }
  const current = (await loadGarden(db)).environment ?? DEFAULT_ENVIRONMENT;
  const next = { ...current };
  for (const key of ENVIRONMENT_KEYS) {
    if (!(key in body)) continue;
    const r = ENVIRONMENT_RANGES[key];
    next[key] = num(body[key], key, r.min, r.max, key);
  }
  await environmentStatement(db, clampEnvironment(next)).run();
}

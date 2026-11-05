/** Reading and writing the draft garden and publish history in the database. */
import type { D1Database, D1PreparedStatement } from './cloudflare.ts';
import type { CollectionRow, DecorationRow, GardenRows, SongRow } from './mapping.ts';
import type { GardenEnvironment } from '../../src/content/types.ts';

const COLLECTION_COLUMNS = ['id', 'title', 'type', 'area', 'cover', 'description', 'auto_bloom', 'sort_order', 'plot'] as const;
const SONG_COLUMNS = [
  'id', 'collection_id', 'title', 'artist', 'genre', 'status', 'audio', 'preview', 'cover',
  'release_date', 'teaser', 'flower_species', 'flower_hue', 'flower_scale', 'flower_color', 'flower_core',
  'flower_label', 'description', 'sort_order',
] as const;

const insertSql = (table: string, columns: readonly string[]) =>
  `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`;

const DECORATION_COLUMNS = ['id', 'preset', 'x', 'z', 'rotation', 'scale'] as const;

export async function loadGarden(db: D1Database): Promise<Required<GardenRows>> {
  const [collections, songs, decorations, environment] = await Promise.all([
    db.prepare(`SELECT ${COLLECTION_COLUMNS.join(', ')} FROM collections ORDER BY sort_order, id`).all<CollectionRow>(),
    db.prepare(`SELECT ${SONG_COLUMNS.join(', ')} FROM songs ORDER BY sort_order, id`).all<SongRow>(),
    db.prepare(`SELECT ${DECORATION_COLUMNS.join(', ')} FROM decorations ORDER BY created_at, id`).all<DecorationRow>(),
    db.prepare(`SELECT value FROM settings WHERE key = 'environment'`).first<{ value: string }>(),
  ]);
  return {
    collections: collections.results,
    songs: songs.results,
    decorations: decorations.results,
    environment: environment ? (JSON.parse(environment.value) as GardenEnvironment) : null,
  };
}

/** Statement saving the atmosphere settings (null = back to the original sunset). */
export function environmentStatement(db: D1Database, environment: GardenEnvironment | null) {
  return environment
    ? db
        .prepare(
          `INSERT INTO settings (key, value) VALUES ('environment', ?)
           ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
        )
        .bind(JSON.stringify(environment))
    : db.prepare(`DELETE FROM settings WHERE key = 'environment'`);
}

export async function gardenCounts(db: D1Database): Promise<{ collections: number; songs: number }> {
  const row = await db
    .prepare('SELECT (SELECT COUNT(*) FROM collections) AS collections, (SELECT COUNT(*) FROM songs) AS songs')
    .first<{ collections: number; songs: number }>();
  return { collections: row?.collections ?? 0, songs: row?.songs ?? 0 };
}

/**
 * Replaces the whole draft in one transaction (used by import and, later,
 * rollback). `alsoRun` statements join the same transaction.
 */
export async function replaceGarden(db: D1Database, rows: GardenRows, alsoRun: D1PreparedStatement[] = []): Promise<void> {
  await db.batch([
    db.prepare('DELETE FROM songs'),
    db.prepare('DELETE FROM collections'),
    db.prepare('DELETE FROM decorations'),
    ...(rows.decorations ?? []).map((d) => db.prepare(insertSql('decorations', DECORATION_COLUMNS)).bind(...DECORATION_COLUMNS.map((k) => d[k]))),
    environmentStatement(db, rows.environment ?? null),
    ...rows.collections.map((c) =>
      db.prepare(insertSql('collections', COLLECTION_COLUMNS)).bind(...COLLECTION_COLUMNS.map((k) => c[k])),
    ),
    ...rows.songs.map((s) => db.prepare(insertSql('songs', SONG_COLUMNS)).bind(...SONG_COLUMNS.map((k) => s[k]))),
    ...alsoRun,
  ]);
}

export interface PublishSummary {
  id: number;
  createdAt: string;
  author: string;
  note: string | null;
  collections: number;
  songs: number;
}

export async function lastPublish(db: D1Database): Promise<PublishSummary | null> {
  const row = await db
    .prepare(
      `SELECT id, created_at AS createdAt, author, note, collection_count AS collections, song_count AS songs
       FROM publishes ORDER BY id DESC LIMIT 1`,
    )
    .first<PublishSummary>();
  return row ?? null;
}

/** A statement that adds one entry to the publish history. */
export function publishEntry(
  db: D1Database,
  entry: { author: string; note: string; manifest: Record<string, unknown>; collections: number; songs: number },
): D1PreparedStatement {
  return db
    .prepare('INSERT INTO publishes (author, note, manifest, collection_count, song_count) VALUES (?, ?, ?, ?, ?)')
    .bind(entry.author, entry.note, JSON.stringify(entry.manifest), entry.collections, entry.songs);
}

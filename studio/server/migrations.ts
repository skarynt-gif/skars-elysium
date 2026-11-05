/**
 * Database layout, applied automatically.
 *
 * The Studio sets up (and later upgrades) its own tables the first time it
 * runs, so there is no database command to type. Each migration runs once,
 * inside a single transaction, and is recorded in `studio_migrations`.
 *
 * Never edit a migration that has shipped; add a new one instead.
 */
import type { D1Database } from './cloudflare.ts';

export interface Migration {
  id: number;
  name: string;
  statements: string[];
}

const NOW = `(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;

export const MIGRATIONS: Migration[] = [
  {
    id: 1,
    name: 'garden draft and publish history',
    statements: [
      // Beds (albums, EPs, singles, genre beds, the vault). This is the
      // *draft*: visitors only see it after you publish.
      `CREATE TABLE collections (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        type TEXT NOT NULL,
        area TEXT NOT NULL DEFAULT 'main',
        cover TEXT,
        description TEXT,
        auto_bloom INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT ${NOW}
      )`,
      // Songs (flowers). Media columns hold paths inside the media bucket
      // ("media/audio/x.mp3") or full URLs.
      `CREATE TABLE songs (
        id TEXT PRIMARY KEY,
        collection_id TEXT NOT NULL REFERENCES collections(id) ON UPDATE CASCADE,
        title TEXT NOT NULL,
        artist TEXT NOT NULL,
        genre TEXT NOT NULL,
        status TEXT NOT NULL,
        audio TEXT,
        preview TEXT,
        cover TEXT,
        release_date TEXT,
        teaser INTEGER NOT NULL DEFAULT 0,
        flower_species TEXT,
        flower_hue REAL,
        flower_scale REAL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT ${NOW}
      )`,
      `CREATE INDEX songs_by_collection ON songs (collection_id, sort_order)`,
      // Every version visitors have seen, newest last. Each row is the exact
      // manifest that went live, so any version can be restored.
      `CREATE TABLE publishes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT NOT NULL DEFAULT ${NOW},
        author TEXT NOT NULL,
        note TEXT,
        manifest TEXT NOT NULL,
        collection_count INTEGER NOT NULL,
        song_count INTEGER NOT NULL
      )`,
    ],
  },
  {
    id: 2,
    name: 'media library',
    statements: [
      // Every file in the media bucket the Studio knows about (uploads and
      // files that came in by import). size 0 = referenced but missing.
      `CREATE TABLE media (
        key TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        content_type TEXT NOT NULL,
        size INTEGER NOT NULL,
        original_name TEXT,
        duration REAL,
        created_at TEXT NOT NULL DEFAULT ${NOW}
      )`,
    ],
  },
  {
    id: 3,
    name: 'bed spots',
    statements: [
      // Fixed spot on the garden map (a plot id); NULL = fill automatically.
      `ALTER TABLE collections ADD COLUMN plot TEXT`,
    ],
  },
  {
    id: 4,
    name: 'flower editor',
    statements: [
      `ALTER TABLE songs ADD COLUMN description TEXT`,
      `ALTER TABLE songs ADD COLUMN flower_color TEXT`,
      `ALTER TABLE songs ADD COLUMN flower_core TEXT`,
      `ALTER TABLE songs ADD COLUMN flower_label TEXT`,
    ],
  },
  {
    id: 5,
    name: 'decorations and environment',
    statements: [
      `CREATE TABLE decorations (
        id TEXT PRIMARY KEY,
        preset TEXT NOT NULL,
        x REAL NOT NULL,
        z REAL NOT NULL,
        rotation REAL NOT NULL DEFAULT 0,
        scale REAL NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT ${NOW}
      )`,
      // Small named settings stored as JSON (e.g. "environment").
      `CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT ${NOW}
      )`,
    ],
  },
];

const LEDGER = `CREATE TABLE IF NOT EXISTS studio_migrations (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT ${NOW}
)`;

/** Applies any migrations not yet recorded. Returns the ids it applied. */
export async function migrate(db: D1Database, migrations: Migration[] = MIGRATIONS): Promise<number[]> {
  await db.prepare(LEDGER).run();
  const { results } = await db.prepare('SELECT id FROM studio_migrations').all<{ id: number }>();
  const done = new Set(results.map((r) => r.id));
  const applied: number[] = [];

  for (const migration of [...migrations].sort((a, b) => a.id - b.id)) {
    if (done.has(migration.id)) continue;
    try {
      // The ledger row goes first: if another request is migrating at the
      // same moment, its duplicate id aborts this whole transaction cleanly.
      await db.batch([
        db.prepare('INSERT INTO studio_migrations (id, name) VALUES (?, ?)').bind(migration.id, migration.name),
        ...migration.statements.map((sql) => db.prepare(sql)),
      ]);
      applied.push(migration.id);
    } catch (error) {
      const row = await db.prepare('SELECT id FROM studio_migrations WHERE id = ?').bind(migration.id).first();
      if (!row) throw error; // A real failure, not a race.
    }
  }
  return applied;
}

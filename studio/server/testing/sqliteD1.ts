/**
 * Test stand-ins: a D1-compatible database backed by Node's built-in SQLite
 * (D1 is SQLite too), and an in-memory R2 bucket.
 */
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { D1Database, D1PreparedStatement, D1Result, R2Bucket, R2ObjectBody } from '../cloudflare.ts';

export function createTestD1(): D1Database & { raw: DatabaseSync } {
  const raw = new DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = ON'); // D1 enforces foreign keys too.

  const statement = (sql: string, params: SQLInputValue[] = []): D1PreparedStatement & { exec(): D1Result } => {
    const exec = (): D1Result => {
      const prepared = raw.prepare(sql);
      return prepared.columns().length
        ? { results: prepared.all(...params) as Record<string, unknown>[], success: true }
        : (prepared.run(...params), { results: [], success: true });
    };
    return {
      bind: (...values: unknown[]) => statement(sql, values as SQLInputValue[]),
      first: async <T,>() => ((exec().results[0] as T | undefined) ?? null),
      all: async <T,>() => exec() as D1Result<T>,
      run: async () => exec(),
      exec,
    };
  };

  return {
    raw,
    prepare: (sql) => statement(sql),
    batch: async (statements) => {
      raw.exec('BEGIN');
      try {
        const results = statements.map((s) => (s as ReturnType<typeof statement>).exec());
        raw.exec('COMMIT');
        return results;
      } catch (error) {
        raw.exec('ROLLBACK');
        throw error;
      }
    },
  };
}

interface StoredFile {
  bytes: Uint8Array;
  contentType?: string;
  uploaded: Date;
}

/** In-memory R2 bucket. Supports the subset the Studio uses, including byte ranges. */
export function createTestR2(files: Record<string, string> = {}): R2Bucket & { files: Map<string, StoredFile> } {
  const store = new Map<string, StoredFile>(
    Object.entries(files).map(([k, v]) => [k, { bytes: new TextEncoder().encode(v), uploaded: new Date('2026-10-01T12:00:00Z') }]),
  );
  const info = (key: string, file: StoredFile) => ({
    key,
    size: file.bytes.length,
    uploaded: file.uploaded,
    httpEtag: `"${key.length}-${file.bytes.length}"`,
    writeHttpMetadata: (headers: Headers) => {
      if (file.contentType) headers.set('content-type', file.contentType);
    },
  });
  return {
    files: store,
    head: async (key) => {
      const file = store.get(key);
      return file ? info(key, file) : null;
    },
    get: async (key, options): Promise<R2ObjectBody | null> => {
      const file = store.get(key);
      if (!file) return null;
      let bytes = file.bytes;
      let range: { offset: number; length: number } | undefined;
      const header = options?.range?.get('range');
      const match = header ? /^bytes=(\d+)-(\d*)$/.exec(header) : null;
      if (match) {
        const start = Number(match[1]);
        const end = match[2] ? Math.min(Number(match[2]), bytes.length - 1) : bytes.length - 1;
        range = { offset: start, length: end - start + 1 };
        bytes = bytes.subarray(start, end + 1);
      }
      const body = new Response(bytes as Uint8Array<ArrayBuffer>).body ?? undefined;
      return { ...info(key, file), range, body, text: async () => new TextDecoder().decode(file.bytes) };
    },
    put: async (key, value, options) => {
      const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value instanceof ArrayBuffer ? value : value);
      store.set(key, { bytes: new Uint8Array(bytes), contentType: options?.httpMetadata?.contentType, uploaded: new Date() });
      return {};
    },
    delete: async (key) => {
      store.delete(key);
    },
  };
}

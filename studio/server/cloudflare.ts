/**
 * The small slices of Cloudflare's runtime APIs the Studio uses (D1 database,
 * R2 storage), declared here so the code type-checks and can be tested in
 * plain Node with stand-ins.
 */

export interface D1Result<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}

export interface D1Database {
  prepare(sql: string): D1PreparedStatement;
  /** Runs every statement in one transaction: all succeed or none do. */
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>;
}

export interface R2Range {
  offset?: number;
  length?: number;
  suffix?: number;
}

export interface R2ObjectInfo {
  key: string;
  size: number;
  uploaded: Date;
  httpEtag: string;
  range?: R2Range;
  writeHttpMetadata(headers: Headers): void;
}

export interface R2ObjectBody extends R2ObjectInfo {
  /** Missing when a conditional request (If-None-Match) matched: the browser's copy is current. */
  body?: ReadableStream;
  text(): Promise<string>;
}

export interface R2Bucket {
  head(key: string): Promise<R2ObjectInfo | null>;
  get(key: string, options?: { range?: Headers; onlyIf?: Headers }): Promise<R2ObjectBody | null>;
  put(
    key: string,
    value: ArrayBuffer | Uint8Array | string,
    options?: { httpMetadata?: { contentType?: string; cacheControl?: string } },
  ): Promise<unknown>;
  delete(key: string): Promise<void>;
}

/** Everything the Studio's Cloudflare project provides (Settings → Bindings / Variables). */
export interface StudioEnv {
  DB?: D1Database;
  MEDIA?: R2Bucket;
  /** Your Zero Trust team name, e.g. "skar" (from skar.cloudflareaccess.com). */
  ACCESS_TEAM_DOMAIN?: string;
  /** The Access application's "Application Audience (AUD) Tag". */
  ACCESS_AUD?: string;
  /** Comma-separated list of emails allowed into the Studio. */
  ADMIN_EMAILS?: string;
  /** Public garden address, for the "Open garden" link. */
  GARDEN_URL?: string;
  /** Local development only: honoured exclusively on localhost. */
  DEV_AUTH_EMAIL?: string;
}

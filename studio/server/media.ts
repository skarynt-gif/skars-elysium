/**
 * Song and artwork uploads.
 *
 * Files are checked by their actual contents (not just the name), limited in
 * size, and stored in the media bucket under a fresh, unguessable name such
 * as media/audio/slow-burn-k3x9q2.mp3. Fresh names matter: visitors' browsers
 * cache media for a day, so a replaced file always gets a new name and shows
 * up instantly.
 */
import type { D1Database } from './cloudflare.ts';

export const MEDIA_KINDS = ['audio', 'preview', 'cover'] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

const FOLDERS: Record<MediaKind, string> = { audio: 'audio', preview: 'previews', cover: 'covers' };

/** Size limits. Pages Functions accept bodies up to 100 MB on the free plan. */
export const MAX_BYTES: Record<MediaKind, number> = {
  audio: 60 * 1024 * 1024,
  preview: 15 * 1024 * 1024,
  cover: 6 * 1024 * 1024,
};

interface Detected {
  ext: string;
  contentType: string;
  family: 'audio' | 'image';
}

const ascii = (bytes: Uint8Array, start: number, length: number) =>
  String.fromCharCode(...bytes.subarray(start, start + length));

/** Identifies a file from its first bytes. Only formats every visitor's device can use are accepted. */
export function detectFormat(bytes: Uint8Array): Detected | { unsupported: string } | null {
  if (bytes.length < 12) return null;
  // Images
  if (bytes[0] === 0x89 && ascii(bytes, 1, 3) === 'PNG') return { ext: 'png', contentType: 'image/png', family: 'image' };
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { ext: 'jpg', contentType: 'image/jpeg', family: 'image' };
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return { ext: 'webp', contentType: 'image/webp', family: 'image' };
  if (ascii(bytes, 0, 4) === 'GIF8') return { ext: 'gif', contentType: 'image/gif', family: 'image' };
  if (ascii(bytes, 4, 4) === 'ftyp') {
    const brand = ascii(bytes, 8, 4);
    if (brand === 'avif' || brand === 'avis') return { ext: 'avif', contentType: 'image/avif', family: 'image' };
    if (brand.startsWith('M4') || brand === 'mp42' || brand === 'isom' || brand === 'dash' || brand === 'iso2') {
      return { ext: 'm4a', contentType: 'audio/mp4', family: 'audio' };
    }
    if (brand.startsWith('qt') || brand.startsWith('3g')) return { unsupported: 'a video file' };
  }
  // Audio
  if (ascii(bytes, 0, 3) === 'ID3') return { ext: 'mp3', contentType: 'audio/mpeg', family: 'audio' };
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WAVE') return { ext: 'wav', contentType: 'audio/wav', family: 'audio' };
  if (bytes[0] === 0xff && (bytes[1]! & 0xf6) === 0xf0) return { ext: 'aac', contentType: 'audio/aac', family: 'audio' };
  if (bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0) return { ext: 'mp3', contentType: 'audio/mpeg', family: 'audio' };
  if (ascii(bytes, 0, 4) === 'OggS') return { unsupported: 'OGG/Opus (iPhones can’t play it)' };
  if (ascii(bytes, 0, 4) === 'fLaC') return { unsupported: 'FLAC (iPhones can’t play it reliably)' };
  if (ascii(bytes, 0, 4) === '<svg' || ascii(bytes, 0, 5) === '<?xml' || bytes[0] === 0x3c) return { unsupported: 'a web page or SVG' };
  return null;
}

/** "My Song (Final).mp3" → "my-song-final" */
export function slugify(name: string, fallback = 'file'): string {
  const base = name.replace(/\.[^.]*$/, '');
  const slug = base
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/, '');
  return slug || fallback;
}

function randomSuffix(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');
}

export function mediaKeyFor(kind: MediaKind, originalName: string, ext: string, suffix = randomSuffix()): string {
  return `media/${FOLDERS[kind]}/${slugify(originalName, kind)}-${suffix}.${ext}`;
}

export type UploadCheck =
  | { ok: true; key: string; contentType: string }
  | { ok: false; status: 400 | 413 | 415; error: string };

/** Decides whether an upload is acceptable and where it goes. */
export function checkUpload(kind: string, originalName: string, bytes: Uint8Array): UploadCheck {
  if (!(MEDIA_KINDS as readonly string[]).includes(kind)) {
    return { ok: false, status: 400, error: 'Unknown upload type.' };
  }
  const k = kind as MediaKind;
  if (bytes.length === 0) return { ok: false, status: 400, error: 'The file is empty.' };
  if (bytes.length > MAX_BYTES[k]) {
    const mb = Math.round(MAX_BYTES[k] / 1024 / 1024);
    return { ok: false, status: 413, error: `That file is too large. ${k === 'cover' ? 'Artwork' : 'Audio'} can be up to ${mb} MB.` };
  }
  const detected = detectFormat(bytes);
  const wanted = k === 'cover' ? 'image' : 'audio';
  const help =
    wanted === 'audio' ? 'Use an MP3 (best), M4A/AAC or WAV file.' : 'Use a JPG, PNG or WebP image.';
  if (!detected) return { ok: false, status: 415, error: `That file type isn't recognised. ${help}` };
  if ('unsupported' in detected) return { ok: false, status: 415, error: `That looks like ${detected.unsupported}. ${help}` };
  if (detected.family !== wanted) {
    return { ok: false, status: 415, error: `That's ${detected.family === 'image' ? 'an image' : 'audio'}, not ${wanted === 'image' ? 'artwork' : 'audio'}. ${help}` };
  }
  return { ok: true, key: mediaKeyFor(k, originalName, detected.ext), contentType: detected.contentType };
}

// ---------- library ----------

export interface MediaRow {
  key: string;
  kind: MediaKind;
  content_type: string;
  size: number;
  original_name: string | null;
  duration: number | null;
  created_at: string;
}

export async function listMedia(db: D1Database): Promise<MediaRow[]> {
  const { results } = await db
    .prepare('SELECT key, kind, content_type, size, original_name, duration, created_at FROM media ORDER BY created_at DESC, key')
    .all<MediaRow>();
  return results;
}

export function recordMedia(
  db: D1Database,
  row: Omit<MediaRow, 'created_at'>,
) {
  return db
    .prepare(
      `INSERT INTO media (key, kind, content_type, size, original_name, duration) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (key) DO NOTHING`,
    )
    .bind(row.key, row.kind, row.content_type, row.size, row.original_name, row.duration);
}

/** Where a file is used: the draft and every published version, so nothing a rollback needs is deleted. */
export async function mediaUsage(db: D1Database, key: string): Promise<{ draft: string[]; publishedVersions: number[] }> {
  const draft = await db
    .prepare(
      `SELECT title FROM songs WHERE audio = ?1 OR preview = ?1 OR cover = ?1
       UNION ALL SELECT title FROM collections WHERE cover = ?1`,
    )
    .bind(key)
    .all<{ title: string }>();
  const published = await db
    .prepare(`SELECT id FROM publishes WHERE instr(manifest, ?1) > 0 ORDER BY id`)
    .bind(JSON.stringify(key))
    .all<{ id: number }>();
  return { draft: draft.results.map((r) => r.title), publishedVersions: published.results.map((r) => r.id) };
}

/** Accepts only well-formed keys inside the Studio's media folders. */
export function isMediaKey(value: string): boolean {
  return /^media\/(?:audio|previews|covers)\/[a-z0-9][a-z0-9._-]{0,120}$/i.test(value) && !value.includes('..');
}

/** Guesses the kind of an existing file from where it's used (for files that came in by import). */
export function kindFromField(field: 'audio' | 'preview' | 'cover'): MediaKind {
  return field;
}

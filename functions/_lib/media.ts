/**
 * Pure rules for serving media from R2 (no Cloudflare APIs here, so they're
 * unit-tested in Node). Used by functions/media/[[path]].ts.
 */

/** File types the garden serves. Anything else in the bucket stays private. */
export const CONTENT_TYPES: Record<string, string> = {
  json: 'application/json; charset=utf-8',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  wav: 'audio/wav',
  flac: 'audio/flac',
  webp: 'image/webp',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  avif: 'image/avif',
};

/** The one manifest file visitors fetch; re-checked on every visit so new songs appear right away. */
export const MANIFEST_KEY = 'manifest.json';

/**
 * Turns the URL path after /media/ into a bucket key, or null if it's not
 * something we serve (unknown type, hidden file, path tricks).
 */
export function mediaKey(pathSegments: readonly string[]): string | null {
  if (pathSegments.length === 0 || pathSegments.length > 8) return null;
  const decoded: string[] = [];
  for (const raw of pathSegments) {
    let segment: string;
    try {
      segment = decodeURIComponent(raw);
    } catch {
      return null;
    }
    if (!segment || segment === '.' || segment === '..' || segment.startsWith('.')) return null;
    if (/[\\\u0000-\u001f]/.test(segment) || segment.includes('/')) return null;
    decoded.push(segment);
  }
  const key = decoded.join('/');
  return contentTypeFor(key) ? key : null;
}

export function contentTypeFor(key: string): string | null {
  const ext = key.split('.').pop()?.toLowerCase() ?? '';
  return CONTENT_TYPES[ext] ?? null;
}

/**
 * Caching: the manifest is revalidated every visit; media files are cached
 * for a day at the edge/browser (re-uploading a file under the same name
 * shows up within a day; new names show up instantly).
 */
export function cacheControlFor(key: string): string {
  if (key === MANIFEST_KEY) return 'no-cache';
  return 'public, max-age=86400, stale-while-revalidate=604800';
}

/** Content-Range header value for a ranged read, as browsers expect for audio seeking. */
export function contentRange(
  range: { offset?: number; length?: number; suffix?: number } | undefined,
  size: number,
): { start: number; end: number; header: string } | null {
  if (!range || size <= 0) return null;
  let start: number;
  let length: number;
  if (typeof range.suffix === 'number') {
    length = Math.min(range.suffix, size);
    start = size - length;
  } else {
    start = range.offset ?? 0;
    length = range.length ?? size - start;
  }
  if (start < 0 || start >= size || length <= 0) return null;
  const end = Math.min(size - 1, start + length - 1);
  return { start, end, header: `bytes ${start}-${end}/${size}` };
}

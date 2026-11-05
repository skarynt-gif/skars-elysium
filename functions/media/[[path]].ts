/**
 * Serves the garden's music, artwork and manifest from the R2 bucket bound
 * as MEDIA, at /media/<file>. Runs as a Cloudflare Pages Function, so media
 * shares the game's address: no custom domain and no CORS setup needed.
 *
 * Supports range requests (audio seeking/streaming), ETags (304 Not
 * Modified) and sensible caching. Only known media types are served.
 */
import { cacheControlFor, contentRange, contentTypeFor, mediaKey } from '../_lib/media.ts';

// Minimal shapes of the Cloudflare runtime APIs this function uses.
interface R2Range {
  offset?: number;
  length?: number;
  suffix?: number;
}
interface R2Object {
  size: number;
  httpEtag: string;
  range?: R2Range;
  body?: ReadableStream;
  writeHttpMetadata(headers: Headers): void;
}
interface R2Bucket {
  get(key: string, options?: { range?: Headers; onlyIf?: Headers }): Promise<R2Object | null>;
  head(key: string): Promise<R2Object | null>;
}
interface Context {
  request: Request;
  env: { MEDIA?: R2Bucket };
  params: { path?: string | string[] };
}

const notFound = () => new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } });

export async function onRequest({ request, env, params }: Context): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
  }
  if (!env.MEDIA) {
    return new Response('Media storage is not connected. Bind the R2 bucket as MEDIA (see DEPLOY.md).', { status: 500 });
  }

  const segments = Array.isArray(params.path) ? params.path : params.path ? [params.path] : [];
  const key = mediaKey(segments);
  if (!key) return notFound();

  const object =
    request.method === 'HEAD'
      ? await env.MEDIA.head(key)
      : await env.MEDIA.get(key, { range: request.headers, onlyIf: request.headers });
  if (!object) return notFound();

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('content-type', contentTypeFor(key)!);
  headers.set('etag', object.httpEtag);
  headers.set('cache-control', cacheControlFor(key));
  headers.set('accept-ranges', 'bytes');
  headers.set('x-content-type-options', 'nosniff');

  if (request.method === 'HEAD') {
    headers.set('content-length', String(object.size));
    return new Response(null, { status: 200, headers });
  }

  // A failed If-None-Match / If-Modified-Since check returns no body: the browser's copy is current.
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

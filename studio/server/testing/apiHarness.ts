/** Shared helpers for API tests: a fresh Studio with the demo garden, and a request helper. */
import { readdirSync, readFileSync } from 'node:fs';
import { handleApi, LIVE_MANIFEST_KEY, type ApiDeps } from '../api.ts';
import type { StudioEnv } from '../cloudflare.ts';
import { createTestD1, createTestR2 } from './sqliteD1.ts';

export const demoText = readFileSync('public/content/manifest.json', 'utf8');
export const mp3 = new Uint8Array(readFileSync('public/content/media/audio/slow-burn.mp3'));
export const webp = new Uint8Array(readFileSync('public/content/media/covers/velvet-hours.webp'));
const BASE = 'https://studio.pages.dev';
const signedIn: ApiDeps = { authenticate: async () => ({ ok: true, email: 'skar@example.com' }) };

export type Env = StudioEnv & { DB: ReturnType<typeof createTestD1>; MEDIA: ReturnType<typeof createTestR2> };
export const freshEnv = (allMedia = false): Env => {
  const MEDIA = createTestR2({ [LIVE_MANIFEST_KEY]: demoText });
  void MEDIA.put('media/audio/slow-burn.mp3', mp3, { httpMetadata: { contentType: 'audio/mpeg' } });
  if (allMedia) {
    // Every file the demo garden uses, as on a real deployment after `npm run publish-media`.
    for (const folder of ['audio', 'previews', 'covers']) {
      for (const name of readdirSync(`public/content/media/${folder}`)) {
        void MEDIA.put(`media/${folder}/${name}`, new Uint8Array(readFileSync(`public/content/media/${folder}/${name}`)));
      }
    }
  }
  return { DB: createTestD1(), MEDIA };
};

export async function call(env: StudioEnv, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const raw = body instanceof Uint8Array;
  const response = await handleApi(
    new Request(BASE + path, {
      method,
      headers: {
        ...(method === 'GET' || method === 'HEAD' ? {} : { 'x-studio': '1', origin: BASE }),
        ...(raw || body === undefined ? {} : { 'content-type': 'application/json' }),
        ...headers,
      },
      body: body === undefined ? undefined : raw ? (body as Uint8Array<ArrayBuffer>) : JSON.stringify(body),
    }),
    env,
    signedIn,
  );
  const text = await response.text();
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: response.status, data, headers: response.headers };
}

export async function imported(allMedia = false): Promise<Env> {
  const env = freshEnv(allMedia);
  await call(env, 'POST', '/api/import', {});
  return env;
}


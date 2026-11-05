import { contentTypeFor, MANIFEST_KEY } from '../functions/_lib/media.ts';
import type { Manifest } from '../src/content/types.ts';

/**
 * Which files to upload to R2, in a safe order: every song and image first,
 * the manifest last, so visitors never get a song list pointing at files
 * that haven't finished uploading.
 */
export interface Upload {
  /** Key in the bucket (mirrors the public/content folder). */
  key: string;
  /** Path on disk. */
  file: string;
  contentType: string;
}

export function publishPlan(manifest: Manifest, contentDir: string, manifestUrl: string): Upload[] {
  const files = new Set<string>();
  const add = (url: string | undefined) => {
    if (url?.startsWith('file:')) files.add(url);
  };
  for (const c of manifest.collections) add(c.cover);
  for (const s of manifest.songs) {
    add(s.audio);
    add(s.preview);
    add(s.cover);
  }

  const base = new URL('.', manifestUrl).href;
  const uploads: Upload[] = [];
  for (const url of [...files].sort()) {
    if (!url.startsWith(base)) throw new Error(`Media must live inside ${contentDir}: ${url}`);
    const key = decodeURIComponent(url.slice(base.length));
    const contentType = contentTypeFor(key);
    if (!contentType) throw new Error(`Unsupported file type for ${key}`);
    uploads.push({ key, file: decodeURIComponent(new URL(url).pathname), contentType });
  }
  uploads.push({ key: MANIFEST_KEY, file: decodeURIComponent(new URL(manifestUrl).pathname), contentType: contentTypeFor(MANIFEST_KEY)! });
  return uploads;
}

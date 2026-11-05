/**
 * Getting files from your computer into the media library.
 *
 * - Artwork is resized in the browser to a 600×600 square (WebP when the
 *   browser can make it, else JPEG) so the garden stays fast on phones.
 * - Audio is uploaded as-is; its length is read first for the library.
 * - Uploads report progress, which plain fetch can't do.
 */
import { ApiError, signInExpired, type MediaKind, type MediaRow } from './api.ts';

export const COVER_SIZE = 600;

export const ACCEPT: Record<MediaKind, string> = {
  audio: 'audio/mpeg,audio/mp4,audio/aac,audio/wav,audio/x-wav,.mp3,.m4a,.aac,.wav',
  preview: 'audio/mpeg,audio/mp4,audio/aac,audio/wav,audio/x-wav,.mp3,.m4a,.aac,.wav',
  cover: 'image/jpeg,image/png,image/webp,image/gif,image/avif',
};

/** Square crop from the center, scaled to COVER_SIZE. Pure math, unit-tested. */
export function coverCrop(width: number, height: number): { sx: number; sy: number; size: number } {
  const size = Math.min(width, height);
  return { sx: Math.round((width - size) / 2), sy: Math.round((height - size) / 2), size };
}

async function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** Resizes artwork. Animated GIFs and tiny images are kept as they are. */
export async function prepareCover(file: File): Promise<{ blob: Blob; name: string }> {
  if (file.type === 'image/gif') return { blob: file, name: file.name };
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('That image couldn’t be opened. Try saving it as a JPG or PNG first.');
  }
  const { sx, sy, size } = coverCrop(bitmap.width, bitmap.height);
  const target = Math.min(COVER_SIZE, size);
  const canvas = document.createElement('canvas');
  canvas.width = target;
  canvas.height = target;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { blob: file, name: file.name };
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, sx, sy, size, size, 0, 0, target, target);
  bitmap.close();
  const webp = await toBlob(canvas, 'image/webp', 0.86);
  // Safari can't encode WebP and quietly returns PNG instead.
  if (webp && webp.type === 'image/webp') return { blob: webp, name: file.name.replace(/\.[^.]*$/, '') + '.webp' };
  const jpeg = await toBlob(canvas, 'image/jpeg', 0.88);
  return { blob: jpeg ?? file, name: file.name.replace(/\.[^.]*$/, '') + '.jpg' };
}

/** Song length in seconds, or null if the browser can't tell within a few seconds. */
export function readDuration(file: Blob): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const done = (value: number | null) => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      audio.removeAttribute('src');
      resolve(value);
    };
    const timer = setTimeout(() => done(null), 5000);
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) ? audio.duration : null);
    audio.onerror = () => done(null);
    audio.src = url;
  });
}

export interface UploadProgress {
  loaded: number;
  total: number;
}

/** Uploads one file to the media library. */
export async function uploadFile(
  kind: MediaKind,
  file: File,
  onProgress: (progress: UploadProgress) => void = () => {},
): Promise<MediaRow> {
  let body: Blob = file;
  let name = file.name;
  let duration: number | null = null;
  if (kind === 'cover') ({ blob: body, name } = await prepareCover(file));
  else duration = await readDuration(file);

  const params = new URLSearchParams({ kind, name });
  if (duration) params.set('duration', duration.toFixed(2));

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', `/api/media?${params}`);
    xhr.setRequestHeader('x-studio', '1');
    xhr.setRequestHeader('content-type', body.type || 'application/octet-stream');
    xhr.upload.onprogress = (e) => onProgress({ loaded: e.loaded, total: e.lengthComputable ? e.total : body.size });
    xhr.onerror = () => reject(new ApiError('The upload was interrupted. Check your connection and try again.', 0));
    xhr.onload = () => {
      // An expired sign-in shows up as Access's login page instead of JSON.
      if (xhr.responseURL && new URL(xhr.responseURL).origin !== location.origin) return reject(signInExpired());
      let data: { file?: MediaRow; error?: string } | null = null;
      try {
        data = JSON.parse(xhr.responseText) as { file?: MediaRow; error?: string };
      } catch {
        data = null;
      }
      if (xhr.status >= 200 && xhr.status < 300 && data?.file) resolve(data.file);
      else reject(new ApiError(data?.error ?? `Upload failed (${xhr.status}).`, xhr.status));
    };
    xhr.send(body);
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || !Number.isFinite(seconds)) return '';
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export const isAudioFile = (file: File) => /^audio\//.test(file.type) || /\.(mp3|m4a|aac|wav)$/i.test(file.name);
export const isImageFile = (file: File) => /^image\//.test(file.type);

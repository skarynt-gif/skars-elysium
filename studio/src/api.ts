/** Talks to the Studio API (studio/server/api.ts). */
import type { ContentIssue } from '../../src/content/types.ts';
import type { CollectionRow, DecorationRow, SongRow } from '../server/mapping.ts';
import type { GardenEnvironment } from '../../src/content/types.ts';
import type { PublishSummary } from '../server/garden.ts';
import type { Change } from '../server/diff.ts';
import type { Version } from '../server/publish.ts';
import type { MediaKind, MediaRow } from '../server/media.ts';

export type { Change, Version, CollectionRow, SongRow, MediaKind, MediaRow, ContentIssue, DecorationRow, GardenEnvironment };

export interface Check {
  ok: boolean;
  message: string;
}

export interface StudioStatus {
  email: string;
  gardenUrl: string | null;
  database: Check;
  storage: Check;
  live: { found: boolean; updatedAt?: string; collections?: number; songs?: number; changedOutside?: boolean };
  draft: { collections: number; songs: number; problems: number; warnings: number; changes: number } | null;
  lastPublish: PublishSummary | null;
}

export interface DraftGarden {
  collections: CollectionRow[];
  songs: SongRow[];
  decorations: DecorationRow[];
  environment: GardenEnvironment | null;
  issues: ContentIssue[];
}

export interface ImportResult {
  collections: number;
  songs: number;
  issues: ContentIssue[];
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly field: string | undefined;
  /** Publishing: the list of things to fix. */
  readonly problems: string[];
  constructor(message: string, status: number, code?: string, field?: string, problems: string[] = []) {
    super(message);
    this.status = status;
    this.code = code;
    this.field = field;
    this.problems = problems;
  }
}

/** Status 0 = the request never reached the Studio (offline, or sign-in expired). */
export const signInExpired = () => new ApiError('Your sign-in has expired. Reload the page to sign in again.', 0, 'auth');

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      // When the Access session expires, Access redirects to its login page.
      // Not following it lets the Studio say so instead of failing oddly.
      redirect: 'manual',
      headers: method === 'GET' ? {} : { 'content-type': 'application/json', 'x-studio': '1' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Couldn't reach the Studio. Check your internet connection and try again.", 0);
  }
  if (response.type === 'opaqueredirect') throw signInExpired();

  const data = (await response.json().catch(() => null)) as (T & { error?: string; code?: string; field?: string; problems?: string[] }) | null;
  if (!response.ok || data === null) {
    throw new ApiError(
      data?.error ?? `The Studio answered with an error (${response.status}).`,
      response.status,
      data?.code,
      data?.field,
      data?.problems ?? [],
    );
  }
  return data;
}

/** The URL the Studio page uses to play or show a media file. */
export function fileUrl(ref: string | null | undefined): string | null {
  if (!ref) return null;
  if (/^https?:\/\//.test(ref)) return ref;
  return `/api/draft/${ref.split('/').map(encodeURIComponent).join('/')}`;
}

export const api = {
  status: () => request<StudioStatus>('GET', '/api/status'),
  garden: () => request<DraftGarden>('GET', '/api/garden'),
  importLive: (replace: boolean) => request<ImportResult>('POST', '/api/import', { replace }),
  media: () => request<{ files: MediaRow[] }>('GET', '/api/media'),
  deleteMedia: (key: string) => request<{ deleted: string }>('DELETE', `/api/media?key=${encodeURIComponent(key)}`),
  createSong: (fields: Record<string, unknown>) => request<DraftGarden & { id: string }>('POST', '/api/songs', fields),
  updateSong: (id: string, fields: Record<string, unknown>) =>
    request<DraftGarden>('PATCH', `/api/songs/${encodeURIComponent(id)}`, fields),
  deleteSong: (id: string) => request<DraftGarden>('DELETE', `/api/songs/${encodeURIComponent(id)}`),
  updateCollection: (id: string, fields: Record<string, unknown>) =>
    request<DraftGarden>('PATCH', `/api/collections/${encodeURIComponent(id)}`, fields),
  createCollection: (fields: Record<string, unknown>) => request<DraftGarden & { id: string }>('POST', '/api/collections', fields),
  deleteCollection: (id: string) => request<DraftGarden>('DELETE', `/api/collections/${encodeURIComponent(id)}`),
  orderCollections: (ids: string[]) => request<DraftGarden>('POST', '/api/collections/order', { ids }),
  createDecoration: (fields: Record<string, unknown>) => request<DraftGarden & { id: string }>('POST', '/api/decorations', fields),
  updateDecoration: (id: string, fields: Record<string, unknown>) =>
    request<DraftGarden>('PATCH', `/api/decorations/${encodeURIComponent(id)}`, fields),
  deleteDecoration: (id: string) => request<DraftGarden>('DELETE', `/api/decorations/${encodeURIComponent(id)}`),
  saveEnvironment: (fields: Record<string, unknown>) => request<DraftGarden>('PUT', '/api/environment', fields),
  changes: () => request<{ changes: Change[]; issues: ContentIssue[]; lastPublish: PublishSummary | null }>('GET', '/api/changes'),
  publish: (note: string) => request<{ version: Version }>('POST', '/api/publish', { note }),
  versions: () => request<{ versions: Version[] }>('GET', '/api/publishes'),
  restore: (id: number) => request<DraftGarden & { version: Version }>('POST', `/api/publishes/${id}/restore`, {}),
  placeSongs: (collectionId: string, ids: string[]) =>
    request<DraftGarden>('POST', `/api/collections/${encodeURIComponent(collectionId)}/songs`, { ids }),
};

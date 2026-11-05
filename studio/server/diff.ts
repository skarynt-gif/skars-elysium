/**
 * What changed between two versions of the garden, in plain words, so you
 * can see exactly what publishing will do before you press the button.
 * Works on manifest JSON (the format visitors receive).
 */

import { DEFAULT_ENVIRONMENT } from '../../src/game/world/environment.ts';

export interface Change {
  kind: 'added' | 'removed' | 'changed';
  what: 'song' | 'bed' | 'decorations' | 'atmosphere';
  name: string;
  /** For "changed": which aspects changed, e.g. ["release date", "flower"]. */
  details: string[];
}

type Json = Record<string, unknown>;

const SONG_ASPECTS: Record<string, string> = {
  title: 'title',
  artist: 'artist',
  collectionId: 'bed',
  genre: 'genre',
  status: 'release state',
  teaser: 'release state',
  releaseDate: 'release date',
  audio: 'full song',
  preview: 'preview snippet',
  cover: 'cover art',
  flower: 'flower look',
  description: 'description',
  order: 'position in its bed',
};

const BED_ASPECTS: Record<string, string> = {
  title: 'name',
  type: 'type',
  area: 'part of the garden',
  plot: 'spot',
  cover: 'cover art',
  description: 'description',
  autoBloom: 'auto-bloom',
  order: 'order',
};

const list = (m: Json | null, key: string): Json[] => (m && Array.isArray(m[key]) ? (m[key] as Json[]) : []);
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function compare(before: Json[], after: Json[], what: 'song' | 'bed', aspects: Record<string, string>): Change[] {
  const changes: Change[] = [];
  const old = new Map(before.map((x) => [x.id as string, x]));
  const now = new Map(after.map((x) => [x.id as string, x]));
  for (const [id, item] of now) {
    const prev = old.get(id);
    if (!prev) {
      changes.push({ kind: 'added', what, name: String(item.title), details: [] });
      continue;
    }
    const details = [...new Set(Object.keys(aspects).filter((k) => !same(prev[k], item[k])).map((k) => aspects[k]!))];
    if (details.length) changes.push({ kind: 'changed', what, name: String(item.title), details });
  }
  for (const [id, item] of old) if (!now.has(id)) changes.push({ kind: 'removed', what, name: String(item.title), details: [] });
  return changes;
}

export function diffManifests(before: Json | null, after: Json): Change[] {
  const changes = [
    ...compare(list(before, 'collections'), list(after, 'collections'), 'bed', BED_ASPECTS),
    ...compare(list(before, 'songs'), list(after, 'songs'), 'song', SONG_ASPECTS),
  ];
  const gardenOf = (m: Json | null) => (m?.garden ?? null) as { decorations?: Json[]; environment?: Json } | null;
  const g0 = gardenOf(before);
  const g1 = gardenOf(after);
  const d0 = new Map((g0?.decorations ?? []).map((d) => [d.id as string, d]));
  const d1 = new Map((g1?.decorations ?? []).map((d) => [d.id as string, d]));
  const added = [...d1.keys()].filter((id) => !d0.has(id)).length;
  const removed = [...d0.keys()].filter((id) => !d1.has(id)).length;
  const moved = [...d1].filter(([id, d]) => d0.has(id) && !same(d0.get(id), d)).length;
  if (added || removed || moved) {
    const parts = [added && `${added} added`, removed && `${removed} removed`, moved && `${moved} moved or changed`].filter(Boolean) as string[];
    changes.push({ kind: 'changed', what: 'decorations', name: 'Decorations', details: parts });
  }
  // No garden section means the original sunset settings.
  if (!same(g0?.environment ?? DEFAULT_ENVIRONMENT, g1?.environment ?? DEFAULT_ENVIRONMENT)) {
    changes.push({ kind: 'changed', what: 'atmosphere', name: 'Atmosphere', details: ['sky, mist, particles or clouds'] });
  }
  return changes;
}

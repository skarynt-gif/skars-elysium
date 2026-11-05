/** Pure helpers for the Beds page. */
import type { DraftGarden } from './api.ts';

/** Where a dragged song lands: in `bedId`, before `beforeId` (or at the end). */
export function moveSong(garden: Pick<DraftGarden, 'songs'>, songId: string, bedId: string, beforeId: string | null): string[] {
  const target = garden.songs
    .filter((s) => s.collection_id === bedId && s.id !== songId)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((s) => s.id);
  const at = beforeId ? target.indexOf(beforeId) : -1;
  target.splice(at < 0 ? target.length : at, 0, songId);
  return target;
}


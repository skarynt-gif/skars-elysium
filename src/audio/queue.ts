import type { Manifest, Song } from '../content/types.ts';

/**
 * Previous/next stay within the current flower bed (collection), in the
 * manifest's order, wrapping around and skipping songs that can't be played
 * (e.g. an upcoming bud with no preview).
 */
export function adjacentSong(
  manifest: Manifest,
  currentId: string,
  direction: 1 | -1,
  isPlayable: (song: Song) => boolean,
): Song | null {
  const current = manifest.songs.find((s) => s.id === currentId);
  if (!current) return null;
  const bed = manifest.songs.filter((s) => s.collectionId === current.collectionId).sort((a, b) => a.order - b.order);
  const start = bed.findIndex((s) => s.id === currentId);
  for (let step = 1; step < bed.length; step++) {
    const candidate = bed[(start + direction * step + bed.length * step) % bed.length]!;
    if (isPlayable(candidate)) return candidate;
  }
  return null;
}

/** "3:07", or "1:02:45" for long tracks. Unknown lengths show "0:00". */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

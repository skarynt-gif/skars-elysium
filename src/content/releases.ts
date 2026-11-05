import type { BloomState } from './flowerRules.ts';
import type { Manifest } from './types.ts';

/**
 * Release timing for the Upcoming EP Garden: when the next bud is due to
 * bloom, countdowns, which blooms a returning visitor hasn't seen yet, and
 * how lush the garden should look as the catalog grows.
 */

/** The next moment an auto-blooming bud opens, or null if none are scheduled. */
export function nextReleaseAt(manifest: Manifest, now: number): number | null {
  const autoBloom = new Set(manifest.collections.filter((c) => c.autoBloom).map((c) => c.id));
  let next: number | null = null;
  for (const song of manifest.songs) {
    if (song.status !== 'upcoming' || !song.releaseDate || !autoBloom.has(song.collectionId)) continue;
    const at = Date.parse(song.releaseDate);
    if (at > now && (next === null || at < next)) next = at;
  }
  return next;
}

/**
 * Browsers can't schedule timers more than ~24.8 days ahead, and laptops
 * sleep; so wake at most hourly and re-check.
 */
export function releaseTimerDelay(nextAt: number | null, now: number): number | null {
  if (nextAt === null) return null;
  return Math.max(0, Math.min(nextAt - now, 60 * 60 * 1000)) + 250; // tiny margin past the moment
}

export interface Countdown {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  done: boolean;
}

export function countdown(msRemaining: number): Countdown {
  const total = Math.max(0, Math.floor(msRemaining / 1000));
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
    done: total === 0,
  };
}

/** "12D 04H 05M 09S", dropping days when there are none. */
export function formatCountdown(msRemaining: number): string {
  const c = countdown(msRemaining);
  const two = (n: number) => String(n).padStart(2, '0');
  const parts = [`${two(c.hours)}H`, `${two(c.minutes)}M`, `${two(c.seconds)}S`];
  return c.days > 0 ? `${c.days}D ${parts.join(' ')}` : parts.join(' ');
}

/**
 * Songs this visitor saw as a bud or sprout (on a previous visit or earlier
 * this visit) that have now bloomed: they get the bloom celebration.
 */
export function newlyBloomed(seenBuds: ReadonlySet<string>, flowers: readonly { song: { id: string }; state: BloomState }[]): string[] {
  return flowers.filter((f) => f.state === 'bloom' && seenBuds.has(f.song.id)).map((f) => f.song.id);
}

/** Updates the remembered set: add current buds/sprouts, drop celebrated blooms. */
export function updateSeenBuds(
  seenBuds: ReadonlySet<string>,
  flowers: readonly { song: { id: string }; state: BloomState }[],
  celebrated: readonly string[],
): Set<string> {
  const next = new Set(seenBuds);
  for (const f of flowers) if (f.state === 'bud' || f.state === 'sprout') next.add(f.song.id);
  for (const id of celebrated) next.delete(id);
  // Forget songs that no longer exist in the manifest.
  const present = new Set(flowers.map((f) => f.song.id));
  for (const id of next) if (!present.has(id)) next.delete(id);
  return next;
}

/**
 * Grass and wildflower density multiplier: the garden fills in as more
 * music is released (0.75 for a brand-new garden, up to 1.35).
 */
export function lushness(manifest: Manifest): number {
  const released = manifest.songs.filter((s) => s.status === 'released').length;
  return 0.75 + Math.min(0.6, released / 50);
}

import { newlyBloomed, updateSeenBuds } from '../../content/releases.ts';
import { readMemory, writeMemory } from '../../platform/visitMemory.ts';
import type { Planting } from './planting.ts';

/**
 * Bloom celebrations: when a bud this visitor has seen (on an earlier visit,
 * or right now as the release moment passes) has bloomed, its flower unfolds
 * with bursts of gold and a NEW RELEASE banner, the first time they're near it.
 */
export const celebrations = {
  /** Song ids waiting for the visitor to come near. */
  pending: new Set<string>(),
  /** Song id → when the unfold started (seconds, performance clock). */
  started: new Map<string, number>(),
};

export const UNFOLD_SECONDS = 1.8;

function readSeen(): Set<string> {
  try {
    const parsed: unknown = JSON.parse(readMemory('seen-buds') ?? '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

function writeSeen(seen: Set<string>): void {
  writeMemory('seen-buds', JSON.stringify([...seen]));
}

/**
 * Called whenever the garden is (re)planted: on load, and when a release
 * moment passes mid-visit. Queues celebrations and remembers current buds.
 */
export function onReplanted(plantings: readonly Planting[]): void {
  const seen = readSeen();
  for (const id of newlyBloomed(seen, plantings)) {
    if (!celebrations.started.has(id)) celebrations.pending.add(id);
  }
  // Keep pending ones in memory until celebrated, so a visitor who leaves early still gets it next time.
  writeSeen(updateSeenBuds(seen, plantings, []));
}

/** Marks a celebration as played so it never repeats. */
export function markCelebrated(songId: string): void {
  const seen = readSeen();
  seen.delete(songId);
  writeSeen(seen);
}

/** Size multiplier and extra spin for a flower unfolding (1, 0 when not celebrating). */
export function unfoldTransform(startedAt: number | undefined, t: number): { scale: number; spin: number } {
  if (startedAt === undefined) return { scale: 1, spin: 0 };
  const u = (t - startedAt) / UNFOLD_SECONDS;
  if (u >= 1) return { scale: 1, spin: 0 };
  // Ease-out-back: grows from a bud-sized speck, overshoots, settles.
  const c = 1.9;
  const x = Math.max(0, u) - 1;
  const grow = 1 + (c + 1) * x ** 3 + c * x ** 2;
  return { scale: 0.15 + 0.85 * grow, spin: Math.PI * 4 * (1 - (1 - Math.max(0, u)) ** 2) };
}

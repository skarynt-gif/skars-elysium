/**
 * Deterministic randomness. The garden must look identical on every visit
 * and every device, so anything "random" (tree placement, flower variation,
 * texture speckles) is seeded from a fixed string.
 */

/** FNV-1a hash: the same string always gives the same 32-bit number. */
export function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Xorshift generator returning numbers in [0, 1). */
export function seededRandom(seed: number | string): () => number {
  let state = (typeof seed === 'string' ? hashString(seed) : seed) >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
}

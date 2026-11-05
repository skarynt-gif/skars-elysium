/**
 * Small per-browser memory (returning visitor, later: seen buds, collectibles).
 * Browser storage can be missing or throw (private mode, blocked cookies), so
 * every access is guarded and the game works without it.
 */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const PREFIX = 'sunset-garden:';

function defaultStore(): KeyValueStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function readMemory(key: string, store = defaultStore()): string | null {
  try {
    return store?.getItem(PREFIX + key) ?? null;
  } catch {
    return null;
  }
}

export function writeMemory(key: string, value: string, store = defaultStore()): void {
  try {
    store?.setItem(PREFIX + key, value);
  } catch {
    // Storage full or blocked: the visit simply isn't remembered.
  }
}

export const hasVisitedBefore = (store?: KeyValueStore | null) => readMemory('visited', store) === '1';
export const markVisited = (store?: KeyValueStore | null) => writeMemory('visited', '1', store);

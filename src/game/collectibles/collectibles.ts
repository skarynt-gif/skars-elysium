import { readMemory, writeMemory, type KeyValueStore } from '../../platform/visitMemory.ts';
import { WORLD, polar, type Vec2 } from '../world/layout.ts';

/**
 * Golden laurel wreaths hidden around the garden. Spots are chosen to
 * reward exploring: behind statues, in the grove, sanctuary corners, by the
 * broken columns, along the hedge wall. Progress is saved in this browser.
 */
export interface CollectibleSpot {
  id: string;
  position: Vec2;
  /** Hover height above the ground. */
  height: number;
  hint: string;
}

const [gx, gz] = WORLD.grove.center;
const [sx, sz] = WORLD.sanctuary.center;

export const COLLECTIBLES: readonly CollectibleSpot[] = [
  { id: 'laurel-grove', position: [gx + 1.6, gz - 0.8], height: 1.0, hint: 'hidden grove' },
  { id: 'laurel-sanctuary', position: [sx + 5.2, sz - 3.6], height: 1.0, hint: 'sanctuary corner' },
  { id: 'laurel-statue', position: polar(150, 8.6), height: 0.9, hint: 'behind a statue' },
  { id: 'laurel-broken-column', position: polar(225, 12.2), height: 0.8, hint: 'by a fallen column' },
  { id: 'laurel-west-hedge', position: polar(-90, 34.8), height: 1.0, hint: 'west hedge wall' },
  { id: 'laurel-east-hedge', position: polar(55, 34.6), height: 1.0, hint: 'north-east hedge wall' },
  { id: 'laurel-gate', position: [-4.4, 35.4], height: 0.9, hint: 'beside the gate' },
  { id: 'laurel-fountain', position: polar(300, 4.3), height: 0.8, hint: 'at the fountain edge' },
];

export const PICKUP_RADIUS = 1.1;

export function parseFound(raw: string | null): Set<string> {
  if (!raw) return new Set();
  try {
    const value: unknown = JSON.parse(raw);
    const known = new Set(COLLECTIBLES.map((c) => c.id));
    return new Set(Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && known.has(v)) : []);
  } catch {
    return new Set();
  }
}

export function loadFound(store?: KeyValueStore | null): Set<string> {
  return parseFound(readMemory('laurels', store));
}

export function saveFound(found: ReadonlySet<string>, store?: KeyValueStore | null): void {
  writeMemory('laurels', JSON.stringify([...found]), store);
}

/** The collectible within reach of the visitor, if any (not yet found). */
export function collectibleInReach(position: Vec2, found: ReadonlySet<string>): CollectibleSpot | null {
  for (const c of COLLECTIBLES) {
    if (found.has(c.id)) continue;
    if (Math.hypot(c.position[0] - position[0], c.position[1] - position[1]) < PICKUP_RADIUS) return c;
  }
  return null;
}

export const allFound = (found: ReadonlySet<string>) => COLLECTIBLES.every((c) => found.has(c.id));

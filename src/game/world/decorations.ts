import type { Decoration, DecorationPreset } from '../../content/types.ts';
import { COLLIDERS, WORLD, isOpenGround, type Collider, type Vec2 } from './layout.ts';

/**
 * The preset decorations the Creator Studio can place, and the rules that
 * keep the garden walkable. Pure data: shared by the game (drawing and
 * collision), the content checks and the Studio (placing on the map).
 */
export interface PresetInfo {
  name: string;
  /** Radius that must stay clear of paths, beds and other things (meters, at scale 1). */
  footprint: number;
  /** Solid parts visitors bump into: local circles [x, z, radius] (at scale 1, before rotation). */
  solids: readonly (readonly [number, number, number])[];
  /** Radius of the blob shadow (0 = none). */
  shadow: number;
}

export const DECORATION_PRESETS: Record<DecorationPreset, PresetInfo> = {
  statue: { name: 'Statue', footprint: 0.9, solids: [[0, 0, 0.7]], shadow: 1.05 },
  column: { name: 'Column', footprint: 0.8, solids: [[0, 0, 0.55]], shadow: 0.95 },
  'broken-column': {
    name: 'Broken column',
    footprint: 1.6,
    // The stump, and the fallen drum lying beside it.
    solids: [
      [0, 0, 0.55],
      [1.0, 0.38, 0.4],
      [1.6, 0.6, 0.4],
    ],
    shadow: 0.9,
  },
  lantern: { name: 'Lantern', footprint: 0.5, solids: [[0, 0, 0.2]], shadow: 0.4 },
  bench: {
    name: 'Bench',
    footprint: 1.1,
    solids: [
      [-0.55, 0, 0.3],
      [0, 0, 0.3],
      [0.55, 0, 0.3],
    ],
    shadow: 0.9,
  },
  urn: { name: 'Urn', footprint: 0.6, solids: [[0, 0, 0.4]], shadow: 0.55 },
  // Visitors can walk through the middle of an archway.
  archway: {
    name: 'Archway',
    footprint: 1.9,
    solids: [
      [-1.35, 0, 0.38],
      [1.35, 0, 0.38],
    ],
    shadow: 0,
  },
  cypress: { name: 'Cypress tree', footprint: 0.9, solids: [[0, 0, 0.45]], shadow: 1.0 },
  'olive-tree': { name: 'Olive tree', footprint: 1.6, solids: [[0, 0, 0.35]], shadow: 2.3 },
  hedge: {
    name: 'Hedge',
    footprint: 1.1,
    solids: [
      [-0.6, 0, 0.6],
      [0, 0, 0.6],
      [0.6, 0, 0.6],
    ],
    shadow: 0,
  },
};

export const DECORATION_LIMITS = { max: 60, minScale: 0.6, maxScale: 1.5 } as const;

/** Where a decoration's solid parts are, in world space. */
export function decorationColliders(d: Decoration): Extract<Collider, { kind: 'circle' }>[] {
  const a = (d.rotation * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return DECORATION_PRESETS[d.preset].solids.map(([lx, lz, r]) => ({
    kind: 'circle' as const,
    // Same rotation convention as the 3D model (rotation-y = −degrees).
    center: [d.x + (lx * c - lz * s) * d.scale, d.z + (lx * s + lz * c) * d.scale] as Vec2,
    radius: r * d.scale,
  }));
}

const footprintOf = (d: Pick<Decoration, 'preset' | 'scale'>) => DECORATION_PRESETS[d.preset].footprint * d.scale;

/**
 * Why a decoration can't go here, in plain words, or null if it can.
 * Keeps paths, beds, the plaza, the sanctuary, the grove and its trail clear,
 * and leaves room to walk between things.
 */
export function placementProblem(d: Decoration, others: readonly Decoration[]): string | null {
  const footprint = footprintOf(d);
  const fromCenter = Math.hypot(d.x, d.z);
  if (fromCenter + footprint > WORLD.walkRadius - 0.6) return 'Too close to the garden’s edge.';
  if (fromCenter < WORLD.colonnadeRadius + 1 + footprint) return 'The plaza around the fountain must stay clear.';
  if (!isOpenGround([d.x, d.z], footprint)) return 'That would block a path, a bed, the sanctuary or the grove.';
  for (const c of COLLIDERS) {
    if (c.kind !== 'circle') continue;
    if (Math.hypot(d.x - c.center[0], d.z - c.center[1]) < c.radius + footprint + 0.4) return 'Too close to a tree or landmark.';
  }
  for (const o of others) {
    if (o.id === d.id) continue;
    // Leave a walkable gap (about a visitor's width) between decorations.
    if (Math.hypot(d.x - o.x, d.z - o.z) < footprint + footprintOf(o) + 0.25) return `Too close to another decoration (${DECORATION_PRESETS[o.preset].name.toLowerCase()}).`;
  }
  return null;
}

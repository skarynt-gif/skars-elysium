/** Pure helpers shared by the garden map and its tests. */
import type { Collection } from '../../src/content/types.ts';
import { PLOTS, assignBeds, type BedAssignment } from '../../src/game/world/layout.ts';
import type { CollectionRow } from './api.ts';

/** Draft rows → the shape the game's bed assignment reads. */
export function toCollections(rows: CollectionRow[]): Collection[] {
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    type: r.type as Collection['type'],
    area: r.area as Collection['area'],
    autoBloom: Boolean(r.auto_bloom),
    order: r.sort_order,
    ...(r.plot ? { plot: r.plot } : {}),
  }));
}

export function draftAssignment(rows: CollectionRow[]): BedAssignment {
  return assignBeds(toCollections(rows));
}

/** Human names for spots, e.g. "North-west, inner ring". */
export function spotName(spotId: string): string {
  const sanctuary: Record<string, string> = {
    'sanctuary-center': 'EP sanctuary, center',
    'sanctuary-west': 'EP sanctuary, left',
    'sanctuary-east': 'EP sanctuary, right',
  };
  if (sanctuary[spotId]) return sanctuary[spotId]!;
  const plot = PLOTS.find((p) => p.id === spotId);
  if (!plot) return spotId;
  const a = ((plot.angle % 360) + 360) % 360;
  const dirs = ['North', 'North-east', 'East', 'South-east', 'South', 'South-west', 'West', 'North-west'];
  const dir = dirs[Math.round(a / 45) % 8]!;
  const ring = Math.hypot(...plot.center) < 24 ? 'inner ring' : 'outer ring';
  return `${dir}, ${ring}`;
}


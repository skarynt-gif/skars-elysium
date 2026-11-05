import type { Collection } from '../../content/types.ts';
import { seededRandom } from '../../lib/random.ts';

/**
 * The garden's floor plan, as plain data.
 *
 * Every system reads from here instead of hard-coding positions:
 *   - the 3D world builds models at these spots
 *   - collision (player/collision.ts) uses `colliders`
 *   - navigation arrows (navigation/) use `waypoints`
 *   - flowers (flowers/planting.ts) fill the beds assigned here
 *   - the Upcoming EP Garden fills the sanctuary beds
 *
 * Coordinates: meters, origin at the central fountain, y up.
 * North is −z (toward the EP sanctuary); the entrance gate is south (+z).
 * Angles are degrees clockwise from north.
 */

export type Vec2 = readonly [x: number, z: number];

export const WORLD = {
  plazaRadius: 9,
  colonnadeRadius: 10.5,
  fountainRadius: 3.2,
  /** Plaza navigation ring, outside the fountain. */
  plazaRingRadius: 5.5,
  statueRadius: 7.3,
  pathWidth: 2.4,
  bed: { width: 6, depth: 3.6 },
  /** Hedge wall around the whole garden. */
  boundaryRadius: 38,
  /** Visitors are kept inside this radius. */
  walkRadius: 36.4,
  gate: { z: 38, pillarX: 2.6, leafWidth: 2.2 },
  sanctuary: { center: [0, -30] as Vec2, width: 13, depth: 10, gateWidth: 3, wallThickness: 0.6 },
  grove: { center: [14.5, 25.1] as Vec2, radius: 4.6, entranceAngle: 220 },
  /** Unpaved trail from the entrance avenue to the grove entrance; kept clear of trees. */
  groveTrail: { from: [0, 31.5] as Vec2, to: [10.58, 29.77] as Vec2 },
  /** Where the entrance avenue meets the plaza. */
  entranceAngle: 180,
} as const;

export function polar(angleDeg: number, radius: number): Vec2 {
  const a = (angleDeg * Math.PI) / 180;
  return [Math.sin(a) * radius, -Math.cos(a) * radius];
}

// ---------------------------------------------------------------------------
// Bed plots
// ---------------------------------------------------------------------------

export interface Plot {
  id: string;
  angle: number;
  center: Vec2;
  /** Y rotation so the bed's front faces the plaza. */
  rotationY: number;
  /** Where a visitor stands to look at the bed (and where arrows lead). */
  approach: Vec2;
}

/** Filled in this order, inner ring first. Unused plots appear overgrown. */
const PLOT_RINGS: readonly { radius: number; angles: readonly number[] }[] = [
  { radius: 19, angles: [-55, 55, -100, 100, -140, 140] },
  { radius: 29, angles: [-75, 75, -115, 115] },
];

export const PLOTS: readonly Plot[] = PLOT_RINGS.flatMap(({ radius, angles }) =>
  angles.map((angle) => ({
    id: `plot-${radius}-${angle}`,
    angle,
    center: polar(angle, radius),
    rotationY: (-angle * Math.PI) / 180,
    approach: polar(angle, radius - WORLD.bed.depth / 2 - 1.2),
  })),
);

/** Beds inside the EP sanctuary, in fill order (golden buds grow here). */
export const SANCTUARY_PLOTS: readonly { id: string; center: Vec2; approach: Vec2 }[] = [
  { id: 'sanctuary-center', center: [0, -31.5], approach: [0, -28.4] },
  { id: 'sanctuary-west', center: [-4, -30.5], approach: [-2.2, -28.2] },
  { id: 'sanctuary-east', center: [4, -30.5], approach: [2.2, -28.2] },
];
export const SANCTUARY_BED = { width: 3, depth: 2.4 } as const;

// ---------------------------------------------------------------------------
// Assigning manifest collections to beds
// ---------------------------------------------------------------------------

export interface BedAssignment {
  main: { plot: Plot; collection: Collection | null }[];
  sanctuary: { plot: (typeof SANCTUARY_PLOTS)[number]; collection: Collection | null }[];
  grove: Collection | null;
  /** Collections that didn't fit; reported in the diagnostics panel and console. */
  overflow: Collection[];
}

/**
 * Puts each collection in a bed. Collections pinned to a spot (`plot`) go
 * there first; the rest fill the remaining spots in order. A pin to a spot
 * that doesn't exist (or is already taken) falls back to automatic.
 */
export function assignBeds(collections: readonly Collection[]): BedAssignment {
  const byArea = (area: Collection['area']) => collections.filter((c) => c.area === area);

  function place<P extends { id: string }>(plots: readonly P[], members: Collection[]) {
    const slots: { plot: P; collection: Collection | null }[] = plots.map((plot) => ({ plot, collection: null }));
    const unplaced: Collection[] = [];
    for (const c of members) {
      const slot = c.plot ? slots.find((s) => s.plot.id === c.plot) : undefined;
      if (slot && !slot.collection) slot.collection = c;
      else unplaced.push(c);
    }
    const overflow: Collection[] = [];
    for (const c of unplaced) {
      const free = slots.find((s) => !s.collection);
      if (free) free.collection = c;
      else overflow.push(c);
    }
    return { slots, overflow };
  }

  const main = place(PLOTS, byArea('main'));
  const sanctuary = place(SANCTUARY_PLOTS, byArea('ep-garden'));
  const hidden = byArea('hidden');

  return {
    main: main.slots,
    sanctuary: sanctuary.slots,
    grove: hidden[0] ?? null,
    overflow: [...main.overflow, ...sanctuary.overflow, ...hidden.slice(1)],
  };
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

export interface PathSegment {
  id: string;
  from: Vec2;
  to: Vec2;
  width: number;
}

const plazaEdge = (angle: number) => polar(angle, WORLD.plazaRadius - 0.6);

export const PATHS: readonly PathSegment[] = [
  // Entrance avenue: gate → plaza.
  { id: 'path-entrance', from: [0, WORLD.gate.z + 6], to: plazaEdge(180), width: WORLD.pathWidth },
  // North: plaza → sanctuary gate.
  {
    id: 'path-sanctuary',
    from: plazaEdge(0),
    to: [0, WORLD.sanctuary.center[1] + WORLD.sanctuary.depth / 2 + 0.4],
    width: WORLD.pathWidth,
  },
  // One radial path per plot, stopping at the bed's front edge.
  ...PLOTS.map((plot) => ({
    id: `path-${plot.id}`,
    from: plazaEdge(plot.angle),
    to: polar(plot.angle, Math.hypot(...plot.center) - WORLD.bed.depth / 2),
    width: WORLD.pathWidth,
  })),
];

/** Every angle at which a path leaves the plaza. */
export const PATH_ANGLES: readonly number[] = [0, 180, ...PLOTS.map((p) => p.angle)].sort((a, b) => a - b);

// ---------------------------------------------------------------------------
// Fixed landmarks
// ---------------------------------------------------------------------------

export interface Placement {
  position: Vec2;
  rotationY: number;
  /** Used for both blob shadows and colliders. */
  radius: number;
  variant: number;
}

const angleGap = (a: number, b: number) => Math.abs((((a - b) % 360) + 540) % 360 - 180);

/** Ring of columns around the plaza, leaving gaps where paths pass. */
export const COLUMNS: readonly Placement[] = (() => {
  const result: Placement[] = [];
  for (let angle = 15; angle < 360; angle += 30) {
    if (PATH_ANGLES.some((p) => angleGap(p, angle) < 9)) continue;
    result.push({
      position: polar(angle, WORLD.colonnadeRadius),
      rotationY: (-angle * Math.PI) / 180,
      radius: 0.6,
      // Two weathered, broken columns for atmosphere.
      variant: angle === 225 || angle === 75 ? 1 : 0,
    });
  }
  return result;
})();

export const STATUES: readonly Placement[] = [30, 150, 210, 330].map((angle, i) => {
  const position = polar(angle, WORLD.statueRadius);
  return {
    position,
    // Face the fountain.
    rotationY: Math.atan2(-position[0], -position[1]),
    radius: 0.75,
    variant: i,
  };
});

/** Cypress avenue lining the entrance path. */
export const CYPRESS_AVENUE: readonly Placement[] = [14, 19, 24, 29, 34].flatMap((z) =>
  [-2.7, 2.7].map((x) => ({ position: [x, z] as Vec2, rotationY: 0, radius: 0.55, variant: 0 })),
);

/** Grove: a ring of cypress and hedges with one narrow entrance on the far side. */
export const GROVE_RING: readonly Placement[] = (() => {
  const { center, radius, entranceAngle } = WORLD.grove;
  const result: Placement[] = [];
  for (let angle = 0; angle < 360; angle += 20) {
    if (angleGap(angle, entranceAngle) < 15) continue;
    const [dx, dz] = polar(angle, radius);
    result.push({
      position: [center[0] + dx, center[1] + dz],
      rotationY: 0,
      radius: 0.85,
      // Alternate cypress (0) and hedge (1) to form a solid wall.
      variant: (angle / 20) % 2,
    });
  }
  return result;
})();

/** Hedge wall around the garden with a gap for the entrance gate. */
export const BOUNDARY_HEDGES: readonly Placement[] = (() => {
  const result: Placement[] = [];
  const step = 1.5;
  const count = Math.round((2 * Math.PI * WORLD.boundaryRadius) / step);
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * 360;
    const position = polar(angle, WORLD.boundaryRadius);
    if (position[1] > 0 && Math.abs(position[0]) < WORLD.gate.pillarX + 0.4) continue;
    result.push({ position, rotationY: angle, radius: 1, variant: i % 3 });
  }
  return result;
})();

// ---------------------------------------------------------------------------
// Scattered vegetation (olive trees, grass tufts)
// ---------------------------------------------------------------------------

function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const [px, pz] = p;
  const [ax, az] = a;
  const [bx, bz] = b;
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSq = dx * dx + dz * dz;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lengthSq));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

/** Is a point inside a plot's bed rectangle, grown by `margin`? */
function insideBed(p: Vec2, plot: Plot, margin: number): boolean {
  const dx = p[0] - plot.center[0];
  const dz = p[1] - plot.center[1];
  // Rotate into the bed's local frame.
  const c = Math.cos(plot.rotationY);
  const s = Math.sin(plot.rotationY);
  const localX = dx * c - dz * s;
  const localZ = dx * s + dz * c;
  return Math.abs(localX) < WORLD.bed.width / 2 + margin && Math.abs(localZ) < WORLD.bed.depth / 2 + margin;
}

function insideSanctuary(p: Vec2, margin: number): boolean {
  const { center, width, depth } = WORLD.sanctuary;
  return Math.abs(p[0] - center[0]) < width / 2 + margin && Math.abs(p[1] - center[1]) < depth / 2 + margin;
}

/** True when a point is open ground: not on a path, bed, plaza or landmark. */
export function isOpenGround(p: Vec2, clearance: number): boolean {
  const r = Math.hypot(p[0], p[1]);
  if (r < WORLD.colonnadeRadius + 1 + clearance) return false;
  if (r > WORLD.boundaryRadius - 1.5 - clearance) return false;
  if (PATHS.some((path) => distanceToSegment(p, path.from, path.to) < path.width / 2 + clearance)) return false;
  if (PLOTS.some((plot) => insideBed(p, plot, clearance + 0.6))) return false;
  if (insideSanctuary(p, clearance + 0.8)) return false;
  const [gx, gz] = WORLD.grove.center;
  if (Math.hypot(p[0] - gx, p[1] - gz) < WORLD.grove.radius + 1.2 + clearance) return false;
  const trail = WORLD.groveTrail;
  if (distanceToSegment(p, trail.from, trail.to) < 1.5 + clearance) return false;
  if (CYPRESS_AVENUE.some((t) => Math.hypot(p[0] - t.position[0], p[1] - t.position[1]) < 1.2 + clearance)) {
    return false;
  }
  return true;
}

/** Deterministically scatters points on open ground, keeping a minimum spacing. */
export function scatter(seed: string, count: number, clearance: number, spacing: number): Vec2[] {
  const rand = seededRandom(seed);
  const points: Vec2[] = [];
  let attempts = 0;
  while (points.length < count && attempts < count * 60) {
    attempts++;
    const p: Vec2 = [(rand() * 2 - 1) * WORLD.boundaryRadius, (rand() * 2 - 1) * WORLD.boundaryRadius];
    if (!isOpenGround(p, clearance)) continue;
    if (points.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < spacing)) continue;
    points.push(p);
  }
  return points;
}

export const OLIVE_TREES: readonly Placement[] = scatter('olive-trees', 22, 1.6, 4.5).map((position, i) => ({
  position,
  rotationY: (i * 2.39996) % (Math.PI * 2),
  radius: 1.4,
  variant: i % 3,
}));

// ---------------------------------------------------------------------------
// Colliders (used by player/collision.ts)
// ---------------------------------------------------------------------------

export type Collider =
  | { kind: 'circle'; center: Vec2; radius: number }
  | { kind: 'segment'; from: Vec2; to: Vec2; radius: number };

function sanctuaryWalls(): Collider[] {
  const { center, width, depth, gateWidth, wallThickness } = WORLD.sanctuary;
  const [cx, cz] = center;
  const x0 = cx - width / 2;
  const x1 = cx + width / 2;
  const zN = cz - depth / 2;
  const zS = cz + depth / 2;
  const r = wallThickness / 2;
  return [
    { kind: 'segment', from: [x0, zN], to: [x1, zN], radius: r },
    { kind: 'segment', from: [x0, zN], to: [x0, zS], radius: r },
    { kind: 'segment', from: [x1, zN], to: [x1, zS], radius: r },
    // South wall, split by the gilded gate opening.
    { kind: 'segment', from: [x0, zS], to: [cx - gateWidth / 2, zS], radius: r },
    { kind: 'segment', from: [cx + gateWidth / 2, zS], to: [x1, zS], radius: r },
  ];
}

const circle = (p: Placement, radius = p.radius): Collider => ({ kind: 'circle', center: p.position, radius });

export const COLLIDERS: readonly Collider[] = [
  { kind: 'circle', center: [0, 0], radius: WORLD.fountainRadius + 0.1 },
  ...COLUMNS.map((c) => circle(c, 0.55)),
  ...STATUES.map((s) => circle(s, 0.7)),
  ...CYPRESS_AVENUE.map((t) => circle(t, 0.45)),
  ...OLIVE_TREES.map((t) => circle(t, 0.35)),
  ...GROVE_RING.map((t) => circle(t, 0.9)),
  { kind: 'circle', center: [-WORLD.gate.pillarX, WORLD.gate.z], radius: 0.55 },
  { kind: 'circle', center: [WORLD.gate.pillarX, WORLD.gate.z], radius: 0.55 },
  ...sanctuaryWalls(),
];

// ---------------------------------------------------------------------------
// Waypoint graph (used by the navigation arrows)
// ---------------------------------------------------------------------------

export type WaypointKind = 'gate' | 'junction' | 'plaza' | 'bed' | 'sanctuary' | 'grove';

export interface Waypoint {
  id: string;
  position: Vec2;
  kind: WaypointKind;
  /** Hidden waypoints get arrows only after the visitor discovers them. */
  hidden?: boolean;
  /** For bed waypoints: which plot they serve. */
  plotId?: string;
}

export interface WaypointGraph {
  nodes: Waypoint[];
  edges: [string, string][];
}

const ringId = (angle: number) => `plaza-${angle}`;

export function buildWaypointGraph(): WaypointGraph {
  const nodes: Waypoint[] = [];
  const edges: [string, string][] = [];

  // Ring around the fountain, one node per path, joined to its neighbours.
  for (const angle of PATH_ANGLES) {
    nodes.push({ id: ringId(angle), position: polar(angle, WORLD.plazaRingRadius), kind: 'plaza' });
  }
  PATH_ANGLES.forEach((angle, i) => {
    const next = PATH_ANGLES[(i + 1) % PATH_ANGLES.length]!;
    edges.push([ringId(angle), ringId(next)]);
  });

  nodes.push({ id: 'gate', position: [0, WORLD.gate.z - 2], kind: 'gate' });
  nodes.push({ id: 'avenue', position: WORLD.groveTrail.from, kind: 'junction' });
  edges.push(['gate', 'avenue'], ['avenue', ringId(180)]);

  nodes.push({ id: 'sanctuary-gate', position: [0, WORLD.sanctuary.center[1] + WORLD.sanctuary.depth / 2 + 1.5], kind: 'sanctuary' });
  nodes.push({ id: 'sanctuary', position: [0, -28.4], kind: 'sanctuary' });
  edges.push([ringId(0), 'sanctuary-gate'], ['sanctuary-gate', 'sanctuary']);

  for (const plot of PLOTS) {
    nodes.push({ id: plot.id, position: plot.approach, kind: 'bed', plotId: plot.id });
    edges.push([ringId(plot.angle), plot.id]);
  }

  // Hidden grove: an unpaved trail branches off the entrance avenue between
  // two cypresses and leads to the grove's single gap.
  nodes.push({ id: 'grove-entrance', position: WORLD.groveTrail.to, kind: 'grove', hidden: true });
  nodes.push({ id: 'grove', position: WORLD.grove.center, kind: 'grove', hidden: true });
  edges.push(['avenue', 'grove-entrance'], ['grove-entrance', 'grove']);

  return { nodes, edges };
}

export const WAYPOINTS = buildWaypointGraph();

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BOUNDARY_HEDGES,
  COLLIDERS,
  COLUMNS,
  CYPRESS_AVENUE,
  OLIVE_TREES,
  PATHS,
  PLOTS,
  STATUES,
  WAYPOINTS,
  WORLD,
  assignBeds,
  isOpenGround,
  type Collider,
  type Vec2,
} from './layout.ts';
import type { Collection } from '../../content/types.ts';

const dist = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len = dx * dx + dz * dz;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / len));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dz));
}

/** Clearance between a point and a collider surface (negative = inside). */
function clearance(p: Vec2, c: Collider): number {
  return c.kind === 'circle' ? dist(p, c.center) - c.radius : distanceToSegment(p, c.from, c.to) - c.radius;
}

/** Samples a straight walk between two points; returns the tightest squeeze. */
function minClearanceAlong(a: Vec2, b: Vec2): number {
  let min = Infinity;
  const steps = Math.ceil(dist(a, b) / 0.1);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p: Vec2 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    for (const c of COLLIDERS) min = Math.min(min, clearance(p, c));
  }
  return min;
}

const PLAYER_RADIUS = 0.35;

test('plots stay inside the walkable area and never overlap', () => {
  for (const plot of PLOTS) {
    assert.ok(Math.hypot(...plot.center) + WORLD.bed.width / 2 < WORLD.walkRadius, plot.id);
  }
  for (let i = 0; i < PLOTS.length; i++) {
    for (let j = i + 1; j < PLOTS.length; j++) {
      assert.ok(dist(PLOTS[i]!.center, PLOTS[j]!.center) > WORLD.bed.width + 0.5, `${PLOTS[i]!.id} vs ${PLOTS[j]!.id}`);
    }
  }
});

test('each bed faces the plaza', () => {
  for (const plot of PLOTS) {
    // Local +z after rotation should point back toward the fountain.
    const front: Vec2 = [Math.sin(plot.rotationY), Math.cos(plot.rotationY)];
    const toCenter: Vec2 = [-plot.center[0], -plot.center[1]];
    const dot = front[0] * toCenter[0] + front[1] * toCenter[1];
    assert.ok(dot / Math.hypot(...toCenter) > 0.99, plot.id);
  }
});

test('collections fill beds in order and overflow is reported', () => {
  const make = (id: string, area: Collection['area']): Collection => ({
    id,
    title: id,
    type: 'album',
    area,
    autoBloom: false,
    order: 0,
  });
  const many = Array.from({ length: PLOTS.length + 2 }, (_, i) => make(`main-${i}`, 'main'));
  const result = assignBeds([...many, make('ep-a', 'ep-garden'), make('vault', 'hidden'), make('vault-2', 'hidden')]);
  assert.equal(result.main[0]?.collection?.id, 'main-0');
  assert.equal(result.main.at(-1)?.collection?.id, `main-${PLOTS.length - 1}`);
  assert.equal(result.sanctuary[0]?.collection?.id, 'ep-a');
  assert.equal(result.sanctuary[1]?.collection, null);
  assert.equal(result.grove?.id, 'vault');
  assert.deepEqual(
    result.overflow.map((c) => c.id),
    [`main-${PLOTS.length}`, `main-${PLOTS.length + 1}`, 'vault-2'],
  );
});

test('pinned beds take their spot first; the rest fill around them', () => {
  const make = (id: string, area: Collection['area'], plot?: string): Collection => ({
    id,
    title: id,
    type: 'album',
    area,
    autoBloom: false,
    order: 0,
    ...(plot ? { plot } : {}),
  });
  const far = PLOTS.at(-1)!.id;
  const result = assignBeds([
    make('a', 'main'),
    make('b', 'main', far),
    make('c', 'main', far), // spot taken: falls back to automatic
    make('d', 'main', 'plot-nowhere'), // unknown spot: automatic
    make('e', 'ep-garden', 'sanctuary-east'),
    make('f', 'main', 'sanctuary-east'), // a spot from another area doesn't count
  ]);
  assert.equal(result.main.at(-1)?.collection?.id, 'b');
  assert.deepEqual(
    result.main.slice(0, 4).map((s) => s.collection?.id),
    ['a', 'c', 'd', 'f'],
  );
  assert.equal(result.sanctuary.find((s) => s.plot.id === 'sanctuary-east')?.collection?.id, 'e');
  assert.equal(result.sanctuary[0]?.collection, null);
  assert.deepEqual(result.overflow, []);
});

test('paths are free of colliders (visitors can always walk them)', () => {
  for (const path of PATHS) {
    // Avenue starts outside the gate; check only the part inside the garden.
    const from: Vec2 = path.id === 'path-entrance' ? [0, WORLD.gate.z - 0.5] : path.from;
    assert.ok(minClearanceAlong(from, path.to) > PLAYER_RADIUS, path.id);
  }
});

test('the entrance gate opening is wide enough to walk through', () => {
  assert.ok(minClearanceAlong([0, WORLD.gate.z + 2], [0, WORLD.gate.z - 2]) > PLAYER_RADIUS);
});

test('every waypoint edge is walkable in a straight line', () => {
  const byId = new Map(WAYPOINTS.nodes.map((n) => [n.id, n]));
  for (const [a, b] of WAYPOINTS.edges) {
    const from = byId.get(a);
    const to = byId.get(b);
    assert.ok(from && to, `edge ${a}-${b} references known nodes`);
    assert.ok(minClearanceAlong(from.position, to.position) > PLAYER_RADIUS, `edge ${a} → ${b}`);
  }
});

test('every waypoint is reachable from the gate', () => {
  const adjacency = new Map<string, string[]>();
  for (const [a, b] of WAYPOINTS.edges) {
    adjacency.set(a, [...(adjacency.get(a) ?? []), b]);
    adjacency.set(b, [...(adjacency.get(b) ?? []), a]);
  }
  const seen = new Set(['gate']);
  const queue = ['gate'];
  while (queue.length) {
    for (const next of adjacency.get(queue.shift()!) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  for (const node of WAYPOINTS.nodes) assert.ok(seen.has(node.id), node.id);
});

test('every bed and the sanctuary have a waypoint; the grove is hidden', () => {
  const ids = new Set(WAYPOINTS.nodes.map((n) => n.id));
  for (const plot of PLOTS) assert.ok(ids.has(plot.id), plot.id);
  assert.ok(ids.has('sanctuary'));
  const grove = WAYPOINTS.nodes.find((n) => n.id === 'grove');
  assert.equal(grove?.hidden, true);
});

test('waypoints themselves are standable', () => {
  for (const node of WAYPOINTS.nodes) {
    const tightest = Math.min(...COLLIDERS.map((c) => clearance(node.position, c)));
    assert.ok(tightest > PLAYER_RADIUS, node.id);
    assert.ok(Math.hypot(...node.position) < WORLD.walkRadius, `${node.id} inside walk radius`);
  }
});

test('scattered olive trees avoid paths, beds and each other', () => {
  assert.ok(OLIVE_TREES.length >= 15, `placed ${OLIVE_TREES.length} trees`);
  for (const tree of OLIVE_TREES) assert.ok(isOpenGround(tree.position, 1.5));
  for (let i = 0; i < OLIVE_TREES.length; i++) {
    for (let j = i + 1; j < OLIVE_TREES.length; j++) {
      assert.ok(dist(OLIVE_TREES[i]!.position, OLIVE_TREES[j]!.position) >= 4.5);
    }
  }
});

test('layout is deterministic between loads', async () => {
  const again = await import(`./layout.ts?reload=${Date.now()}`);
  assert.deepEqual(again.OLIVE_TREES, OLIVE_TREES);
});

test('landmarks are where expected', () => {
  assert.ok(COLUMNS.length >= 4);
  assert.equal(COLUMNS.filter((c) => c.variant === 1).length <= 2, true);
  assert.equal(STATUES.length, 4);
  assert.equal(CYPRESS_AVENUE.length, 10);
  // Hedge wall leaves the gate open.
  assert.ok(!BOUNDARY_HEDGES.some((h) => h.position[1] > 0 && Math.abs(h.position[0]) < WORLD.gate.pillarX));
});

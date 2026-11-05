import type { Collider, Vec2, WaypointGraph } from '../world/layout.ts';

/**
 * Route finding over the garden's waypoint graph (layout.ts). The graph's
 * edges are proven walkable by tests, so a route along them never clips
 * through the fountain, columns or walls.
 */

const dist = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Shortest path by walking distance (Dijkstra). Returns node ids, or null if unreachable. */
export function shortestPath(graph: WaypointGraph, from: string, to: string): string[] | null {
  const positions = new Map(graph.nodes.map((n) => [n.id, n.position]));
  if (!positions.has(from) || !positions.has(to)) return null;

  const neighbours = new Map<string, string[]>();
  for (const [a, b] of graph.edges) {
    neighbours.set(a, [...(neighbours.get(a) ?? []), b]);
    neighbours.set(b, [...(neighbours.get(b) ?? []), a]);
  }

  const best = new Map<string, number>([[from, 0]]);
  const previous = new Map<string, string>();
  const open = new Set([from]);

  while (open.size) {
    let current = '';
    let currentCost = Infinity;
    for (const id of open) {
      const cost = best.get(id)!;
      if (cost < currentCost) {
        current = id;
        currentCost = cost;
      }
    }
    open.delete(current);
    if (current === to) break;
    for (const next of neighbours.get(current) ?? []) {
      const cost = currentCost + dist(positions.get(current)!, positions.get(next)!);
      if (cost < (best.get(next) ?? Infinity)) {
        best.set(next, cost);
        previous.set(next, current);
        open.add(next);
      }
    }
  }

  if (!best.has(to)) return null;
  const path = [to];
  while (path[0] !== from) path.unshift(previous.get(path[0]!)!);
  return path;
}

/** Smallest gap between a straight walk a→b and any collider (negative = blocked). */
export function segmentClearance(a: Vec2, b: Vec2, colliders: readonly Collider[]): number {
  let min = Infinity;
  const steps = Math.max(1, Math.ceil(dist(a, b) / 0.15));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p: Vec2 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    for (const c of colliders) {
      let gap: number;
      if (c.kind === 'circle') {
        gap = dist(p, c.center) - c.radius;
      } else {
        const dx = c.to[0] - c.from[0];
        const dz = c.to[1] - c.from[1];
        const len = dx * dx + dz * dz;
        const u = len === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - c.from[0]) * dx + (p[1] - c.from[1]) * dz) / len));
        gap = dist(p, [c.from[0] + u * dx, c.from[1] + u * dz]) - c.radius;
      }
      if (gap < min) min = gap;
    }
  }
  return min;
}

/**
 * The closest waypoint the visitor can walk to in a straight line, so travel
 * can start from wherever they're standing, even off the paths.
 */
export function nearestReachableNode(
  position: Vec2,
  graph: WaypointGraph,
  colliders: readonly Collider[],
  clearance: number,
  allowHidden: boolean,
): string | null {
  const candidates = graph.nodes
    .filter((n) => allowHidden || !n.hidden)
    .map((n) => ({ id: n.id, position: n.position, d: dist(position, n.position) }))
    .sort((a, b) => a.d - b.d);
  for (const c of candidates.slice(0, 8)) {
    if (segmentClearance(position, c.position, colliders) > clearance) return c.id;
  }
  return null;
}

/**
 * Rounds the corners of a polyline (Chaikin corner cutting), keeping both
 * endpoints, so the visitor curves gently through junctions. Each cut is
 * capped at `maxCut` meters so curves stay close to the proven-clear paths
 * (an uncapped cut on a long segment can swing wide into a statue).
 */
export function smoothRoute(points: readonly Vec2[], iterations = 2, maxCut = 0.8): Vec2[] {
  let current = [...points];
  for (let k = 0; k < iterations; k++) {
    if (current.length < 3) return current;
    const next: Vec2[] = [current[0]!];
    for (let i = 0; i < current.length - 1; i++) {
      const a = current[i]!;
      const b = current[i + 1]!;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const t = len === 0 ? 0 : Math.min(0.25, maxCut / len);
      const q: Vec2 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      const r: Vec2 = [b[0] + (a[0] - b[0]) * t, b[1] + (a[1] - b[1]) * t];
      if (i > 0) next.push(q);
      if (i < current.length - 2) next.push(r);
    }
    next.push(current[current.length - 1]!);
    current = next;
  }
  return current;
}

/** Removes points closer together than `minGap` (e.g. when already standing on a node). */
export function dedupe(points: readonly Vec2[], minGap = 0.05): Vec2[] {
  const out: Vec2[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || dist(last, p) > minGap) out.push(p);
  }
  return out;
}

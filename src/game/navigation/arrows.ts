import { COLLIDERS, PLOTS, WAYPOINTS, WORLD, polar, type BedAssignment, type Vec2 } from '../world/layout.ts';
import { dedupe, nearestReachableNode, segmentClearance, shortestPath, smoothRoute } from './routing.ts';
import { buildRoute, yawToward, type Route } from './travel.ts';

/**
 * Where the glowing marble arrows sit and where each one leads.
 * Generated from the bed assignment, so a new collection in the manifest
 * gets its own arrows automatically.
 */
export interface ArrowSpec {
  id: string;
  position: Vec2;
  /** Mesh rotation; the arrow model points along local +z. */
  rotationY: number;
  /** Waypoint id the visitor travels to. */
  destination: string;
  label: string;
  /** Hidden-grove arrows only appear once the grove has been found. */
  secret?: boolean;
}

const pointing = (from: Vec2, to: Vec2) => Math.atan2(to[0] - from[0], to[1] - from[1]);
const ring = (angle: number) => `plaza-${angle}`;

export function arrowSpecs(assignment: BedAssignment, groveFound: boolean): ArrowSpec[] {
  const specs: ArrowSpec[] = [];
  const outward = WORLD.plazaRadius + 1.1;

  for (const { plot, collection } of assignment.main) {
    if (!collection) continue; // empty plots have nothing to visit yet
    const out = polar(plot.angle, outward);
    specs.push({
      id: `arrow-to-${plot.id}`,
      position: out,
      rotationY: pointing(out, plot.center),
      destination: plot.id,
      label: collection.title,
    });
    const radius = Math.hypot(...plot.approach);
    const back = polar(plot.angle, radius - 1.4);
    specs.push({
      id: `arrow-from-${plot.id}`,
      position: back,
      rotationY: pointing(back, [0, 0]),
      destination: ring(plot.angle),
      label: 'Fountain',
    });
  }

  // Upcoming EP Garden, north.
  const epTitle = assignment.sanctuary.find((b) => b.collection)?.collection?.title;
  const toSanctuary = polar(0, outward);
  specs.push({
    id: 'arrow-to-sanctuary',
    position: toSanctuary,
    rotationY: Math.PI, // north
    destination: 'sanctuary',
    label: epTitle ? `EP Garden: ${epTitle}` : 'EP Garden',
  });
  specs.push({ id: 'arrow-from-sanctuary', position: [0, -22], rotationY: 0, destination: ring(0), label: 'Fountain' });

  // Entrance avenue.
  specs.push({ id: 'arrow-to-gate', position: polar(180, outward), rotationY: 0, destination: 'gate', label: 'Entrance' });
  specs.push({ id: 'arrow-avenue-to-fountain', position: [0, 28.8], rotationY: Math.PI, destination: ring(180), label: 'Fountain' });

  if (groveFound) {
    const trail = WORLD.groveTrail;
    const start: Vec2 = [1.7, 31.2];
    specs.push({
      id: 'arrow-to-grove',
      position: start,
      rotationY: pointing(start, trail.to),
      destination: 'grove',
      label: 'Hidden Grove',
      secret: true,
    });
  }

  return specs;
}

/** Which way the visitor ends up facing when they arrive somewhere. */
export function arrivalYaw(destination: string): number {
  const node = WAYPOINTS.nodes.find((n) => n.id === destination);
  if (!node) return 0;
  const plot = PLOTS.find((p) => p.id === destination);
  if (plot) return yawToward(plot.approach, plot.center);
  switch (node.kind) {
    case 'plaza':
      return yawToward(node.position, [0, 0]);
    case 'sanctuary':
      return 0; // north, toward the golden beds
    case 'gate':
      return Math.PI; // facing out through the gate
    case 'grove':
      return yawToward(node.position, WORLD.grove.center);
    default:
      return 0;
  }
}

/** True when standing inside the hidden grove's clearing. */
export function insideGrove(position: Vec2): boolean {
  const [gx, gz] = WORLD.grove.center;
  return Math.hypot(position[0] - gx, position[1] - gz) < WORLD.grove.radius - 1;
}

/**
 * Plans a walk from the visitor's current spot to a destination waypoint.
 * Starts from the nearest node they can reach in a straight line, skips any
 * node that would mean doubling back, and rounds the corners.
 *
 * `clearance` only governs the first, off-path leg; collision still runs
 * during travel, so a slight squeeze there just slides past.
 */
export function planTravel(from: Vec2, destination: string, groveFound: boolean, clearance = 0.3): Route | null {
  const start = nearestReachableNode(from, WAYPOINTS, COLLIDERS, clearance, groveFound);
  if (!start) return null;
  const ids = shortestPath(WAYPOINTS, start, destination);
  if (!ids) return null;
  const nodes = new Map(WAYPOINTS.nodes.map((n) => [n.id, n.position]));
  const points: Vec2[] = dedupe([from, ...ids.map((id) => nodes.get(id)!)]);

  // Skip ahead while the next-but-one point is directly walkable (no backtracking).
  while (points.length > 2 && segmentClearance(points[0]!, points[2]!, COLLIDERS) > clearance) {
    points.splice(1, 1);
  }

  const smooth = smoothRoute(points);
  return buildRoute(smooth, arrivalYaw(destination));
}

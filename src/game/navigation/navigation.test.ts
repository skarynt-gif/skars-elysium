import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COLLIDERS, PLOTS, WAYPOINTS, WORLD, assignBeds, type Vec2 } from '../world/layout.ts';
import { resolveCollisions } from '../player/collision.ts';
import type { Collection } from '../../content/types.ts';
import { dedupe, segmentClearance, shortestPath, smoothRoute } from './routing.ts';
import { TRAVEL, buildRoute, desiredYaw, pointAt, speedAt, stepTravel, yawToward, angleDelta } from './travel.ts';
import { arrivalYaw, arrowSpecs, insideGrove, planTravel } from './arrows.ts';

const PLAYER_RADIUS = 0.35;

const collection = (id: string, area: Collection['area'] = 'main'): Collection => ({
  id,
  title: id.toUpperCase(),
  type: 'album',
  area,
  autoBloom: false,
  order: 0,
});

/** Tightest gap along an entire route. */
function routeClearance(points: readonly Vec2[]): number {
  let min = Infinity;
  for (let i = 1; i < points.length; i++) min = Math.min(min, segmentClearance(points[i - 1]!, points[i]!, COLLIDERS));
  return min;
}

// ---------------------------------------------------------------- routing basics

test('shortest path goes around the fountain ring the short way', () => {
  const path = shortestPath(WAYPOINTS, 'gate', 'plot-19-140')!;
  assert.equal(path[0], 'gate');
  assert.equal(path.at(-1), 'plot-19-140');
  // From the south (180°) to 140° should pass the 140° ring node, not loop via north.
  assert.ok(!path.includes('plaza-0'));
});

test('unknown nodes return null', () => {
  assert.equal(shortestPath(WAYPOINTS, 'gate', 'nowhere'), null);
});

test('smoothing keeps both ends and rounds corners', () => {
  const pts: Vec2[] = [
    [0, 0],
    [10, 0],
    [10, 10],
  ];
  const s = smoothRoute(pts);
  assert.deepEqual(s[0], [0, 0]);
  assert.deepEqual(s.at(-1), [10, 10]);
  assert.ok(!s.some((p) => p[0] === 10 && p[1] === 0), 'sharp corner removed');
});

test('dedupe drops repeated points', () => {
  assert.equal(
    dedupe([
      [0, 0],
      [0, 0.01],
      [1, 1],
    ]).length,
    2,
  );
});

// ---------------------------------------------------------------- travel profile

test('route sampling hits the ends and interpolates', () => {
  const r = buildRoute(
    [
      [0, 0],
      [0, -10],
    ],
    0,
  );
  assert.equal(r.length, 10);
  assert.deepEqual(pointAt(r, 5), [0, -5]);
  assert.deepEqual(pointAt(r, 99), [0, -10]);
});

test('speed eases in, cruises, and slows before arriving', () => {
  const r = buildRoute(
    [
      [0, 0],
      [0, -30],
    ],
    0,
  );
  assert.ok(speedAt(r, 0) < TRAVEL.cruiseSpeed / 2);
  assert.equal(speedAt(r, 15), TRAVEL.cruiseSpeed);
  assert.ok(speedAt(r, 29.9) < 1);
});

test('travel always arrives, even at low frame rates', () => {
  const r = buildRoute(
    [
      [0, 0],
      [0, -12],
    ],
    0,
  );
  for (const fps of [20, 60, 144]) {
    let state = { route: r, s: 0 };
    let arrived = false;
    let frames = 0;
    while (!arrived && frames < 10000) {
      ({ state, arrived } = stepTravel(state, 1 / fps));
      frames++;
    }
    assert.ok(arrived, `arrived at ${fps}fps`);
    assert.ok(frames / fps < 8, `took ${frames / fps}s`);
  }
});

test('camera turns toward the arrival direction at the end', () => {
  const r = buildRoute(
    [
      [0, 0],
      [0, -10],
    ],
    Math.PI / 2,
  );
  assert.ok(Math.abs(angleDelta(desiredYaw(r, 0, 0), 0)) < 1e-6, 'starts facing along the path');
  assert.ok(Math.abs(angleDelta(desiredYaw(r, r.length, 0), Math.PI / 2)) < 1e-6, 'ends facing arrival yaw');
});

// ---------------------------------------------------------------- arrows

test('only beds with music get arrows, both ways', () => {
  const assignment = assignBeds([collection('velvet'), collection('prism')]);
  const specs = arrowSpecs(assignment, false);
  assert.ok(specs.some((s) => s.destination === PLOTS[0]!.id && s.label === 'VELVET'));
  assert.ok(specs.some((s) => s.destination === PLOTS[1]!.id && s.label === 'PRISM'));
  assert.ok(!specs.some((s) => s.destination === PLOTS[2]!.id), 'empty plot has no arrow');
  assert.ok(specs.some((s) => s.id === `arrow-from-${PLOTS[0]!.id}`));
});

test('arrows point at their destination', () => {
  const specs = arrowSpecs(assignBeds([collection('velvet')]), false);
  const out = specs.find((s) => s.id === `arrow-to-${PLOTS[0]!.id}`)!;
  const dir: Vec2 = [Math.sin(out.rotationY), Math.cos(out.rotationY)];
  const toBed: Vec2 = [PLOTS[0]!.center[0] - out.position[0], PLOTS[0]!.center[1] - out.position[1]];
  const cos = (dir[0] * toBed[0] + dir[1] * toBed[1]) / Math.hypot(...toBed);
  assert.ok(cos > 0.99);
});

test('arrows sit on open path, not inside obstacles', () => {
  const specs = arrowSpecs(assignBeds(PLOTS.map((p) => collection(p.id))), true);
  for (const s of specs) {
    assert.ok(segmentClearance(s.position, s.position, COLLIDERS) > 0.3, s.id);
    assert.ok(Math.hypot(...s.position) < WORLD.walkRadius, s.id);
  }
});

test('the grove arrow appears only after discovery', () => {
  const assignment = assignBeds([]);
  assert.ok(!arrowSpecs(assignment, false).some((s) => s.secret));
  assert.ok(arrowSpecs(assignment, true).some((s) => s.destination === 'grove'));
});

test('EP Garden arrow names the upcoming EP when there is one', () => {
  const specs = arrowSpecs(assignBeds([collection('golden', 'ep-garden')]), false);
  assert.equal(specs.find((s) => s.id === 'arrow-to-sanctuary')?.label, 'EP Garden: GOLDEN');
});

test('grove discovery triggers only inside the clearing', () => {
  assert.equal(insideGrove(WORLD.grove.center), true);
  assert.equal(insideGrove([0, 0]), false);
});

// ---------------------------------------------------------------- full journeys

// Passed through collision, exactly as the player controller would place them.
const STARTS: Vec2[] = ([
  [0, 14.5], // where the intro hands over
  [0, 7], // south side of the plaza
  [6.5, -2], // east side of the plaza
  [12, 20], // on the grass near the grove
  [-20, 8], // west lawn
  [0, -28], // inside the sanctuary
] as Vec2[]).map((p) => resolveCollisions(p, PLAYER_RADIUS, { colliders: COLLIDERS, walkRadius: WORLD.walkRadius }));

test('every destination is reachable from everywhere without touching obstacles', () => {
  const destinations = [...PLOTS.map((p) => p.id), 'sanctuary', 'gate', 'plaza-0', 'grove'];
  for (const from of STARTS) {
    for (const to of destinations) {
      const route = planTravel(from, to, true);
      assert.ok(route, `${to} from ${from}`);
      // First leg leaves from wherever the visitor stands; the rest follows proven-clear paths.
      assert.ok(routeClearance(route.points.slice(0, 2)) > 0.25, `first leg to ${to} from [${from}]`);
      assert.ok(routeClearance(route.points.slice(1)) > PLAYER_RADIUS, `clear route to ${to} from [${from}]`);
      const end = route.points.at(-1)!;
      const target = WAYPOINTS.nodes.find((n) => n.id === to)!.position;
      assert.ok(Math.hypot(end[0] - target[0], end[1] - target[1]) < 1e-9, `ends at ${to}`);
    }
  }
});

test('no doubling back when already on the way', () => {
  // Standing on the path halfway to a bed, the route should go straight to it.
  const plot = PLOTS[0]!;
  const halfway: Vec2 = [plot.approach[0] * 0.75, plot.approach[1] * 0.75];
  const route = planTravel(halfway, plot.id, false)!;
  const direct = Math.hypot(plot.approach[0] - halfway[0], plot.approach[1] - halfway[1]);
  assert.ok(route.length < direct + 0.5, `${route.length} vs ${direct}`);
});

test('arriving at a bed faces the bed', () => {
  for (const plot of PLOTS) {
    const yaw = arrivalYaw(plot.id);
    assert.ok(Math.abs(angleDelta(yaw, yawToward(plot.approach, plot.center))) < 1e-9);
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCollisions, type CollisionWorld } from './collision.ts';
import { basis, stepMovement, type MovementConfig, type PlayerState } from './movement.ts';
import { stepBob } from './headBob.ts';
import { PITCH_LIMIT, applyLook, lookAtAngles } from './look.ts';
import { COLLIDERS, WORLD, type Vec2 } from '../world/layout.ts';

const CONFIG: MovementConfig = { walkSpeed: 3, runSpeed: 5.8, acceleration: 12, deceleration: 14, radius: 0.35 };
const GARDEN: CollisionWorld = { colliders: COLLIDERS, walkRadius: WORLD.walkRadius };
const SPEEDS = { walk: CONFIG.walkSpeed, run: CONFIG.runSpeed };
const EMPTY: CollisionWorld = { colliders: [], walkRadius: 1000 };
const still = (position: Vec2, yaw = 0): PlayerState => ({ position, velocity: [0, 0], yaw });

function simulate(state: PlayerState, input: { x: number; y: number; run: boolean }, seconds: number, world: CollisionWorld, fps = 60) {
  let s = state;
  for (let i = 0; i < seconds * fps; i++) s = stepMovement(s, input, 1 / fps, CONFIG, world);
  return s;
}

// ---------------------------------------------------------------- look & basis

test('yaw 0 faces north (−z); right is +x', () => {
  const { forward, right } = basis(0);
  assert.ok(Math.abs(forward[0]) < 1e-9 && Math.abs(forward[1] + 1) < 1e-9);
  assert.ok(Math.abs(right[0] - 1) < 1e-9 && Math.abs(right[1]) < 1e-9);
});

test('moving the mouse right turns the view right', () => {
  const turned = applyLook({ yaw: 0, pitch: 0 }, 0.3, 0);
  assert.ok(basis(turned.yaw).forward[0] > 0);
});

test('pitch is clamped so the view never flips', () => {
  assert.equal(applyLook({ yaw: 0, pitch: 0 }, 0, -10).pitch, PITCH_LIMIT);
  assert.equal(applyLook({ yaw: 0, pitch: 0 }, 0, 10).pitch, -PITCH_LIMIT);
  // Invert option flips direction.
  assert.ok(applyLook({ yaw: 0, pitch: 0 }, 0, 0.1, true).pitch > 0);
});

test('yaw stays bounded after many turns', () => {
  let s = { yaw: 0, pitch: 0 };
  for (let i = 0; i < 1000; i++) s = applyLook(s, 0.5, 0);
  assert.ok(Math.abs(s.yaw) <= Math.PI);
});

test('handover angles point the camera at the target', () => {
  const { yaw, pitch } = lookAtAngles([0, 1.6, 14.5], [0, 2.2, 0]);
  const f = basis(yaw).forward;
  assert.ok(f[1] < -0.99, 'facing the fountain (north)');
  assert.ok(pitch > 0 && pitch < 0.1, 'tilted slightly up');
});

// ---------------------------------------------------------------- movement

test('walking reaches walk speed and running is faster', () => {
  const walk = simulate(still([0, 0]), { x: 0, y: 1, run: false }, 1, EMPTY);
  const run = simulate(still([0, 0]), { x: 0, y: 1, run: true }, 1, EMPTY);
  const walkSpeed = Math.hypot(...walk.velocity);
  const runSpeed = Math.hypot(...run.velocity);
  assert.ok(Math.abs(walkSpeed - CONFIG.walkSpeed) < 0.05, `walk ${walkSpeed}`);
  assert.ok(Math.abs(runSpeed - CONFIG.runSpeed) < 0.05, `run ${runSpeed}`);
  assert.ok(walk.position[1] < -2, 'moved north');
});

test('diagonal movement is not faster than straight', () => {
  const s = simulate(still([0, 0]), { x: 1, y: 1, run: false }, 1, EMPTY);
  assert.ok(Math.hypot(...s.velocity) <= CONFIG.walkSpeed + 1e-6);
});

test('releasing keys stops the visitor quickly and completely', () => {
  const moving = simulate(still([0, 0]), { x: 0, y: 1, run: false }, 1, EMPTY);
  const stopped = simulate(moving, { x: 0, y: 0, run: false }, 0.6, EMPTY);
  assert.deepEqual(stopped.velocity, [0, 0]);
});

test('same distance at 30fps, 60fps and 144fps', () => {
  const at = (fps: number) => simulate(still([0, 0]), { x: 0, y: 1, run: false }, 2, EMPTY, fps).position[1];
  const ref = at(60);
  assert.ok(Math.abs(at(30) - ref) < 0.05, `30fps ${at(30)} vs ${ref}`);
  assert.ok(Math.abs(at(144) - ref) < 0.05, `144fps ${at(144)} vs ${ref}`);
});

test('a frozen tab (huge frame) cannot tunnel through a wall', () => {
  const wall: CollisionWorld = {
    colliders: [{ kind: 'segment', from: [-5, -2], to: [5, -2], radius: 0.3 }],
    walkRadius: 1000,
  };
  const running = simulate(still([0, 0]), { x: 0, y: 1, run: true }, 0.3, EMPTY);
  const after = stepMovement({ ...running, position: [0, 0] }, { x: 0, y: 1, run: true }, 3, CONFIG, wall);
  assert.ok(after.position[1] > -2, `stayed on the near side: ${after.position[1]}`);
});

// ---------------------------------------------------------------- collision

test('pushes the visitor out of a column', () => {
  const world: CollisionWorld = { colliders: [{ kind: 'circle', center: [0, 0], radius: 0.5 }], walkRadius: 100 };
  const p = resolveCollisions([0.2, 0], 0.35, world);
  assert.ok(Math.abs(Math.hypot(...p) - 0.85) < 1e-9);
});

test('slides along a wall instead of stopping dead', () => {
  const wall: CollisionWorld = {
    colliders: [{ kind: 'segment', from: [-20, -1], to: [20, -1], radius: 0.3 }],
    walkRadius: 1000,
  };
  // Walk diagonally (north-east) into a wall running east-west.
  const s = simulate(still([0, 0]), { x: 1, y: 1, run: false }, 2, wall);
  assert.ok(s.position[1] > -1 + 0.3 + 0.35 - 1e-6, 'stayed out of the wall');
  assert.ok(s.position[0] > 2, `kept moving east along it: ${s.position[0]}`);
});

test('cannot walk through the fountain', () => {
  // Start south of the fountain, walk north for 6 seconds.
  const s = simulate(still([0, 8]), { x: 0, y: 1, run: false }, 6, GARDEN);
  assert.ok(Math.hypot(...s.position) >= WORLD.fountainRadius + 0.1 + 0.35 - 1e-6);
});

test('cannot leave the garden', () => {
  const s = simulate(still([0, 0], Math.PI / 2), { x: 0, y: 1, run: true }, 20, GARDEN);
  assert.ok(Math.hypot(...s.position) <= WORLD.walkRadius - 0.35 + 1e-6);
});

test('cannot get into the sanctuary through its walls', () => {
  // Walk north along x = 4 (beside the gate opening) straight at the south wall.
  const s = simulate(still([4, -20]), { x: 0, y: 1, run: false }, 4, GARDEN);
  const southWall = WORLD.sanctuary.center[1] + WORLD.sanctuary.depth / 2;
  assert.ok(s.position[1] > southWall, `stopped at ${s.position[1]}`);
});

test('can walk through the sanctuary gate opening', () => {
  const s = simulate(still([0, -20]), { x: 0, y: 1, run: false }, 3.5, GARDEN);
  const southWall = WORLD.sanctuary.center[1] + WORLD.sanctuary.depth / 2;
  assert.ok(s.position[1] < southWall - 1, `inside at ${s.position[1]}`);
});

test('the intro handoff point is a valid standing spot', () => {
  const p: Vec2 = [0, 14.5];
  assert.deepEqual(resolveCollisions(p, 0.35, GARDEN), p);
});

// ---------------------------------------------------------------- head bob

test('no bob when standing still', () => {
  const { offset } = stepBob({ phase: 1, intensity: 0 }, 0, 0, SPEEDS, 1 / 60, true);
  assert.ok(Math.abs(offset.y) < 1e-6 && Math.abs(offset.x) < 1e-6);
});

test('bob is subtle, and stronger when running', () => {
  let walk = { phase: 0, intensity: 0 };
  let run = { phase: 0, intensity: 0 };
  let maxWalk = 0;
  let maxRun = 0;
  for (let i = 0; i < 240; i++) {
    const w = stepBob(walk, 3 / 60, 3, SPEEDS, 1 / 60, true);
    const r = stepBob(run, 5.8 / 60, 5.8, SPEEDS, 1 / 60, true);
    walk = w.state;
    run = r.state;
    maxWalk = Math.max(maxWalk, -w.offset.y);
    maxRun = Math.max(maxRun, -r.offset.y);
  }
  assert.ok(maxWalk > 0.02 && maxWalk <= 0.036, `walk ${maxWalk}`);
  assert.ok(maxRun > maxWalk && maxRun <= 0.056, `run ${maxRun}`);
});

test('reduced motion turns the bob off', () => {
  let s = { phase: 0, intensity: 1 };
  let offset = { x: 0, y: 0 };
  for (let i = 0; i < 120; i++) ({ state: s, offset } = stepBob(s, 0.05, 3, SPEEDS, 1 / 60, false));
  assert.ok(Math.abs(offset.y) < 1e-3);
});

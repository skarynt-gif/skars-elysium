import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Decoration } from '../../content/types.ts';
import { resolveCollisions } from '../player/collision.ts';
import { DECORATION_PRESETS, decorationColliders, placementProblem } from './decorations.ts';
import { clampEnvironment, DEFAULT_ENVIRONMENT, mixHex, skyPalette } from './environment.ts';
import { COLLIDERS, PATHS, WORLD, scatter, type Vec2 } from './layout.ts';

const deco = (over: Partial<Decoration> = {}): Decoration => ({ id: 'd1', preset: 'statue', x: 0, z: 0, rotation: 0, scale: 1, ...over });
const open = scatter('decor-test', 40, 2.2, 3);

test('open ground accepts every preset at normal size', () => {
  for (const preset of Object.keys(DECORATION_PRESETS) as Decoration['preset'][]) {
    const spot = open.find((p) => placementProblem(deco({ preset, x: p[0], z: p[1] }), []) === null);
    assert.ok(spot, `${preset} fits somewhere`);
  }
});

test('paths, the plaza, beds, the sanctuary, the grove and the edge are refused', () => {
  const onPath = PATHS[0]!;
  const mid: Vec2 = [(onPath.from[0] + onPath.to[0]) / 2, (onPath.from[1] + onPath.to[1]) / 2];
  assert.match(placementProblem(deco({ x: mid[0], z: mid[1] }), [])!, /path/);
  assert.match(placementProblem(deco({ x: 4, z: 4 }), [])!, /plaza/);
  assert.ok(placementProblem(deco({ x: WORLD.sanctuary.center[0], z: WORLD.sanctuary.center[1] }), []));
  assert.ok(placementProblem(deco({ x: WORLD.grove.center[0], z: WORLD.grove.center[1] }), []));
  assert.match(placementProblem(deco({ x: 0, z: -36 }), [])!, /edge/);
});

test('decorations keep a walkable gap between each other', () => {
  const [p] = open;
  const a = deco({ id: 'a', x: p![0], z: p![1] });
  assert.match(placementProblem(deco({ id: 'b', x: p![0] + 1, z: p![1] }), [a])!, /another decoration/);
  assert.equal(placementProblem({ ...a }, [a]), null, 'a decoration never collides with itself');
});

test('nothing placed can trap a visitor on a path', () => {
  // Every legal placement leaves all path centerlines walkable.
  const placed: Decoration[] = [];
  open.forEach((p, i) => {
    const d = deco({ id: `d${i}`, preset: (Object.keys(DECORATION_PRESETS) as Decoration['preset'][])[i % 10]!, x: p[0], z: p[1], rotation: i * 37 });
    if (placementProblem(d, placed) === null) placed.push(d);
  });
  assert.ok(placed.length > 10);
  const colliders = [...COLLIDERS, ...placed.flatMap(decorationColliders)];
  for (const path of PATHS) {
    for (let t = 0.05; t < 1; t += 0.1) {
      const p: Vec2 = [path.from[0] + (path.to[0] - path.from[0]) * t, path.from[1] + (path.to[1] - path.from[1]) * t];
      if (Math.hypot(...p) > WORLD.walkRadius - 1) continue;
      const fixed = resolveCollisions(p, 0.35, { colliders, walkRadius: WORLD.walkRadius });
      const before = resolveCollisions(p, 0.35, { colliders: COLLIDERS, walkRadius: WORLD.walkRadius });
      assert.deepEqual(fixed, before, `${path.id} at ${t.toFixed(2)}`);
    }
  }
});

test('colliders follow rotation and size', () => {
  const [a, b] = decorationColliders(deco({ preset: 'archway', x: 20, z: 0, rotation: 90, scale: 1 }));
  assert.ok(Math.abs(a!.center[0] - 20) < 1e-9 && Math.abs(a!.center[1] + 1.35) < 1e-9, 'rotated 90°: pillars line up north–south');
  assert.ok(Math.abs(b!.center[1] - 1.35) < 1e-9);
  const big = decorationColliders(deco({ x: 20, scale: 1.5 }))[0]!;
  assert.equal(big.radius, 0.7 * 1.5);
});

test('environment settings are clamped to safe ranges; sunset is the default', () => {
  assert.deepEqual(clampEnvironment(undefined), DEFAULT_ENVIRONMENT);
  assert.deepEqual(clampEnvironment({ fog: 9, particles: -3, skyWarmth: 0.5 }), { ...DEFAULT_ENVIRONMENT, fog: 1.5, particles: 0, skyWarmth: 0.5 });
  const base = { skyZenith: '#2a1846', skyUpper: '#6a3a8a', skyPink: '#e0607e', skyHorizon: '#ff9a4d', fog: '#a8557d' };
  assert.deepEqual(skyPalette(base, 0), base, 'warmth 0 leaves the original colors');
  assert.notDeepEqual(skyPalette(base, 1).skyHorizon, base.skyHorizon);
  assert.equal(mixHex('#000000', '#ffffff', 0.5), '#808080');
  // The game passes its whole palette (lights, UI colors…); only sky colors are touched.
  const whole = { ...base, sunLight: '#ffcf8a', hemiSky: '#ffb08a' };
  assert.deepEqual(Object.keys(skyPalette(whole, -0.7)).sort(), Object.keys(base).sort());
  for (const v of Object.values(skyPalette(whole, -0.7))) assert.match(v, /^#[0-9a-f]{6}$/);
});

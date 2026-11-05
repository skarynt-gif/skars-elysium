import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seededRandom } from '../../lib/random.ts';
import { BUTTERFLY, createButterfly, stepButterfly, type Butterfly, type Vec3 } from './butterflies.ts';
import {
  COLLECTIBLES,
  PICKUP_RADIUS,
  allFound,
  collectibleInReach,
  loadFound,
  parseFound,
  saveFound,
} from '../collectibles/collectibles.ts';
import { COLLIDERS, WORLD, type Vec2 } from '../world/layout.ts';
import { DUCK_WHILE_MUSIC, ambientLevels, nextEventDelay } from '../../audio/ambient/ambientMix.ts';
import type { KeyValueStore } from '../../platform/visitMemory.ts';

// ---------------------------------------------------------------- butterflies

function fly(b: Butterfly, seconds: number, player: Vec2 | null, perches: Vec3[], seed = 'b') {
  const rand = seededRandom(seed);
  let s = b;
  const history: Butterfly[] = [];
  for (let i = 0; i < seconds * 60; i++) {
    s = stepButterfly(s, 1 / 60, rand, player, perches);
    history.push(s);
  }
  return { final: s, history };
}

test('butterflies stay near home and within a sensible height', () => {
  const home: Vec2 = [10, -5];
  const { history } = fly(createButterfly(home, seededRandom('x')), 120, null, []);
  for (const b of history) {
    assert.ok(Math.hypot(b.position[0] - home[0], b.position[2] - home[1]) <= BUTTERFLY.homeRadius + 4 + 1e-6);
    assert.ok(b.position[1] >= BUTTERFLY.minHeight && b.position[1] <= BUTTERFLY.maxHeight);
    assert.ok(b.position.every(Number.isFinite));
  }
});

test('butterflies land on flowers and rest', () => {
  const home: Vec2 = [0, 0];
  const perches: Vec3[] = [
    [0.5, 0.8, 0.5],
    [-1, 0.9, 1],
    [1.5, 0.7, -1],
  ];
  const { history } = fly(createButterfly(home, seededRandom('y')), 180, null, perches, 'perch');
  assert.ok(history.some((b) => b.rest > 0), 'rested at least once');
});

test('butterflies scatter when the visitor comes close', () => {
  const home: Vec2 = [0, 0];
  const resting: Butterfly = { ...createButterfly(home, seededRandom('z')), position: [0, 0.9, 0], rest: 5 };
  const player: Vec2 = [0.8, 0];
  const { final } = fly(resting, 1, player, []);
  const before = Math.hypot(0 - player[0], 0 - player[1]);
  const after = Math.hypot(final.position[0] - player[0], final.position[2] - player[1]);
  assert.equal(final.rest, 0);
  assert.ok(after > before + 1, `moved away: ${before} → ${after}`);
  assert.ok(final.position[1] > 0.9, 'flew upward');
});

test('a frozen frame cannot launch a butterfly across the garden', () => {
  const b = createButterfly([0, 0], seededRandom('q'));
  const after = stepButterfly(b, 30, seededRandom('r'), null, []);
  assert.ok(Math.hypot(after.position[0] - b.position[0], after.position[2] - b.position[2]) < 1);
});

// ---------------------------------------------------------------- collectibles

function memoryStore(): KeyValueStore {
  const map = new Map<string, string>();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) };
}

test('every laurel is somewhere a visitor can actually reach', () => {
  for (const c of COLLECTIBLES) {
    assert.ok(Math.hypot(...c.position) < WORLD.walkRadius - 0.35, `${c.id} inside the garden`);
    // A spot within pickup range must be standable (outside every collider).
    let reachable = false;
    for (let a = 0; a < Math.PI * 2 && !reachable; a += Math.PI / 12) {
      for (let r = 0; r <= PICKUP_RADIUS * 0.95 && !reachable; r += 0.1) {
        const p: Vec2 = [c.position[0] + Math.cos(a) * r, c.position[1] + Math.sin(a) * r];
        const clear = COLLIDERS.every((col) =>
          col.kind === 'circle'
            ? Math.hypot(p[0] - col.center[0], p[1] - col.center[1]) > col.radius + 0.35
            : (() => {
                const dx = col.to[0] - col.from[0];
                const dz = col.to[1] - col.from[1];
                const len = dx * dx + dz * dz;
                const t = Math.max(0, Math.min(1, ((p[0] - col.from[0]) * dx + (p[1] - col.from[1]) * dz) / len));
                return Math.hypot(p[0] - col.from[0] - t * dx, p[1] - col.from[1] - t * dz) > col.radius + 0.35;
              })(),
        );
        if (clear && Math.hypot(...p) < WORLD.walkRadius - 0.35) reachable = true;
      }
    }
    assert.ok(reachable, `${c.id} reachable`);
  }
});

test('ids are unique', () => {
  assert.equal(new Set(COLLECTIBLES.map((c) => c.id)).size, COLLECTIBLES.length);
});

test('pickup only triggers within reach, and never twice', () => {
  const c = COLLECTIBLES[0]!;
  assert.equal(collectibleInReach(c.position, new Set())?.id, c.id);
  assert.equal(collectibleInReach(c.position, new Set([c.id])), null);
  assert.equal(collectibleInReach([c.position[0] + 5, c.position[1]], new Set()), null);
});

test('progress is saved, and junk in storage is ignored', () => {
  const store = memoryStore();
  saveFound(new Set(['laurel-grove', 'laurel-gate']), store);
  assert.deepEqual([...loadFound(store)].sort(), ['laurel-gate', 'laurel-grove']);
  assert.deepEqual([...parseFound('["laurel-gate", 42, "made-up"]')], ['laurel-gate']);
  assert.equal(parseFound('{oops').size, 0);
});

test('all found only when every laurel is collected', () => {
  assert.equal(allFound(new Set(COLLECTIBLES.slice(1).map((c) => c.id))), false);
  assert.equal(allFound(new Set(COLLECTIBLES.map((c) => c.id))), true);
});

// ---------------------------------------------------------------- ambient sound

test('ambient sound dips while music plays and respects the volume setting', () => {
  const quiet = ambientLevels(1, true, true);
  const loud = ambientLevels(1, false, true);
  assert.ok(Math.abs(quiet.wind / loud.wind - DUCK_WHILE_MUSIC) < 1e-9);
  assert.deepEqual(ambientLevels(0, false, true), { wind: 0, life: 0, fountain: 0 });
  assert.deepEqual(ambientLevels(1, false, false), { wind: 0, life: 0, fountain: 0 }, 'silent before the garden opens');
});

test('random sound events are spaced sensibly', () => {
  const rand = seededRandom('events');
  for (let i = 0; i < 200; i++) {
    const bird = nextEventDelay('bird', rand);
    const chime = nextEventDelay('chime', rand);
    assert.ok(bird >= 3 && bird <= 12);
    assert.ok(chime >= 25 && chime <= 65);
  }
});

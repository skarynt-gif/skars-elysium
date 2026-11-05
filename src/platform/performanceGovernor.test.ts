import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_GOVERNOR, MOBILE_GOVERNOR, createGovernor, suggestLandscape, type Governor } from './performanceGovernor.ts';

/** Runs the governor at a steady FPS for some seconds; returns every tier change. */
function run(g: Governor, fps: number, seconds: number): string[] {
  const changes: string[] = [];
  for (let i = 0; i < fps * seconds; i++) {
    const change = g.frame(1 / fps);
    if (change) changes.push(change);
  }
  return changes;
}

test('steady 60fps: nothing changes', () => {
  const g = createGovernor('high', 'high');
  assert.deepEqual(run(g, 60, 60), []);
});

test('struggling device steps down one tier at a time, with pauses', () => {
  const g = createGovernor('high', 'high');
  const changes = run(g, 25, 60);
  assert.deepEqual(changes, ['medium', 'low']);
  assert.equal(g.tier, 'low');
});

test('a single hitch is not enough to step down', () => {
  const g = createGovernor('high', 'high');
  run(g, 60, 10);
  g.frame(0.4); // one long frame
  assert.deepEqual(run(g, 60, 10), []);
});

test('tab switches (huge frames) are ignored', () => {
  const g = createGovernor('high', 'high');
  for (let i = 0; i < 20; i++) assert.equal(g.frame(5), null);
  assert.equal(g.tier, 'high');
});

test('steps back up only after a long smooth stretch, never above the start ceiling', () => {
  const g = createGovernor('medium', 'medium');
  run(g, 25, 20); // drop to low
  assert.equal(g.tier, 'low');
  // Even after a long smooth period, medium proved too heavy once: stays low.
  assert.deepEqual(run(g, 60, 120), []);
});

test('a device that started low but is fast can climb, slowly', () => {
  const g = createGovernor('low', 'high');
  const smoothSeconds = DEFAULT_GOVERNOR.cooldownSeconds + DEFAULT_GOVERNOR.windowSeconds * DEFAULT_GOVERNOR.upWindows;
  assert.deepEqual(run(g, 60, smoothSeconds - 2), [], 'not yet');
  assert.deepEqual(run(g, 60, 4), ['medium']);
});

test('no flip-flopping on a borderline device', () => {
  const g = createGovernor('high', 'high');
  const changes: string[] = [];
  // Alternate a little above and below the threshold for 5 minutes.
  for (let block = 0; block < 100; block++) changes.push(...run(g, block % 2 ? 44 : 38, 3));
  assert.ok(changes.length <= 2, `changes: ${changes.join(',')}`);
});

test('phones in low-power mode (30fps) are not treated as struggling', () => {
  const g = createGovernor('medium', 'medium', MOBILE_GOVERNOR);
  assert.deepEqual(run(g, 30, 60), []);
});

test('reports measured FPS', () => {
  const g = createGovernor('high', 'high');
  run(g, 50, 20);
  assert.ok(Math.abs(g.fps - 50) < 1);
});

test('rotate hint only for phones held upright', () => {
  assert.equal(suggestLandscape(390, 844, true), true);
  assert.equal(suggestLandscape(844, 390, true), false);
  assert.equal(suggestLandscape(820, 1180, true), false, 'tablets are fine upright');
  assert.equal(suggestLandscape(390, 844, false), false, 'not for mouse users');
});

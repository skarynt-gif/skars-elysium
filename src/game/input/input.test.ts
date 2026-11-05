import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keysToMove } from './keyboard.ts';
import { JOYSTICK, isTap, joystickInput } from './joystick.ts';

test('WASD and arrow keys both move', () => {
  assert.deepEqual(keysToMove(new Set(['KeyW'])), { x: 0, y: 1, run: false });
  assert.deepEqual(keysToMove(new Set(['ArrowDown', 'ArrowRight'])), { x: 1, y: -1, run: false });
  assert.deepEqual(keysToMove(new Set(['KeyA', 'ShiftLeft'])), { x: -1, y: 0, run: true });
});

test('opposite keys cancel out', () => {
  assert.deepEqual(keysToMove(new Set(['KeyW', 'KeyS', 'KeyA', 'KeyD'])), { x: 0, y: 0, run: false });
});

test('joystick: up is forward, right is right', () => {
  const up = joystickInput(0, -JOYSTICK.radius * 0.6).move;
  assert.ok(up.y > 0 && Math.abs(up.x) < 1e-9);
  const right = joystickInput(JOYSTICK.radius * 0.6, 0).move;
  assert.ok(right.x > 0 && Math.abs(right.y) < 1e-9);
});

test('joystick ignores small thumb drift', () => {
  assert.deepEqual(joystickInput(3, 4).move, { x: 0, y: 0, run: false });
});

test('joystick knob is clamped to the ring; full push runs', () => {
  const { move, knob } = joystickInput(0, -500);
  assert.ok(Math.abs(Math.hypot(...knob) - JOYSTICK.radius) < 1e-9);
  assert.equal(move.run, true);
  assert.ok(Math.abs(move.y - 1) < 1e-9);
});

test('partial push walks without running', () => {
  assert.equal(joystickInput(0, -JOYSTICK.radius * 0.7).move.run, false);
});

test('taps are short and still; drags are not taps', () => {
  assert.equal(isTap(120, 4), true);
  assert.equal(isTap(600, 2), false);
  assert.equal(isTap(100, 40), false);
});

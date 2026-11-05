import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INTRO, INTRO_DURATION, gateOpenAmount, introCameraPosition, introFinished } from './introTimeline.ts';

test('gate starts closed and ends fully open', () => {
  assert.equal(gateOpenAmount(0), 0);
  assert.ok(Math.abs(gateOpenAmount(INTRO.gateOpenDuration) - 1) < 1e-9);
  assert.ok(Math.abs(gateOpenAmount(99) - 1) < 1e-9);
});

test('gate overshoots only slightly as it settles', () => {
  let max = 0;
  for (let t = 0; t <= INTRO.gateOpenDuration; t += 0.01) max = Math.max(max, gateOpenAmount(t));
  assert.ok(max > 1 && max < 1.08, `peak ${max}`);
});

test('camera waits, then glides from outside the gate to the plaza', () => {
  assert.deepEqual(introCameraPosition(0), INTRO.startPosition);
  assert.deepEqual(introCameraPosition(INTRO.cameraDelay), INTRO.startPosition);
  assert.deepEqual(introCameraPosition(INTRO_DURATION), INTRO.endPosition);
});

test('camera only ever moves forward', () => {
  let previous = Infinity;
  for (let t = 0; t <= INTRO_DURATION; t += 0.05) {
    const z = introCameraPosition(t)[1];
    assert.ok(z <= previous + 1e-9);
    previous = z;
  }
});

test('the gate is mostly open before the camera reaches it', () => {
  // Find when the camera crosses the gate line.
  let crossing = 0;
  for (let t = 0; t <= INTRO_DURATION; t += 0.01) {
    if (introCameraPosition(t)[1] <= 38.5) {
      crossing = t;
      break;
    }
  }
  assert.ok(gateOpenAmount(crossing) > 0.9, `gate ${gateOpenAmount(crossing)} at ${crossing}s`);
});

test('finishes exactly at the end of the camera glide', () => {
  assert.equal(introFinished(INTRO_DURATION - 0.01), false);
  assert.equal(introFinished(INTRO_DURATION), true);
});

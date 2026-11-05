import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildQualitySettings, chooseQualityTier } from './quality.ts';
import type { DeviceCapabilities } from '../platform/capabilities.ts';

const desktop: DeviceCapabilities = {
  webgl2: true,
  touch: false,
  coarsePointer: false,
  smallScreen: false,
  deviceMemoryGb: 8,
  cpuCores: 8,
  prefersReducedMotion: false,
  isIOS: false,
};
const phone: DeviceCapabilities = { ...desktop, touch: true, coarsePointer: true, smallScreen: true, deviceMemoryGb: null, cpuCores: 6 };

test('capable desktops get high quality', () => {
  assert.equal(chooseQualityTier(desktop), 'high');
});

test('phones start at medium, budget phones at low', () => {
  assert.equal(chooseQualityTier(phone), 'medium');
  assert.equal(chooseQualityTier({ ...phone, deviceMemoryGb: 2 }), 'low');
  assert.equal(chooseQualityTier({ ...phone, cpuCores: 4 }), 'low');
});

test('iPhones (no memory reporting) are not penalised for missing data', () => {
  assert.equal(chooseQualityTier({ ...phone, isIOS: true, deviceMemoryGb: null }), 'medium');
});

test('no WebGL2 forces low', () => {
  assert.equal(chooseQualityTier({ ...desktop, webgl2: false }), 'low');
});

test('reduced-motion visitors get no vertex wobble', () => {
  assert.equal(buildQualitySettings('high', desktop).vertexSnap, true);
  assert.equal(buildQualitySettings('high', { ...desktop, prefersReducedMotion: true }).vertexSnap, false);
});

test('render height grows with tier', () => {
  const low = buildQualitySettings('low', desktop).renderHeight;
  const med = buildQualitySettings('medium', desktop).renderHeight;
  const high = buildQualitySettings('high', desktop).renderHeight;
  assert.ok(low < med && med < high);
});

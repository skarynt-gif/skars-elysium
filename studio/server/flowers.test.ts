import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkManifest, rowsToManifestJson } from './mapping.ts';
import { call, imported } from './testing/apiHarness.ts';

test('flower look, label and description reach the game', async () => {
  const env = await imported();
  const res = await call(env, 'PATCH', '/api/songs/demo-slow-burn', {
    flowerSpecies: 'iris',
    flowerColor: '#22AAEE',
    flowerCore: '#ffffff',
    flowerScale: 1.4,
    flowerLabel: 'Fan favorite',
    description: 'First song written\nfor the album.',
  });
  assert.equal(res.status, 200);
  const song = checkManifest(rowsToManifestJson(res.data)).manifest.songs.find((s) => s.id === 'demo-slow-burn')!;
  assert.deepEqual(song.flower, { species: 'iris', scale: 1.4, color: '#22aaee', core: '#ffffff', label: 'Fan favorite' });
  assert.equal(song.description, 'First song written\nfor the album.');
});

test('“Auto” clears each flower setting back to the defaults', async () => {
  const env = await imported();
  await call(env, 'PATCH', '/api/songs/demo-slow-burn', { flowerSpecies: 'iris', flowerColor: '#22aaee', flowerHue: 30 });
  const res = await call(env, 'PATCH', '/api/songs/demo-slow-burn', { flowerSpecies: null, flowerColor: null, flowerHue: null, flowerScale: null });
  const song = checkManifest(rowsToManifestJson(res.data)).manifest.songs.find((s) => s.id === 'demo-slow-burn')!;
  assert.equal(song.flower, undefined);
});

test('flower settings are validated', async () => {
  const env = await imported();
  const cases: [Record<string, unknown>, string][] = [
    [{ flowerSpecies: 'tulip' }, 'flowerSpecies'],
    [{ flowerColor: 'pink' }, 'flowerColor'],
    [{ flowerCore: '#12345' }, 'flowerCore'],
    [{ flowerScale: 3 }, 'flowerScale'],
    [{ flowerHue: -200 }, 'flowerHue'],
    [{ flowerLabel: 'x'.repeat(25) }, 'flowerLabel'],
    [{ description: 'x'.repeat(601) }, 'description'],
  ];
  for (const [body, field] of cases) {
    const res = await call(env, 'PATCH', '/api/songs/demo-slow-burn', body);
    assert.equal(res.status, 422, JSON.stringify(body));
    assert.equal(res.data.field, field);
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scatter } from '../../src/game/world/layout.ts';
import { DEFAULT_ENVIRONMENT } from '../../src/game/world/environment.ts';
import { placementProblem } from '../../src/game/world/decorations.ts';
import { checkManifest, rowsToManifestJson } from './mapping.ts';
import { call, imported } from './testing/apiHarness.ts';

const spots = scatter('studio-decor-test', 12, 2.2, 5);
const game = (data: any) => checkManifest(rowsToManifestJson(data)).manifest;

test('place a decoration on open ground; the game draws it', async () => {
  const env = await imported();
  const [x, z] = spots[0]!;
  const res = await call(env, 'POST', '/api/decorations', { preset: 'statue', x, z, rotation: 45 });
  assert.equal(res.status, 201, JSON.stringify(res.data));
  assert.equal(res.status, 201);
  assert.equal(res.data.id, 'statue-1');
  const deco = game(res.data).garden?.decorations[0];
  assert.deepEqual(deco, { id: 'statue-1', preset: 'statue', x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100, rotation: 45, scale: 1 });
  const second = await call(env, 'POST', '/api/decorations', { preset: 'statue', x: spots[1]![0], z: spots[1]![1] });
  assert.equal(second.data.id, 'statue-2');
});

test('decorations that would block the way are refused with a reason', async () => {
  const env = await imported();
  const onPlaza = await call(env, 'POST', '/api/decorations', { preset: 'bench', x: 3, z: 3 });
  assert.equal(onPlaza.status, 422);
  assert.match(onPlaza.data.error, /plaza/);
  const onPath = await call(env, 'POST', '/api/decorations', { preset: 'urn', x: 0, z: 20 });
  assert.equal(onPath.status, 422);
  const [x, z] = spots[2]!;
  await call(env, 'POST', '/api/decorations', { preset: 'urn', x, z });
  const crowded = await call(env, 'POST', '/api/decorations', { preset: 'urn', x: x + 0.5, z });
  assert.match(crowded.data.error, /another decoration/);
  assert.equal((await call(env, 'POST', '/api/decorations', { preset: 'dragon', x, z })).status, 422);
  assert.equal((await call(env, 'POST', '/api/decorations', { preset: 'urn', x: 'left', z })).status, 422);
});

test('move, turn, resize and remove', async () => {
  const env = await imported();
  const [x, z] = spots.find(([sx, sz]) => placementProblem({ id: 'a', preset: 'archway', x: sx, z: sz, rotation: 10, scale: 1.2 }, []) === null)!;
  assert.equal((await call(env, 'POST', '/api/decorations', { preset: 'archway', x, z })).status, 201);
  let res = await call(env, 'PATCH', '/api/decorations/archway-1', { rotation: 370, scale: 1.2 });
  assert.equal(res.status, 200);
  assert.deepEqual([res.data.decorations[0].rotation, res.data.decorations[0].scale], [10, 1.2]);
  res = await call(env, 'PATCH', '/api/decorations/archway-1', { x: 0, z: 0 });
  assert.equal(res.status, 422, 'moving onto the fountain is refused');
  assert.equal((await call(env, 'PATCH', '/api/decorations/archway-1', { scale: 5 })).status, 422);
  res = await call(env, 'DELETE', '/api/decorations/archway-1');
  assert.equal(res.data.decorations.length, 0);
  assert.equal(game(res.data).garden, undefined, 'no decorations and default sky: the manifest is unchanged from the original format');
});

test('atmosphere: saved within safe ranges, reset returns to the sunset', async () => {
  const env = await imported();
  let res = await call(env, 'PUT', '/api/environment', { skyWarmth: 0.5, fog: 1.2 });
  assert.equal(res.status, 200);
  assert.deepEqual(game(res.data).garden?.environment, { ...DEFAULT_ENVIRONMENT, skyWarmth: 0.5, fog: 1.2 });
  assert.equal((await call(env, 'PUT', '/api/environment', { fog: 4 })).status, 422);
  res = await call(env, 'PUT', '/api/environment', { particles: 0 });
  assert.equal(game(res.data).garden?.environment.skyWarmth, 0.5, 'other settings kept');
  res = await call(env, 'PUT', '/api/environment', { reset: true });
  assert.equal(game(res.data).garden, undefined);
});

test('there is a limit so the garden stays smooth on phones', async () => {
  const env = await imported();
  const many = scatter('studio-decor-many', 200, 0.6, 1.6);
  let placed = 0;
  for (const [x, z] of many) {
    const res = await call(env, 'POST', '/api/decorations', { preset: 'lantern', x, z });
    if (res.status === 201) placed++;
    if (placed === 60) break;
  }
  assert.equal(placed, 60);
  const over = await call(env, 'POST', '/api/decorations', { preset: 'lantern', x: many.at(-1)![0], z: many.at(-1)![1] });
  assert.match(over.data.error, /up to 60/);
});

test('decorations and atmosphere survive import (round trip through the live format)', async () => {
  const env = await imported();
  const [x, z] = spots[4]!;
  assert.equal((await call(env, 'POST', '/api/decorations', { preset: 'cypress', x, z })).status, 201);
  await call(env, 'PUT', '/api/environment', { clouds: 0.5 });
  const draft = (await call(env, 'GET', '/api/garden')).data;
  const manifest = rowsToManifestJson(draft);
  env.MEDIA.files.set('manifest.json', { bytes: new TextEncoder().encode(JSON.stringify(manifest)), uploaded: new Date() });
  const res = await call(env, 'POST', '/api/import', { replace: true });
  assert.equal(res.status, 200);
  const after = (await call(env, 'GET', '/api/garden')).data;
  assert.deepEqual(game(after).garden, game(draft).garden);
});

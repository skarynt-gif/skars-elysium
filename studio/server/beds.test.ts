import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLOTS } from '../../src/game/world/layout.ts';
import { assignBeds } from '../../src/game/world/layout.ts';
import { checkManifest, rowsToManifestJson, type GardenRows } from './mapping.ts';
import { call, imported } from './testing/apiHarness.ts';

const bedOf = (garden: GardenRows, id: string) => garden.collections.find((c) => c.id === id)!;
const songsIn = (garden: GardenRows, bed: string) =>
  garden.songs.filter((s) => s.collection_id === bed).sort((a, b) => a.sort_order - b.sort_order).map((s) => s.id);
/** Where the game will actually plant each bed. */
const gameSpots = (garden: GardenRows) => {
  const { manifest } = checkManifest(rowsToManifestJson(garden));
  const a = assignBeds(manifest.collections);
  return new Map(a.main.filter((s) => s.collection).map((s) => [s.collection!.id, s.plot.id]));
};

test('add a bed: unique id, defaults, lands in the next free spot', async () => {
  const env = await imported();
  const res = await call(env, 'POST', '/api/collections', { title: 'Velvet Hours', type: 'ep' });
  assert.equal(res.status, 201);
  assert.equal(res.data.id, 'velvet-hours');
  const bed = bedOf(res.data, 'velvet-hours');
  assert.equal(bed.area, 'main');
  assert.equal(bed.plot, null);
  assert.ok(gameSpots(res.data).has('velvet-hours'), 'the game gives it a spot');
  const again = await call(env, 'POST', '/api/collections', { title: 'Velvet Hours' });
  assert.equal(again.data.id, 'velvet-hours-2');
  assert.equal((await call(env, 'POST', '/api/collections', { title: '  ' })).status, 422);
});

test('pin a bed to a spot; the game plants it there', async () => {
  const env = await imported();
  const far = PLOTS.at(-1)!.id;
  const res = await call(env, 'PATCH', '/api/collections/demo-singles', { plot: far });
  assert.equal(res.status, 200);
  assert.equal(gameSpots(res.data).get('demo-singles'), far);
});

test('moving onto a taken spot swaps the two beds', async () => {
  const env = await imported();
  const [a, b] = [PLOTS[7]!.id, PLOTS[8]!.id];
  await call(env, 'PATCH', '/api/collections/demo-velvet-hours', { plot: a });
  await call(env, 'PATCH', '/api/collections/demo-prism-garden', { plot: b });
  const res = await call(env, 'PATCH', '/api/collections/demo-velvet-hours', { plot: b });
  assert.equal(bedOf(res.data, 'demo-velvet-hours').plot, b);
  assert.equal(bedOf(res.data, 'demo-prism-garden').plot, a);
  const spots = gameSpots(res.data);
  assert.equal(spots.get('demo-velvet-hours'), b);
  assert.equal(spots.get('demo-prism-garden'), a);
});

test('swapping with a bed that was placed automatically keeps both exactly in place', async () => {
  const env = await imported();
  const start = (await call(env, 'GET', '/api/garden')).data;
  const spots0 = gameSpots(start);
  const far = PLOTS.at(-1)!.id;
  await call(env, 'PATCH', '/api/collections/demo-singles', { plot: far });
  const velvetSpot = spots0.get('demo-velvet-hours')!; // automatic, not pinned
  const res = await call(env, 'PATCH', '/api/collections/demo-singles', { plot: velvetSpot });
  const spots = gameSpots(res.data);
  assert.equal(spots.get('demo-singles'), velvetSpot);
  assert.equal(spots.get('demo-velvet-hours'), far);
});

test('spots belong to an area; changing area un-pins the bed', async () => {
  const env = await imported();
  assert.equal((await call(env, 'PATCH', '/api/collections/demo-singles', { plot: 'sanctuary-east' })).status, 422);
  assert.equal((await call(env, 'PATCH', '/api/collections/demo-next-ep', { plot: 'sanctuary-east' })).status, 200);
  await call(env, 'PATCH', '/api/collections/demo-singles', { plot: PLOTS[3]!.id });
  const res = await call(env, 'PATCH', '/api/collections/demo-singles', { area: 'ep-garden' });
  assert.equal(bedOf(res.data, 'demo-singles').plot, null);
  const back = await call(env, 'PATCH', '/api/collections/demo-singles', { plot: null });
  assert.equal(back.status, 200);
});

test('drag a song into another bed, at a position', async () => {
  const env = await imported();
  const before = (await call(env, 'GET', '/api/garden')).data;
  const target = [...songsIn(before, 'demo-singles')];
  target.splice(1, 0, 'demo-slow-burn');
  const res = await call(env, 'POST', '/api/collections/demo-singles/songs', { ids: target });
  assert.equal(res.status, 200);
  assert.deepEqual(songsIn(res.data, 'demo-singles'), target);
  assert.ok(!songsIn(res.data, 'demo-velvet-hours').includes('demo-slow-burn'));
  // The game sees the same order.
  const { manifest } = checkManifest(rowsToManifestJson(res.data));
  assert.deepEqual(manifest.songs.filter((s) => s.collectionId === 'demo-singles').map((s) => s.id), target);
});

test('reorder beds; bad orders are refused', async () => {
  const env = await imported();
  const ids = (await call(env, 'GET', '/api/garden')).data.collections.map((c: { id: string }) => c.id).reverse();
  const res = await call(env, 'POST', '/api/collections/order', { ids });
  assert.deepEqual(res.data.collections.map((c: { id: string }) => c.id), ids);
  assert.equal((await call(env, 'POST', '/api/collections/order', { ids: ids.slice(1) })).status, 422);
  assert.equal((await call(env, 'POST', '/api/collections/order', { ids: [...ids.slice(1), 'ghost'] })).status, 422);
  assert.equal((await call(env, 'POST', '/api/collections/demo-singles/songs', { ids: ['nope'] })).status, 422);
});

test('a bed with songs cannot be deleted; an empty one can', async () => {
  const env = await imported();
  const busy = await call(env, 'DELETE', '/api/collections/demo-singles');
  assert.equal(busy.status, 422);
  assert.match(busy.data.error, /still has 2 songs/);
  const made = await call(env, 'POST', '/api/collections', { title: 'Empty' });
  const res = await call(env, 'DELETE', `/api/collections/${made.data.id}`);
  assert.equal(res.status, 200);
  assert.ok(!res.data.collections.some((c: { id: string }) => c.id === 'empty'));
});

test('bed fields are validated', async () => {
  const env = await imported();
  for (const body of [{ type: 'mixtape' }, { area: 'moon' }, { title: '' }, { description: 'x'.repeat(601) }, { cover: 'media/covers/nope.webp' }]) {
    assert.equal((await call(env, 'PATCH', '/api/collections/demo-singles', body)).status, 422, JSON.stringify(body));
  }
  const ok = await call(env, 'PATCH', '/api/collections/demo-singles', { title: 'Loose Petals', description: 'Line one\n\n\n\nLine two' });
  assert.equal(bedOf(ok.data, 'demo-singles').description, 'Line one\n\nLine two');
});

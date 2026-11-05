import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateManifest } from './validate.ts';

const OPTIONS = {
  manifestUrl: 'https://media.example.com/content/manifest.json',
  releaseTimeZone: 'America/New_York',
};

const collection = (over: Record<string, unknown> = {}) => ({
  id: 'night-bloom',
  title: 'Night Bloom',
  type: 'ep',
  ...over,
});
const song = (over: Record<string, unknown> = {}) => ({
  id: 'slow-burn',
  title: 'Slow Burn',
  artist: 'Artist',
  collectionId: 'night-bloom',
  genre: 'rnb',
  status: 'released',
  audio: 'media/slow-burn.mp3',
  ...over,
});
const run = (collections: unknown[], songs: unknown[]) =>
  validateManifest({ version: 1, collections, songs }, OPTIONS);

test('accepts a valid manifest and applies defaults', () => {
  const { manifest, issues } = run([collection()], [song()]);
  assert.equal(issues.length, 0);
  assert.equal(manifest.collections[0]?.area, 'main');
  assert.equal(manifest.collections[0]?.autoBloom, false);
  assert.equal(manifest.songs.length, 1);
});

test('resolves relative media paths against the manifest URL', () => {
  const { manifest } = run([collection({ cover: 'covers/nb.webp' })], [song()]);
  assert.equal(manifest.songs[0]?.audio, 'https://media.example.com/content/media/slow-burn.mp3');
  assert.equal(manifest.collections[0]?.cover, 'https://media.example.com/content/covers/nb.webp');
});

test('keeps absolute media URLs unchanged', () => {
  const { manifest } = run([collection()], [song({ audio: 'https://cdn.example.org/a.mp3' })]);
  assert.equal(manifest.songs[0]?.audio, 'https://cdn.example.org/a.mp3');
});

test('skips a bad song without breaking the others', () => {
  const { manifest, issues } = run(
    [collection()],
    [song(), song({ id: 'broken', genre: 'jazz-fusion' }), song({ id: 'fine-two' })],
  );
  assert.deepEqual(
    manifest.songs.map((s) => s.id),
    ['slow-burn', 'fine-two'],
  );
  const err = issues.find((i) => i.severity === 'error');
  assert.match(err?.path ?? '', /songs\[1\] "broken"/);
  assert.match(err?.message ?? '', /genre/);
});

test('rejects songs pointing at a missing collection', () => {
  const { manifest, issues } = run([collection()], [song({ collectionId: 'nope' })]);
  assert.equal(manifest.songs.length, 0);
  assert.match(issues[0]?.message ?? '', /collectionId/);
});

test('rejects duplicate ids', () => {
  const { manifest, issues } = run([collection(), collection()], [song(), song()]);
  assert.equal(manifest.collections.length, 1);
  assert.equal(manifest.songs.length, 1);
  assert.equal(issues.filter((i) => i.severity === 'error').length, 2);
});

test('released songs require audio; upcoming songs do not', () => {
  const { manifest } = run(
    [collection()],
    [
      song({ id: 'no-audio', audio: undefined }),
      song({ id: 'teaser', status: 'upcoming', audio: undefined, releaseDate: '2026-12-04' }),
    ],
  );
  assert.deepEqual(
    manifest.songs.map((s) => s.id),
    ['teaser'],
  );
});

test('warns when an upcoming song has no release date', () => {
  const { issues } = run([collection()], [song({ status: 'upcoming', audio: undefined })]);
  assert.equal(issues[0]?.severity, 'warning');
  assert.match(issues[0]?.message ?? '', /countdown/);
});

test('warns when an unreleased song exposes full audio', () => {
  const { issues } = run([collection()], [song({ status: 'unreleased' })]);
  assert.match(issues[0]?.message ?? '', /downloaded/);
});

test('rejects malformed release dates', () => {
  const { manifest, issues } = run([collection()], [song({ releaseDate: 'next friday' })]);
  assert.equal(manifest.songs.length, 0);
  assert.match(issues[0]?.message ?? '', /releaseDate/);
});

test('ignores invalid flower overrides but keeps the song', () => {
  const { manifest, issues } = run(
    [collection()],
    [song({ flower: { species: 'cactus', hue: 40, scale: 9 } })],
  );
  assert.deepEqual(manifest.songs[0]?.flower, { hue: 40 });
  assert.equal(issues.filter((i) => i.severity === 'warning').length, 2);
});

test('flags empty collections as a warning only', () => {
  const { manifest, issues } = run([collection(), collection({ id: 'empty-bed' })], [song()]);
  assert.equal(manifest.collections.length, 2);
  assert.ok(issues.some((i) => i.severity === 'warning' && i.path.includes('empty-bed')));
});

test('sorts by explicit order, falling back to file order', () => {
  const { manifest } = run(
    [collection()],
    [song({ id: 'a', order: 5 }), song({ id: 'b', order: 1 }), song({ id: 'c' })],
  );
  // 'c' has no order, so it uses its index (2).
  assert.deepEqual(
    manifest.songs.map((s) => s.id),
    ['b', 'c', 'a'],
  );
});

test('rejects non-object input gracefully', () => {
  const { manifest, issues } = validateManifest('oops', OPTIONS);
  assert.equal(manifest.songs.length, 0);
  assert.equal(issues[0]?.severity, 'error');
});

test('the bundled demo manifest has no errors', () => {
  const json = JSON.parse(readFileSync(new URL('../../public/content/manifest.json', import.meta.url), 'utf8'));
  const { manifest, issues } = validateManifest(json, OPTIONS);
  assert.deepEqual(
    issues.filter((i) => i.severity === 'error'),
    [],
  );
  assert.equal(manifest.collections.length, 5);
  assert.equal(manifest.songs.length, 11);
});

test('teaser flag is accepted only on upcoming songs', () => {
  const { manifest, issues } = run(
    [collection()],
    [song({ id: 'tease', status: 'upcoming', audio: undefined, releaseDate: '2026-12-04', teaser: true }), song({ id: 'nope', teaser: true })],
  );
  assert.equal(manifest.songs.find((s) => s.id === 'tease')?.teaser, true);
  assert.equal(manifest.songs.find((s) => s.id === 'nope')?.teaser, undefined);
  assert.ok(issues.some((i) => i.message.includes('only applies to upcoming')));
});

test('a bed can be pinned to a spot; a malformed spot is ignored with a warning', () => {
  const ok = run([collection({ plot: 'plot-19--55' })], [song()]);
  assert.equal(ok.manifest.collections[0]?.plot, 'plot-19--55');
  const bad = run([collection({ plot: '<script>' })], [song()]);
  assert.equal(bad.manifest.collections[0]?.plot, undefined);
  assert.ok(bad.issues.some((i) => i.severity === 'warning' && i.message.includes('plot')));
});

test('flower colors, label and song description', () => {
  const { manifest, issues } = run(
    [collection()],
    [song({ description: '  Written at 3am.  ', flower: { color: '#FF5FB0', core: '#ffd27a', label: ' fan favorite ' } })],
  );
  assert.deepEqual(manifest.songs[0]?.flower, { color: '#ff5fb0', core: '#ffd27a', label: 'fan favorite' });
  assert.equal(manifest.songs[0]?.description, 'Written at 3am.');
  assert.equal(issues.length, 0);
  const bad = run([collection()], [song({ flower: { color: 'red', core: 12, label: '' } })]);
  assert.equal(bad.manifest.songs[0]?.flower, undefined);
  assert.equal(bad.issues.filter((i) => i.severity === 'warning').length, 3);
});

test('garden decorations and atmosphere: blocked or broken decorations are skipped, settings clamped', async () => {
  const { scatter } = await import('../game/world/layout.ts');
  const [spot] = scatter('validate-lantern', 1, 2, 1);
  const { manifest, issues } = run([collection()], [song()]);
  assert.equal(manifest.garden, undefined, 'no garden section = the original garden');
  const res = validateManifest(
    {
      version: 1,
      collections: [collection()],
      songs: [song()],
      garden: {
        decorations: [
          { id: 'urn-1', preset: 'urn', x: 0, z: 0 }, // in the fountain plaza
          { id: 'mystery', preset: 'spaceship', x: 20, z: 20 },
          { id: 'ok', preset: 'lantern', x: spot![0], z: spot![1], rotation: 400, scale: 9 },
        ],
        environment: { fog: 0.1, glitter: 2 },
      },
    },
    OPTIONS,
  );
  assert.deepEqual(issues, []);
  const decorations = res.manifest.garden?.decorations ?? [];
  assert.ok(!decorations.some((d) => d.id === 'urn-1' || d.id === 'mystery'));
  assert.equal(res.manifest.garden?.environment.fog, 0.7);
  assert.ok(res.issues.some((i) => i.message.includes('glitter')));
  const lantern = decorations.find((d) => d.id === 'ok');
  assert.ok(lantern, 'a lantern on open ground is kept');
  assert.equal(lantern.rotation, 40);
  assert.equal(lantern.scale, 1.5);
});

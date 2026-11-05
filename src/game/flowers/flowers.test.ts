import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateManifest } from '../../content/validate.ts';
import type { Collection, Manifest, Song } from '../../content/types.ts';
import { PLOTS, SANCTUARY_BED, SANCTUARY_PLOTS, WORLD, assignBeds, type Vec2 } from '../world/layout.ts';
import { MIN_FLOWER_SPACING, bedSlots, plantGarden } from './planting.ts';
import { FLOWER_STYLES, speciesMotion, windAt } from './flowerStyle.ts';
import { chooseFlowerFocus } from './focus.ts';

const NOW = Date.parse('2026-10-30T12:00:00Z');

function makeManifest(collections: Partial<Collection>[], songsPer: number[]): Manifest {
  const cols: Collection[] = collections.map((c, i) => ({
    id: `c${i}`,
    title: `C${i}`,
    type: 'album',
    area: 'main',
    autoBloom: false,
    order: i,
    ...c,
  }));
  const songs: Song[] = [];
  cols.forEach((c, ci) => {
    for (let s = 0; s < songsPer[ci]!; s++) {
      songs.push({
        id: `${c.id}-s${s}`,
        title: `Song ${s}`,
        artist: 'A',
        collectionId: c.id,
        genre: 'rnb',
        status: 'released',
        order: s,
        audio: 'x.mp3',
      });
    }
  });
  return { version: 1, collections: cols, songs };
}

const minGap = (pts: readonly Vec2[]) => {
  let min = Infinity;
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++)
      min = Math.min(min, Math.hypot(pts[i]![0] - pts[j]![0], pts[i]![1] - pts[j]![1]));
  return min;
};

// ---------------------------------------------------------------- slots

test('slots fill the bed evenly and stay inside it', () => {
  for (const count of [1, 2, 3, 5, 8, 12, 16, 20]) {
    const slots = bedSlots(count, 5.1, 2.3, 'seed');
    assert.equal(slots.length, count);
    for (const [x, z] of slots) {
      assert.ok(Math.abs(x) <= 5.1 / 2 && Math.abs(z) <= 2.3 / 2, `${count}: [${x}, ${z}]`);
    }
    assert.ok(minGap(slots) >= MIN_FLOWER_SPACING, `${count} flowers: gap ${minGap(slots)}`);
  }
});

test('a single song sits centered', () => {
  const [only] = bedSlots(1, 5, 2, 'x');
  assert.ok(Math.abs(only![0]) < 0.4 && Math.abs(only![1]) < 0.3); // within the jitter
});

test('slots are deterministic', () => {
  assert.deepEqual(bedSlots(7, 5, 2, 'a'), bedSlots(7, 5, 2, 'a'));
});

// ---------------------------------------------------------------- planting

test('every song in a placed collection gets exactly one flower inside its bed', () => {
  const manifest = makeManifest([{}, {}, { type: 'single' }], [6, 12, 3]);
  const plantings = plantGarden(manifest, assignBeds(manifest.collections), NOW);
  assert.equal(plantings.length, 21);
  assert.equal(new Set(plantings.map((p) => p.song.id)).size, 21);

  plantings.forEach((p) => {
    const plot = PLOTS[Number(p.collection.id.slice(1))]!;
    // Back into the bed's local frame.
    const dx = p.position[0] - plot.center[0];
    const dz = p.position[1] - plot.center[1];
    const c = Math.cos(plot.rotationY);
    const s = Math.sin(plot.rotationY);
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c;
    assert.ok(Math.abs(lx) < WORLD.bed.width / 2 - 0.2, `${p.song.id} x ${lx}`);
    assert.ok(Math.abs(lz) < WORLD.bed.depth / 2 - 0.2, `${p.song.id} z ${lz}`);
    assert.ok(lz > -WORLD.bed.depth / 2 + 0.7, `${p.song.id} clear of the sign`);
  });
});

test('singles get plinths; albums do not', () => {
  const manifest = makeManifest([{}, { type: 'single' }], [2, 2]);
  const plantings = plantGarden(manifest, assignBeds(manifest.collections), NOW);
  assert.deepEqual(
    plantings.map((p) => p.plinth),
    [false, false, true, true],
  );
});

test('flower state and species follow status and genre', () => {
  const manifest = makeManifest([{ area: 'ep-garden', autoBloom: true }, { area: 'hidden' }], [2, 1]);
  manifest.songs[0]!.status = 'upcoming';
  manifest.songs[0]!.releaseDate = '2027-01-01T05:00:00.000Z';
  manifest.songs[1]!.status = 'upcoming';
  manifest.songs[1]!.releaseDate = '2026-01-01T05:00:00.000Z'; // already passed → blooms
  manifest.songs[1]!.genre = 'rage';
  manifest.songs[2]!.status = 'unreleased';
  const [bud, bloomed, ghost] = plantGarden(manifest, assignBeds(manifest.collections), NOW);
  assert.equal(bud!.state, 'bud');
  assert.equal(bud!.species, 'bud');
  assert.equal(bloomed!.state, 'bloom');
  assert.equal(bloomed!.species, 'thistle');
  assert.equal(ghost!.state, 'ghost');
  assert.equal(ghost!.species, 'asphodel');
});

test('sanctuary flowers stay inside their beds', () => {
  const manifest = makeManifest([{ area: 'ep-garden' }], [7]);
  const plantings = plantGarden(manifest, assignBeds(manifest.collections), NOW);
  const bed = SANCTUARY_PLOTS[0]!;
  for (const p of plantings) {
    assert.ok(Math.abs(p.position[0] - bed.center[0]) < SANCTUARY_BED.width / 2);
    assert.ok(Math.abs(p.position[1] - bed.center[1]) < SANCTUARY_BED.depth / 2);
  }
});

test('vault flowers ring the grove shrine', () => {
  const manifest = makeManifest([{ area: 'hidden' }], [5]);
  const plantings = plantGarden(manifest, assignBeds(manifest.collections), NOW);
  assert.equal(plantings.length, 5);
  for (const p of plantings) {
    const d = Math.hypot(p.position[0] - WORLD.grove.center[0], p.position[1] - WORLD.grove.center[1]);
    assert.ok(Math.abs(d - 2.1) < 1e-9);
  }
  assert.ok(minGap(plantings.map((p) => p.position)) > MIN_FLOWER_SPACING);
});

test('collections without a bed are not planted', () => {
  const manifest = makeManifest(
    Array.from({ length: PLOTS.length + 1 }, () => ({})),
    Array.from({ length: PLOTS.length + 1 }, () => 1),
  );
  const plantings = plantGarden(manifest, assignBeds(manifest.collections), NOW);
  assert.equal(plantings.length, PLOTS.length);
});

test('the demo manifest plants every song', () => {
  const json = JSON.parse(readFileSync(new URL('../../../public/content/manifest.json', import.meta.url), 'utf8'));
  const { manifest } = validateManifest(json, {
    manifestUrl: 'https://example.com/content/manifest.json',
    releaseTimeZone: 'America/New_York',
  });
  const plantings = plantGarden(manifest, assignBeds(manifest.collections), NOW);
  assert.equal(plantings.length, manifest.songs.length);
});

// ---------------------------------------------------------------- styles & motion

test('every species has a style and visible stem', () => {
  for (const [name, style] of Object.entries(FLOWER_STYLES)) {
    assert.ok(style.height > 0.25 && style.height < 1.4, name); // teaser sprouts are deliberately small
    assert.match(style.petal, /^#[0-9a-f]{6}$/);
  }
  assert.equal(FLOWER_STYLES.spiral.cycleHue, true);
  assert.equal(FLOWER_STYLES.asphodel.ghost, true);
});

test('wind is gentle and nearby flowers move together', () => {
  for (let t = 0; t < 30; t += 0.37) {
    const [ax, az] = windAt(3, 4, t);
    assert.ok(Math.abs(ax) <= 1 && Math.abs(az) <= 1);
    const [bx] = windAt(3.3, 4.2, t);
    assert.ok(Math.abs(ax - bx) < 0.25, 'neighbours sway alike');
  }
});

test('rage thistles twitch; roses do not', () => {
  const samples = (m: Parameters<typeof speciesMotion>[0]) =>
    Array.from({ length: 60 }, (_, i) => speciesMotion(m, i / 30, 0.4)[0]);
  const twitch = samples('twitch');
  const smooth = samples('smooth');
  assert.ok(new Set(twitch.map((v) => v.toFixed(3))).size > 3);
  assert.ok(smooth.every((v) => v === 0));
});

// ---------------------------------------------------------------- focus

test('focuses the nearest flower in front, ignoring ones behind', () => {
  const flowers: Vec2[] = [
    [0, -1.5], // ahead
    [0, 1], // behind, closer
    [1.8, -0.5], // off to the right at the edge of view
  ];
  assert.equal(chooseFlowerFocus([0, 0], 0, flowers), 0);
});

test('turning toward a flower switches focus to it', () => {
  const flowers: Vec2[] = [
    [-1, -1.2],
    [1, -1.2],
  ];
  const facingLeft = Math.atan2(1, 1.2); // yaw that faces (−1, −1.2)
  const facingRight = -facingLeft;
  assert.equal(chooseFlowerFocus([0, 0], facingLeft, flowers), 0);
  assert.equal(chooseFlowerFocus([0, 0], facingRight, flowers), 1);
});

test('nothing is focused when out of reach', () => {
  assert.equal(chooseFlowerFocus([0, 0], 0, [[0, -5]]), -1);
});

test('flower palette: custom colors replace the species palette, but never on buds or sprouts', async () => {
  const { flowerPalette } = await import('./flowerPalette.ts');
  assert.deepEqual(flowerPalette('rose', 10, undefined), { petal: '#b3203f', shift: 10, core: '#ffd27a', cycle: false });
  assert.deepEqual(flowerPalette('spiral', 5, undefined).cycle, true);
  assert.deepEqual(flowerPalette('spiral', 5, { color: '#123456', core: '#abcdef' }), { petal: '#123456', shift: 0, core: '#abcdef', cycle: false });
  assert.deepEqual(flowerPalette('bud', 5, { color: '#123456', core: '#abcdef' }).petal, '#e8b84a');
  assert.deepEqual(flowerPalette('sprout', 0, { core: '#abcdef' }).core, '#ffd27a');
  assert.equal(flowerPalette('rose', 10, { core: '#000000' }).shift, 10, 'a custom heart alone keeps the petal variation');
});

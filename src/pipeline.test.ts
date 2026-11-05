/**
 * End-to-end check of the whole content pipeline, using the real demo
 * manifest and media files exactly as a visitor's browser would:
 *
 *   manifest.json → validation → bed assignment → flower planting →
 *   navigation arrows → walkable routes → playable audio files
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateManifest } from './content/validate.ts';
import { displayTitle, playableUrl } from './content/flowerRules.ts';
import { nextReleaseAt } from './content/releases.ts';
import { assignBeds, COLLIDERS } from './game/world/layout.ts';
import { plantGarden } from './game/flowers/planting.ts';
import { arrowSpecs, planTravel } from './game/navigation/arrows.ts';
import { segmentClearance } from './game/navigation/routing.ts';
import { adjacentSong } from './audio/queue.ts';
import { RELEASE_TIME_ZONE } from './config/release.ts';

const manifestPath = new URL('../public/content/manifest.json', import.meta.url);
const { manifest, issues } = validateManifest(JSON.parse(readFileSync(manifestPath, 'utf8')), {
  manifestUrl: pathToFileURL(fileURLToPath(manifestPath)).href,
  releaseTimeZone: RELEASE_TIME_ZONE,
});
const BEFORE_RELEASE = Date.parse('2026-11-01T12:00:00Z');
const AFTER_RELEASE = Date.parse('2026-12-05T12:00:00Z');
const assignment = assignBeds(manifest.collections);

test('the demo manifest is clean', () => {
  assert.deepEqual(issues, []);
  assert.equal(assignment.overflow.length, 0);
});

test('every song is planted exactly once', () => {
  const plantings = plantGarden(manifest, assignment, BEFORE_RELEASE);
  assert.equal(plantings.length, manifest.songs.length);
  assert.equal(new Set(plantings.map((p) => p.song.id)).size, manifest.songs.length);
});

test('every released flower plays a real file on disk; teasers and buds behave', () => {
  for (const p of plantGarden(manifest, assignment, BEFORE_RELEASE)) {
    const url = playableUrl(p.song, p.state);
    if (p.state === 'bloom') {
      assert.ok(url, `${p.song.id} has audio`);
      assert.ok(existsSync(fileURLToPath(url)), `${p.song.id} file exists`);
    }
    if (p.state === 'sprout') {
      assert.equal(url, null, 'teasers reveal nothing');
      assert.equal(displayTitle(p.song, p.state), '???');
    }
    if (p.song.id === 'demo-first-light') {
      assert.equal(p.state, 'bud');
      assert.ok(url && existsSync(fileURLToPath(url)), 'bud preview exists');
    }
    if (p.song.id === 'demo-sun-dial') assert.equal(url, null, 'bud without preview shows details only');
  }
});

test('the upcoming EP blooms on its own at release, revealing the teaser', () => {
  assert.equal(nextReleaseAt(manifest, BEFORE_RELEASE), Date.parse('2026-12-04T05:00:00.000Z'));
  const after = plantGarden(manifest, assignment, AFTER_RELEASE);
  for (const id of ['demo-first-light', 'demo-sun-dial', 'demo-secret-track']) {
    const p = after.find((x) => x.song.id === id)!;
    assert.equal(p.state, 'bloom', id);
    assert.notEqual(displayTitle(p.song, p.state), '???');
  }
});

test('every arrow leads somewhere reachable without touching obstacles', () => {
  const start: [number, number] = [0, 14.5]; // where the intro hands control over
  for (const arrow of arrowSpecs(assignment, true)) {
    const route = planTravel(start, arrow.destination, true);
    assert.ok(route, `route to ${arrow.destination}`);
    for (let i = 2; i < route.points.length; i++) {
      assert.ok(segmentClearance(route.points[i - 1]!, route.points[i]!, COLLIDERS) > 0.35, `${arrow.id} leg ${i}`);
    }
  }
});

test('next/previous walk through a bed and skip unplayable songs', () => {
  const plantings = plantGarden(manifest, assignment, BEFORE_RELEASE);
  const playable = (id: string) => {
    const p = plantings.find((x) => x.song.id === id);
    return Boolean(p && playableUrl(p.song, p.state));
  };
  assert.equal(adjacentSong(manifest, 'demo-slow-burn', 1, (s) => playable(s.id))?.id, 'demo-honey-static');
  // In the upcoming EP only First Light (preview) is playable, so there's no "next".
  assert.equal(adjacentSong(manifest, 'demo-first-light', 1, (s) => playable(s.id)), null);
});

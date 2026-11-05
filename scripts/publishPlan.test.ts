import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateManifest } from '../src/content/validate.ts';
import { publishPlan } from './publishPlan.ts';

const contentDir = resolve('public/content');
const manifestUrl = pathToFileURL(resolve(contentDir, 'manifest.json')).href;
const { manifest } = validateManifest(JSON.parse(readFileSync(resolve(contentDir, 'manifest.json'), 'utf8')), {
  manifestUrl,
  releaseTimeZone: 'America/New_York',
});

test('uploads every referenced file once, manifest last', () => {
  const plan = publishPlan(manifest, contentDir, manifestUrl);
  assert.equal(plan.at(-1)?.key, 'manifest.json', 'manifest goes last');
  const keys = plan.map((u) => u.key);
  assert.equal(new Set(keys).size, keys.length, 'no duplicates');
  assert.ok(keys.includes('media/audio/slow-burn.mp3'));
  assert.ok(keys.includes('media/previews/first-light.mp3'));
  assert.ok(keys.includes('media/covers/velvet-hours.webp'));
  // 7 songs + 2 previews + 2 covers + manifest
  assert.equal(plan.length, 12);
});

test('bucket keys match the URLs the game will request', () => {
  // The game loads /media/manifest.json, so "media/audio/x.mp3" resolves to
  // /media/media/audio/x.mp3, which the media function maps to key "media/audio/x.mp3".
  const plan = publishPlan(manifest, contentDir, manifestUrl);
  for (const u of plan.slice(0, -1)) {
    const requested = new URL(u.key, 'https://site.example/media/manifest.json').pathname;
    assert.equal(requested.replace(/^\/media\//, ''), u.key);
  }
});

test('content types are set for the browser', () => {
  const plan = publishPlan(manifest, contentDir, manifestUrl);
  assert.equal(plan.find((u) => u.key.endsWith('.mp3'))?.contentType, 'audio/mpeg');
  assert.equal(plan.find((u) => u.key.endsWith('.webp'))?.contentType, 'image/webp');
});

test('remote URLs are not uploaded', () => {
  const remote = {
    ...manifest,
    songs: manifest.songs.map((s) => ({ ...s, audio: 'https://cdn.example.com/a.mp3' })),
  };
  const keys = publishPlan(remote, contentDir, manifestUrl).map((u) => u.key);
  assert.ok(!keys.some((k) => k.includes('cdn.example.com')));
});

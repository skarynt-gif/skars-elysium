/**
 * Checks a manifest before you upload it.
 *
 *   npm run validate-content
 *   node scripts/validate-content.ts path/to/manifest.json
 *
 * Also confirms that every local media file the manifest points to exists.
 * Exits with code 1 if any entry would be skipped in the live garden.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { validateManifest } from '../src/content/validate.ts';
import { RELEASE_TIME_ZONE } from '../src/config/release.ts';

const target = resolve(process.argv[2] ?? 'public/content/manifest.json');
let json: unknown;
try {
  json = JSON.parse(readFileSync(target, 'utf8'));
} catch (err) {
  console.error(`✗ Could not read ${target}: ${(err as Error).message}`);
  process.exit(1);
}

const manifestUrl = pathToFileURL(target).href;
const { manifest, issues } = validateManifest(json, { manifestUrl, releaseTimeZone: RELEASE_TIME_ZONE });

// Check local files exist (remote URLs are skipped).
const missing: string[] = [];
const checkFile = (url: string | undefined, owner: string) => {
  if (!url?.startsWith('file:')) return;
  const path = fileURLToPath(url);
  if (!existsSync(path)) missing.push(`${owner}: ${path.replace(dirname(target) + '/', '')}`);
};
for (const c of manifest.collections) checkFile(c.cover, `collection "${c.id}" cover`);
for (const s of manifest.songs) {
  checkFile(s.audio, `song "${s.id}" audio`);
  checkFile(s.preview, `song "${s.id}" preview`);
  checkFile(s.cover, `song "${s.id}" cover`);
}

for (const issue of issues) {
  console.log(`${issue.severity === 'error' ? '✗' : '!'} ${issue.path}: ${issue.message}`);
}
for (const m of missing) console.log(`! missing file — ${m}`);

const errors = issues.filter((i) => i.severity === 'error').length;
console.log(
  `\n${manifest.collections.length} collections, ${manifest.songs.length} songs valid · ` +
    `${errors} errors · ${issues.length - errors} warnings · ${missing.length} missing files`,
);
process.exit(errors > 0 ? 1 : 0);

/**
 * Publishes your songs to the live garden, with no rebuild needed:
 *
 *   npm run publish-media             upload to R2
 *   npm run publish-media -- --dry-run   show what would be uploaded
 *
 * 1. Checks public/content/manifest.json (stops on any error or missing file).
 * 2. Uploads every song, preview and cover it uses to the R2 bucket.
 * 3. Uploads the manifest last, so visitors never see songs that aren't there yet.
 *
 * Needs Cloudflare's `wrangler` tool (run through npx) and a one-time
 * `npx wrangler login`. The bucket name comes from wrangler.toml.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { validateManifest } from '../src/content/validate.ts';
import { RELEASE_TIME_ZONE } from '../src/config/release.ts';
import { publishPlan } from './publishPlan.ts';

const dryRun = process.argv.includes('--dry-run');
const contentDir = resolve('public/content');
const manifestPath = resolve(contentDir, 'manifest.json');

const bucket = /bucket_name\s*=\s*"([^"]+)"/.exec(readFileSync('wrangler.toml', 'utf8'))?.[1];
if (!bucket) {
  console.error('✗ No bucket_name found in wrangler.toml.');
  process.exit(1);
}

const manifestUrl = pathToFileURL(manifestPath).href;
const { manifest, issues } = validateManifest(JSON.parse(readFileSync(manifestPath, 'utf8')), {
  manifestUrl,
  releaseTimeZone: RELEASE_TIME_ZONE,
});
for (const issue of issues) console.log(`${issue.severity === 'error' ? '✗' : '!'} ${issue.path}: ${issue.message}`);
if (issues.some((i) => i.severity === 'error')) {
  console.error('\n✗ Fix the errors above first (nothing was uploaded).');
  process.exit(1);
}

const plan = publishPlan(manifest, contentDir, manifestUrl);
const missing = plan.filter((u) => !existsSync(u.file));
if (missing.length) {
  for (const m of missing) console.error(`✗ Missing file: ${m.file}`);
  console.error('\n✗ Nothing was uploaded.');
  process.exit(1);
}

console.log(`\nPublishing ${plan.length} files to R2 bucket "${bucket}"${dryRun ? ' (dry run)' : ''}…\n`);
for (const [i, upload] of plan.entries()) {
  console.log(`[${i + 1}/${plan.length}] ${upload.key}`);
  if (dryRun) continue;
  const result = spawnSync(
    'npx',
    ['--yes', 'wrangler', 'r2', 'object', 'put', `${bucket}/${upload.key}`, '--file', upload.file, '--content-type', upload.contentType, '--remote'],
    { stdio: ['ignore', 'ignore', 'inherit'], shell: process.platform === 'win32' },
  );
  if (result.status !== 0) {
    console.error(`\n✗ Upload failed for ${upload.key}. The live song list was NOT changed.`);
    process.exit(1);
  }
}
console.log(dryRun ? '\nDry run complete.' : '\n✓ Published. New visitors see the changes right away.');

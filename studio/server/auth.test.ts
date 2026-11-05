import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  authenticate,
  createKeyLookup,
  parseEmails,
  readAccessConfig,
  teamIssuer,
  verifyAccessToken,
  type AccessConfig,
} from './auth.ts';

const ISSUER = 'https://skar.cloudflareaccess.com';
const AUD = 'a1b2c3d4aud';
const CONFIG: AccessConfig = {
  issuer: ISSUER,
  certsUrl: `${ISSUER}/cdn-cgi/access/certs`,
  audience: AUD,
  adminEmails: ['skar@example.com'],
};
const NOW = 1_800_000_000;

const pair = await crypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
  true,
  ['sign', 'verify'],
);
const intruder = await crypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
  true,
  ['sign', 'verify'],
);

const b64url = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url');
const encode = (value: unknown) => b64url(new TextEncoder().encode(JSON.stringify(value)));

async function sign(claims: Record<string, unknown>, options: { key?: CryptoKey; kid?: string; alg?: string } = {}) {
  const head = encode({ alg: options.alg ?? 'RS256', kid: options.kid ?? 'k1', typ: 'JWT' });
  const body = encode(claims);
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    options.key ?? pair.privateKey,
    new TextEncoder().encode(`${head}.${body}`),
  );
  return `${head}.${body}.${b64url(new Uint8Array(signature))}`;
}

const good = { aud: [AUD], iss: ISSUER, email: 'Skar@Example.com', exp: NOW + 3600, iat: NOW - 10, nbf: NOW - 10 };
const lookup = async (kid: string) => (kid === 'k1' ? pair.publicKey : null);

test('accepts a valid token for an allowed email', async () => {
  assert.deepEqual(await verifyAccessToken(await sign(good), CONFIG, lookup, NOW), { ok: true, email: 'skar@example.com' });
});

test('aud may be a plain string', async () => {
  const result = await verifyAccessToken(await sign({ ...good, aud: AUD }), CONFIG, lookup, NOW);
  assert.equal(result.ok, true);
});

test('rejects tokens that are wrong in any way', async () => {
  const cases: [string, Promise<string> | string][] = [
    ['other app', sign({ ...good, aud: ['someone-else'] })],
    ['other team', sign({ ...good, iss: 'https://evil.cloudflareaccess.com' })],
    ['expired', sign({ ...good, exp: NOW - 120 })],
    ['not yet valid', sign({ ...good, nbf: NOW + 600 })],
    ['no expiry', sign({ ...good, exp: undefined })],
    ['not an admin', sign({ ...good, email: 'fan@example.com' })],
    ['no email (service token)', sign({ ...good, email: undefined })],
    ['signed by another key', sign(good, { key: intruder.privateKey })],
    ['unknown key id', sign(good, { kid: 'k9' })],
    ['alg none', sign(good, { alg: 'none' })],
    ['garbage', 'not-a-token'],
    ['empty parts', '..'],
  ];
  for (const [name, token] of cases) {
    const result = await verifyAccessToken(await token, CONFIG, lookup, NOW);
    assert.equal(result.ok, false, name);
  }
});

test('tampering with the claims breaks the signature', async () => {
  const token = await sign({ ...good, email: 'fan@example.com' });
  const [h, , s] = token.split('.');
  const forged = `${h}.${encode(good)}.${s}`;
  const result = await verifyAccessToken(forged, CONFIG, lookup, NOW);
  assert.deepEqual(result, { ok: false, reason: 'Token signature is invalid.' });
});

test('allows a minute of clock skew', async () => {
  assert.equal((await verifyAccessToken(await sign({ ...good, exp: NOW - 30 }), CONFIG, lookup, NOW)).ok, true);
});

test('team name can be written several ways, but only Access hosts count', () => {
  for (const v of ['skar', 'skar.cloudflareaccess.com', 'https://skar.cloudflareaccess.com/', ' SKAR ']) {
    assert.equal(teamIssuer(v), ISSUER, v);
  }
  assert.equal(teamIssuer('evil.example.com'), null);
  assert.equal(teamIssuer('https://skar.cloudflareaccess.com.evil.net'), null);
});

test('email list parsing', () => {
  assert.deepEqual(parseEmails(' A@x.com, b@y.com;c@z.com  nope '), ['a@x.com', 'b@y.com', 'c@z.com']);
  assert.deepEqual(parseEmails(undefined), []);
});

test('missing settings lock the Studio with a clear message', () => {
  const message = readAccessConfig({ ACCESS_AUD: AUD });
  assert.equal(typeof message, 'string');
  assert.match(message as string, /ACCESS_TEAM_DOMAIN/);
  assert.match(message as string, /ADMIN_EMAILS/);
});

// ---------- whole request ----------

const env = { ACCESS_TEAM_DOMAIN: 'skar', ACCESS_AUD: AUD, ADMIN_EMAILS: 'skar@example.com' };
const lookupFor = () => lookup;
const realNow = Date.now;

test('authenticate reads the Access header or cookie', async () => {
  Date.now = () => NOW * 1000;
  try {
    const token = await sign(good);
    const viaHeader = new Request('https://studio.pages.dev/api/me', { headers: { 'cf-access-jwt-assertion': token } });
    assert.deepEqual(await authenticate(viaHeader, env, lookupFor), { ok: true, email: 'skar@example.com' });
    const viaCookie = new Request('https://studio.pages.dev/api/me', { headers: { cookie: `a=1; CF_Authorization=${token}` } });
    assert.equal((await authenticate(viaCookie, env, lookupFor)).ok, true);

    const outsider = await sign({ ...good, email: 'fan@example.com' });
    const denied = await authenticate(
      new Request('https://studio.pages.dev/api/me', { headers: { 'cf-access-jwt-assertion': outsider } }),
      env,
      lookupFor,
    );
    assert.deepEqual(denied.ok ? null : denied.status, 403);
  } finally {
    Date.now = realNow;
  }
});

test('no token means 401; missing settings mean 500, never open', async () => {
  const anonymous = await authenticate(new Request('https://studio.pages.dev/api/me'), env, lookupFor);
  assert.equal(anonymous.ok ? 0 : anonymous.status, 401);
  const unconfigured = await authenticate(new Request('https://studio.pages.dev/api/me'), {}, lookupFor);
  assert.equal(unconfigured.ok ? 0 : unconfigured.status, 500);
});

test('the local-development sign-in only works on localhost', async () => {
  const dev = { DEV_AUTH_EMAIL: 'skar@example.com' };
  assert.equal((await authenticate(new Request('http://localhost:8788/api/me'), dev, lookupFor)).ok, true);
  assert.equal((await authenticate(new Request('http://127.0.0.1:8788/api/me'), dev, lookupFor)).ok, true);
  assert.equal((await authenticate(new Request('https://studio.pages.dev/api/me'), dev, lookupFor)).ok, false);
  assert.equal((await authenticate(new Request('https://localhost.evil.com/api/me'), dev, lookupFor)).ok, false);
});

// ---------- key fetching ----------

test('keys are fetched once, cached, and refreshed for a new key id', async () => {
  const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid: 'k1' };
  let calls = 0;
  let clock = 0;
  const fakeFetch = (async () => {
    calls++;
    return new Response(JSON.stringify({ keys: [jwk] }), { headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const find = createKeyLookup(CONFIG.certsUrl, fakeFetch, () => clock);

  assert.ok(await find('k1'));
  assert.ok(await find('k1'));
  assert.equal(calls, 1, 'cached');
  assert.equal(await find('rotated'), null);
  assert.equal(calls, 1, 'unknown kid right after a fetch does not hammer the endpoint');
  clock += 31_000;
  await find('rotated');
  assert.equal(calls, 2, 'refreshes after 30s for an unknown kid');
  clock += 2 * 60 * 60 * 1000;
  await find('k1');
  assert.equal(calls, 3, 'refreshes after an hour');

  const token = await sign(good);
  assert.equal((await verifyAccessToken(token, CONFIG, find, NOW)).ok, true, 'fetched key verifies real tokens');
});

test('a failing key endpoint refuses access instead of crashing', async () => {
  const find = createKeyLookup(CONFIG.certsUrl, (async () => {
    throw new Error('offline');
  }) as typeof fetch);
  assert.equal(await find('k1'), null);
});

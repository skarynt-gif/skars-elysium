/**
 * Studio sign-in check.
 *
 * Cloudflare Access sits in front of the Studio and only lets your email
 * through its login page. Access then attaches a signed token (a JWT) to every
 * request. This module verifies that token again inside the Studio's own code,
 * so the API stays locked even if the Access setup were ever removed or
 * misconfigured: no valid token from your team, for your app, for an allowed
 * email, means no access. Missing configuration also means no access.
 */
import type { StudioEnv } from './cloudflare.ts';

export interface AccessConfig {
  /** e.g. "https://skar.cloudflareaccess.com" */
  issuer: string;
  certsUrl: string;
  audience: string;
  adminEmails: string[];
}

export type AuthResult =
  | { ok: true; email: string }
  | { ok: false; status: 401 | 403 | 500; reason: string };

/** Finds the public key Access signed with, by key id. */
export type KeyLookup = (kid: string) => Promise<CryptoKey | null>;

const CLOCK_SKEW_SECONDS = 60;
const TEAM_HOST = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.cloudflareaccess\.com$/;

/** Accepts "skar", "skar.cloudflareaccess.com" or "https://skar.cloudflareaccess.com/". */
export function teamIssuer(teamDomain: string): string | null {
  let host = teamDomain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  if (!host.includes('.')) host = `${host}.cloudflareaccess.com`;
  return TEAM_HOST.test(host) ? `https://${host}` : null;
}

export function parseEmails(list: string | undefined): string[] {
  return (list ?? '')
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes('@'));
}

/** Returns the config, or a plain-language message saying what's missing. */
export function readAccessConfig(env: StudioEnv): AccessConfig | string {
  const missing: string[] = [];
  if (!env.ACCESS_TEAM_DOMAIN) missing.push('ACCESS_TEAM_DOMAIN');
  if (!env.ACCESS_AUD) missing.push('ACCESS_AUD');
  const adminEmails = parseEmails(env.ADMIN_EMAILS);
  if (adminEmails.length === 0) missing.push('ADMIN_EMAILS');
  if (missing.length) return `The Studio is locked because these settings are missing: ${missing.join(', ')}.`;

  const issuer = teamIssuer(env.ACCESS_TEAM_DOMAIN!);
  if (!issuer) return 'ACCESS_TEAM_DOMAIN should be your team name, like "skar" (from skar.cloudflareaccess.com).';
  return {
    issuer,
    certsUrl: `${issuer}/cdn-cgi/access/certs`,
    audience: env.ACCESS_AUD!.trim(),
    adminEmails,
  };
}

// ---------- JWT ----------

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeJson(part: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(base64UrlToBytes(part)));
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export type TokenCheck = { ok: true; email: string } | { ok: false; reason: string };

/** Verifies an Access token's signature and claims. Pure apart from the key lookup. */
export async function verifyAccessToken(
  token: string,
  config: AccessConfig,
  lookupKey: KeyLookup,
  nowSeconds = Date.now() / 1000,
): Promise<TokenCheck> {
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((p) => !/^[A-Za-z0-9_-]+$/.test(p))) {
    return { ok: false, reason: 'Malformed sign-in token.' };
  }
  const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];
  const header = decodeJson(headerPart);
  const claims = decodeJson(payloadPart);
  if (!header || !claims) return { ok: false, reason: 'Malformed sign-in token.' };
  // Only RS256 is accepted: never "none", never a symmetric algorithm.
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') {
    return { ok: false, reason: 'Unexpected token signature type.' };
  }

  const key = await lookupKey(header.kid);
  if (!key) return { ok: false, reason: 'Token was not signed by your Cloudflare Access team.' };
  let valid = false;
  try {
    valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      base64UrlToBytes(signaturePart),
      new TextEncoder().encode(`${headerPart}.${payloadPart}`),
    );
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, reason: 'Token signature is invalid.' };

  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(config.audience)) return { ok: false, reason: 'Token is for a different Access application.' };
  if (claims.iss !== config.issuer) return { ok: false, reason: 'Token is from a different Access team.' };
  if (typeof claims.exp !== 'number' || claims.exp < nowSeconds - CLOCK_SKEW_SECONDS) {
    return { ok: false, reason: 'Sign-in has expired. Reload the page to sign in again.' };
  }
  if (typeof claims.nbf === 'number' && claims.nbf > nowSeconds + CLOCK_SKEW_SECONDS) {
    return { ok: false, reason: 'Token is not valid yet.' };
  }
  if (typeof claims.email !== 'string' || !claims.email.includes('@')) {
    return { ok: false, reason: 'Token has no email address.' };
  }
  const email = claims.email.toLowerCase();
  if (!config.adminEmails.includes(email)) return { ok: false, reason: `${email} is not allowed into the Studio.` };
  return { ok: true, email };
}

// ---------- Access signing keys ----------

interface Jwk extends JsonWebKey {
  kid?: string;
}

const KEY_TTL_MS = 60 * 60 * 1000;
const MIN_REFRESH_MS = 30 * 1000;

/**
 * Loads (and caches) your team's public signing keys. Access rotates keys
 * periodically, so an unknown key id triggers a refresh, at most every 30s.
 */
export function createKeyLookup(certsUrl: string, fetchFn: typeof fetch = fetch, now = () => Date.now()): KeyLookup {
  let keys = new Map<string, CryptoKey>();
  let fetchedAt = -Infinity;
  let pending: Promise<void> | null = null;

  const refresh = () => {
    pending ??= (async () => {
      try {
        const response = await fetchFn(certsUrl, { headers: { accept: 'application/json' } });
        if (!response.ok) return;
        const body = (await response.json()) as { keys?: Jwk[] };
        const next = new Map<string, CryptoKey>();
        for (const jwk of body.keys ?? []) {
          if (jwk.kty !== 'RSA' || typeof jwk.kid !== 'string') continue;
          const { kid, ...material } = jwk;
          next.set(
            kid,
            await crypto.subtle.importKey('jwk', material, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']),
          );
        }
        keys = next;
        fetchedAt = now();
      } catch {
        // Network trouble: keep the old keys; the request will be refused if none match.
      } finally {
        pending = null;
      }
    })();
    return pending;
  };

  return async (kid) => {
    const age = now() - fetchedAt;
    if (age > KEY_TTL_MS || (!keys.has(kid) && age > MIN_REFRESH_MS)) await refresh();
    return keys.get(kid) ?? null;
  };
}

// ---------- Request ----------

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function tokenFrom(request: Request): string | null {
  const header = request.headers.get('cf-access-jwt-assertion');
  if (header) return header;
  const cookie = request.headers.get('cookie') ?? '';
  const match = /(?:^|;\s*)CF_Authorization=([^;]+)/.exec(cookie);
  return match?.[1] ?? null;
}

const lookups = new Map<string, KeyLookup>();

/** Decides whether a request may use the Studio. */
export async function authenticate(
  request: Request,
  env: StudioEnv,
  keyLookupFor: (certsUrl: string) => KeyLookup = (url) => {
    let lookup = lookups.get(url);
    if (!lookup) lookups.set(url, (lookup = createKeyLookup(url)));
    return lookup;
  },
): Promise<AuthResult> {
  // Local development (`npm run studio:local`) has no Access in front of it.
  // This only works when the address really is localhost, never on the web.
  if (env.DEV_AUTH_EMAIL && LOCAL_HOSTS.has(new URL(request.url).hostname)) {
    return { ok: true, email: env.DEV_AUTH_EMAIL.toLowerCase() };
  }

  const config = readAccessConfig(env);
  if (typeof config === 'string') return { ok: false, status: 500, reason: config };

  const token = tokenFrom(request);
  if (!token) return { ok: false, status: 401, reason: 'Not signed in. Open the Studio address to sign in with Cloudflare Access.' };

  const result = await verifyAccessToken(token, config, keyLookupFor(config.certsUrl));
  if (result.ok) return result;
  const notAllowed = result.reason.endsWith('not allowed into the Studio.');
  return { ok: false, status: notAllowed ? 403 : 401, reason: result.reason };
}

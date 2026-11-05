// Who is asking (SPEC v3.0 §12.4). Cloudflare Access guards the whole origin and adds a signed
// token (cf-access-jwt-assertion) to every request it lets through. The API checks that token's
// signature against the team's published keys, its audience (this Access app) and its expiry,
// rather than trusting the plain email header.

export interface AccessConfig {
  /** The Zero Trust team name: hiebert-personal → hiebert-personal.cloudflareaccess.com. */
  team: string;
  /** The Access application's audience (AUD) tag. */
  aud: string;
}

export interface Identity {
  email: string;
  /** When the session was issued and ends, ms since epoch, or null. */
  issuedAt: number | null;
  expiresAt: number | null;
}

type Jwk = JsonWebKey & { kid?: string };

const b64urlBytes = (s: string) => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
};

/** The payload of a JWT, unchecked; null if it isn't one. */
export function jwtPayload(token: string): Record<string, unknown> | null {
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const v: unknown = JSON.parse(new TextDecoder().decode(b64urlBytes(part)));
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The team's signing keys, kept for an hour per Worker instance. */
let keyCache: { team: string; at: number; keys: Jwk[] } | null = null;

export async function teamKeys(team: string, fetcher: typeof fetch = fetch, now = Date.now()): Promise<Jwk[]> {
  if (keyCache && keyCache.team === team && now - keyCache.at < 3_600_000) return keyCache.keys;
  const res = await fetcher(`https://${team}.cloudflareaccess.com/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`Access keys: HTTP ${res.status}`);
  const keys = ((await res.json()) as { keys?: Jwk[] }).keys ?? [];
  keyCache = { team, at: now, keys };
  return keys;
}

export function clearKeyCache(): void {
  keyCache = null;
}

/**
 * The signed-in person, or null when the token is missing, forged, for another app, or expired.
 * `keys` is the team's key set (teamKeys).
 */
export async function verifyAccess(token: string, cfg: AccessConfig, keys: readonly Jwk[], now = Date.now()): Promise<Identity | null> {
  const [h, p, s] = token.split('.');
  if (!h || !p || !s) return null;
  let header: { alg?: string; kid?: string };
  try {
    header = JSON.parse(new TextDecoder().decode(b64urlBytes(h))) as typeof header;
  } catch {
    return null;
  }
  if (header.alg !== 'RS256') return null;
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlBytes(s), new TextEncoder().encode(`${h}.${p}`));
  if (!ok) return null;
  const payload = jwtPayload(token);
  if (!payload) return null;
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(cfg.aud)) return null;
  if (payload.iss !== `https://${cfg.team}.cloudflareaccess.com`) return null;
  const exp = typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  if (exp === null || exp <= now) return null;
  if (typeof payload.email !== 'string' || payload.email === '') return null;
  return { email: payload.email.toLowerCase(), issuedAt: typeof payload.iat === 'number' ? payload.iat * 1000 : null, expiresAt: exp };
}

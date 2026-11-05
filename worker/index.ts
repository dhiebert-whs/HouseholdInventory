// The Worker (SPEC v3.0 §2, §12): serves the built app from dist/ and, from H5, the API. The whole
// origin sits behind Cloudflare Access (§12.4), so by the time a request gets here the person has
// signed in with an emailed code; Access adds their email and a signed token to the request.
// H5 spike: GET /api/whoami reports that identity and the session's times, and GET /api/signin
// is where the app sends someone to sign in (Access shows its login first, then this sends them
// home). Checking the token's signature against the team's keys comes with the real API.

export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

/** The payload of a JWT, unchecked; null if it isn't one. */
export function jwtPayload(token: string): Record<string, unknown> | null {
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
    const v: unknown = JSON.parse(atob(b64));
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function whoami(request: Request, now = Date.now()) {
  const email = request.headers.get('cf-access-authenticated-user-email');
  if (!email) return json({ signedIn: false }, 401);
  const p = jwtPayload(request.headers.get('cf-access-jwt-assertion') ?? '');
  const time = (k: string) => (typeof p?.[k] === 'number' ? (p[k] as number) * 1000 : null);
  return json({ signedIn: true, email, issuedAt: time('iat'), expiresAt: time('exp'), serverTime: now });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/whoami') return whoami(request);
    if (pathname === '/api/signin') return new Response(null, { status: 302, headers: { location: '/', 'cache-control': 'no-store' } });
    if (pathname.startsWith('/api/')) return json({ error: 'not found' }, 404);
    return env.ASSETS.fetch(request);
  },
};

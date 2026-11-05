import { describe, expect, it } from 'vitest';
import worker, { jwtPayload, whoami } from '../worker/index';

const b64url = (o: object) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const token = (payload: object) => `${b64url({ alg: 'RS256' })}.${b64url(payload)}.sig`;
const assets = { fetch: async (r: Request) => new Response(`asset ${new URL(r.url).pathname}`) };
const get = (path: string, headers: Record<string, string> = {}) => worker.fetch(new Request(`https://x.workers.dev${path}`, { headers }), { ASSETS: assets });

describe('the Worker (H5 sign-in spike, SPEC v3.0 §12.4)', () => {
  it('whoami: the Access email and the session times from its token', async () => {
    const res = whoami(new Request('https://x/api/whoami', { headers: { 'cf-access-authenticated-user-email': 'ann@example.com', 'cf-access-jwt-assertion': token({ iat: 1000, exp: 2000 }) } }), 5);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ signedIn: true, email: 'ann@example.com', issuedAt: 1_000_000, expiresAt: 2_000_000, serverTime: 5 });
  });

  it('whoami with no Access identity: 401, signed out', async () => {
    const res = await get('/api/whoami');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ signedIn: false });
  });

  it('a token that is not a JWT gives no times, not an error', async () => {
    expect(jwtPayload('nonsense')).toBeNull();
    expect(jwtPayload('a.%%%.c')).toBeNull();
    const res = await get('/api/whoami', { 'cf-access-authenticated-user-email': 'dan@example.com', 'cf-access-jwt-assertion': 'x.y' });
    expect(await res.json()).toMatchObject({ signedIn: true, issuedAt: null, expiresAt: null });
  });

  it('signin sends the phone back to the app; unknown /api paths are 404; the rest is the app', async () => {
    const signin = await get('/api/signin');
    expect([signin.status, signin.headers.get('location')]).toEqual([302, '/']);
    expect((await get('/api/nope')).status).toBe(404);
    expect(await (await get('/index.html')).text()).toBe('asset /index.html');
  });
});

// The Worker (SPEC v3.0 §2, §12): serves the built app from dist/ and the sync API. The whole
// origin sits behind Cloudflare Access (§12.4), so by the time a request gets here the person has
// signed in with an emailed code; the API still checks Access's signed token (auth.ts).
//   GET  /api/sync?since=N     records changed after cursor N (pull)
//   POST /api/push             a phone's outbox changes (push)
//   GET  /api/me, POST /api/me who is signed in; change your name
//   PUT  /api/files/<photo id>[?thumb=1]  upload a photo's image (§12.3); GET downloads it
//   GET  /api/whoami           the H5 spike's sign-in check
//   GET  /api/signin           where the app sends someone to sign in
import { FILE_MAX_BYTES, type PushRequest } from '../src/domain/sync';
import type { D1Database, R2Bucket } from './bindings';
import { jwtPayload, teamKeys, verifyAccess, type Identity } from './auth';
import { ensureSchema, personFor, photoExists, pull, purge, push, recordUpload, renamePerson } from './store';

export { jwtPayload };

export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  DB: D1Database;
  FILES: R2Bucket;
  /** Zero Trust team name and the Access app's AUD tag (cloudflare.config.ts). */
  ACCESS_TEAM: string;
  ACCESS_AUD: string;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export function whoami(request: Request, now = Date.now()) {
  const email = request.headers.get('cf-access-authenticated-user-email');
  if (!email) return json({ signedIn: false }, 401);
  const p = jwtPayload(request.headers.get('cf-access-jwt-assertion') ?? '');
  const time = (k: string) => (typeof p?.[k] === 'number' ? (p[k] as number) * 1000 : null);
  return json({ signedIn: true, email, issuedAt: time('iat'), expiresAt: time('exp'), serverTime: now });
}

/**
 * The signed-in person's identity from Access's token, or null. Only `cf dev` on this computer
 * (no AUD configured, localhost) takes the plain email header, which its Access simulation sets.
 */
async function identify(request: Request, env: Env): Promise<Identity | null> {
  const token = request.headers.get('cf-access-jwt-assertion');
  if (!env.ACCESS_AUD) {
    const local = ['localhost', '127.0.0.1'].includes(new URL(request.url).hostname);
    const email = request.headers.get('cf-access-authenticated-user-email');
    return local && email ? { email: email.toLowerCase(), issuedAt: null, expiresAt: null } : null;
  }
  if (!token) return null;
  return verifyAccess(token, { team: env.ACCESS_TEAM, aud: env.ACCESS_AUD }, await teamKeys(env.ACCESS_TEAM));
}

const fileKey = (id: string, thumb: boolean) => `photos/${id}${thumb ? '.thumb' : ''}`;
const PHOTO_ID = /^ph-[A-Za-z0-9_-]{1,32}$/;

async function api(request: Request, env: Env, url: URL): Promise<Response> {
  const { pathname } = url;
  if (pathname === '/api/whoami') return whoami(request);
  if (pathname === '/api/signin') return new Response(null, { status: 302, headers: { location: '/', 'cache-control': 'no-store' } });

  const who = await identify(request, env);
  if (!who) return json({ error: 'signed out' }, 401);
  await ensureSchema(env.DB);
  const me = await personFor(env.DB, who.email);
  const method = request.method;

  if (pathname === '/api/sync' && method === 'GET') {
    const since = Number(url.searchParams.get('since') ?? '0');
    if (!Number.isSafeInteger(since) || since < 0) return json({ error: 'bad cursor' }, 400);
    return json(await pull(env.DB, since, me));
  }
  if (pathname === '/api/push' && method === 'POST') {
    const body = (await request.json().catch(() => null)) as PushRequest | null;
    if (!body || !Array.isArray(body.changes)) return json({ error: 'bad push' }, 400);
    return json(await push(env.DB, body.changes, me));
  }
  if (pathname === '/api/me') {
    if (method === 'GET') return json(me);
    if (method === 'POST') {
      const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
      if (typeof body?.name !== 'string' || body.name.trim() === '') return json({ error: 'a name is needed' }, 400);
      return json(await renamePerson(env.DB, me, body.name));
    }
  }
  const file = /^\/api\/files\/([^/]+)$/.exec(pathname);
  if (file) {
    const id = file[1]!;
    if (!PHOTO_ID.test(id)) return json({ error: 'not a photo id' }, 400);
    const thumb = url.searchParams.get('thumb') === '1';
    if (method === 'GET') {
      const obj = await env.FILES.get(fileKey(id, thumb));
      if (!obj) return json({ error: 'not uploaded yet' }, 404);
      return new Response(obj.body, { headers: { 'content-type': obj.httpMetadata?.contentType ?? 'image/jpeg', 'cache-control': 'private, max-age=31536000, immutable' } });
    }
    if (method === 'PUT') {
      // The record syncs first (§12.3); until then the phone retries.
      if (!(await photoExists(env.DB, id))) return json({ error: 'the photo’s record hasn’t synced yet' }, 409);
      const bytes = await request.arrayBuffer();
      if (bytes.byteLength === 0) return json({ error: 'empty file' }, 400);
      if (bytes.byteLength > FILE_MAX_BYTES) return json({ error: 'file too large' }, 413);
      const contentType = request.headers.get('content-type') ?? 'image/jpeg';
      await env.FILES.put(fileKey(id, thumb), bytes, { httpMetadata: { contentType } });
      if (!thumb) await recordUpload(env.DB, id, { r2Key: fileKey(id, false), contentType, bytes: bytes.byteLength }, me);
      return json({ ok: true });
    }
  }
  return json({ error: 'not found' }, 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      return await api(request, env, url);
    } catch (e) {
      console.error(e);
      return json({ error: 'server error' }, 500);
    }
  },

  /** Daily: purge old deletes and their files, and old activity (§12.2). */
  async scheduled(_event: unknown, env: Env): Promise<void> {
    await ensureSchema(env.DB);
    const photos = await purge(env.DB);
    for (let i = 0; i < photos.length; i += 500) await env.FILES.delete(photos.slice(i, i + 500).flatMap((id) => [fileKey(id, false), fileKey(id, true)]));
  },
};

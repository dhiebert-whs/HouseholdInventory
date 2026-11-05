import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { InventoryDb } from '../src/data/db';
import { loadSignInChecks, recordSignInCheck, SIGNIN_LOG_MAX, watchSignIn } from '../src/data/signin-log';
import { checkSignIn, readWhoami } from '../src/io/signin';

const dbs: InventoryDb[] = [];
afterEach(() => {
  for (const d of dbs.splice(0)) d.close();
});
const newDb = () => {
  const d = new InventoryDb(`signin-${Math.random()}`);
  dbs.push(d);
  return d;
};
const jsonRes = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('the sign-in check (H5 spike)', () => {
  it('reads signed in, signed out (Access redirect or 401) and no server (GitHub Pages 404)', async () => {
    expect(await readWhoami(jsonRes({ signedIn: true, email: 'ann@example.com', issuedAt: 1, expiresAt: 2 }))).toEqual({ kind: 'signed-in', email: 'ann@example.com', issuedAt: 1, expiresAt: 2 });
    expect(await readWhoami({ type: 'opaqueredirect', status: 0, ok: false, headers: new Headers(), json: async () => ({}) })).toEqual({ kind: 'signed-out' });
    expect(await readWhoami(jsonRes({ signedIn: false }, 401))).toEqual({ kind: 'signed-out' });
    expect(await readWhoami(new Response('<html>404', { status: 404, headers: { 'content-type': 'text/html' } }))).toEqual({ kind: 'no-server' });
    expect(await readWhoami(new Response('<html>app', { status: 200, headers: { 'content-type': 'text/html' } }))).toEqual({ kind: 'no-server' });
  });

  it('a network failure is offline, with its message', async () => {
    const r = await checkSignIn(async () => {
      throw new TypeError('Load failed');
    });
    expect(r).toEqual({ kind: 'offline', message: 'Load failed' });
  });

  it('keeps the newest checks first, at most the limit', async () => {
    const db = newDb();
    for (let i = 0; i < SIGNIN_LOG_MAX + 5; i++) await recordSignInCheck(db, { at: i, result: { kind: 'signed-out' }, standalone: false });
    const list = await loadSignInChecks(db);
    expect(list.length).toBe(SIGNIN_LOG_MAX);
    expect(list[0]!.at).toBe(SIGNIN_LOG_MAX + 4);
  });

  it('watching records at launch, but not on a copy with no server', async () => {
    const host = { visibilityState: 'visible' as DocumentVisibilityState, addEventListener() {}, removeEventListener() {} };
    const a = newDb();
    watchSignIn(a, async () => ({ kind: 'signed-out' }), host)();
    const b = newDb();
    watchSignIn(b, async () => ({ kind: 'no-server' }), host)();
    await new Promise((r) => setTimeout(r, 50));
    expect((await loadSignInChecks(a)).length).toBe(1);
    expect(await loadSignInChecks(b)).toEqual([]);
  });
});

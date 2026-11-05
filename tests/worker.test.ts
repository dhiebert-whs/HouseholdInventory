import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Change, PullResponse, PushResponse } from '../src/domain/sync';
import { clearKeyCache } from '../worker/auth';
import worker, { jwtPayload, whoami } from '../worker/index';
import { nameFromEmail, purge } from '../worker/store';
import { accessKeys, testEnv } from './worker-fakes';
import { area, bin, item, season, spot } from './helpers';

const b64url = (o: object) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unsigned = (payload: object) => `${b64url({ alg: 'RS256' })}.${b64url(payload)}.sig`;

let keys: Awaited<ReturnType<typeof accessKeys>>;
let env: ReturnType<typeof testEnv>;

beforeAll(async () => {
  keys = await accessKeys();
});
beforeEach(() => {
  env = testEnv();
  clearKeyCache();
  vi.stubGlobal('fetch', async (url: string) => {
    expect(url).toBe('https://test-team.cloudflareaccess.com/cdn-cgi/access/certs');
    return new Response(JSON.stringify({ keys: [keys.jwk] }));
  });
});
afterEach(() => vi.unstubAllGlobals());

const call = async (path: string, init: RequestInit & { as?: string; token?: string } = {}) => {
  const headers = new Headers(init.headers);
  const token = init.token ?? (init.as ? await keys.token(init.as) : undefined);
  if (token) headers.set('cf-access-jwt-assertion', token);
  return worker.fetch(new Request(`https://x.workers.dev${path}`, { ...init, headers }), env);
};
const pullAs = async (who: string, since = 0) => (await (await call(`/api/sync?since=${since}`, { as: who })).json()) as PullResponse;
const pushAs = async (who: string, changes: Change[]) => (await (await call('/api/push', { as: who, method: 'POST', body: JSON.stringify({ changes }) })).json()) as PushResponse;
const put = <T extends { id: string }>(type: Change['type'], data: T, base: number | null = null): Change => ({ type, id: data.id, op: 'put', data: data as never, base });

const DAN = 'dan@example.com';
const ANN = 'ann@example.com';
const house = () => [
  put('season', season()),
  put('area', area({ code: 'ATTIC' })),
  put('spot', spot()),
  put('bin', bin({ code: 'ATTIC-04', spotId: 'sp-SPOT0001', seasonId: 'se-SEAS0001' })),
  put('item', item({ name: 'Snowman lights', binId: 'bn-BIN00001' })),
];

describe('the Worker: sign-in (SPEC v3.0 §12.4)', () => {
  it('whoami: the Access email and the session times from its token (H5 spike)', async () => {
    const res = whoami(new Request('https://x/api/whoami', { headers: { 'cf-access-authenticated-user-email': 'ann@example.com', 'cf-access-jwt-assertion': unsigned({ iat: 1000, exp: 2000 }) } }), 5);
    expect(await res.json()).toEqual({ signedIn: true, email: 'ann@example.com', issuedAt: 1_000_000, expiresAt: 2_000_000, serverTime: 5 });
    expect(jwtPayload('nonsense')).toBeNull();
  });

  it('signin sends the phone back to the app; unknown /api paths are 404; the rest is the app', async () => {
    const signin = await call('/api/signin');
    expect([signin.status, signin.headers.get('location')]).toEqual([302, '/']);
    expect((await call('/api/nope', { as: DAN })).status).toBe(404);
    expect(await (await call('/index.html')).text()).toBe('asset /index.html');
  });

  it('the API refuses a missing, forged, wrong-app or expired token, and the plain email header', async () => {
    expect((await call('/api/sync')).status).toBe(401);
    expect((await call('/api/sync', { headers: { 'cf-access-authenticated-user-email': DAN } })).status).toBe(401);
    expect((await call('/api/sync', { token: unsigned({ email: DAN }) })).status).toBe(401);
    expect((await call('/api/sync', { token: await keys.token(DAN, { aud: ['other-app'] }) })).status).toBe(401);
    expect((await call('/api/sync', { token: await keys.token(DAN, { exp: Math.floor(Date.now() / 1000) - 5 }) })).status).toBe(401);
    expect((await call('/api/sync', { token: await keys.token(DAN, { iss: 'https://evil.cloudflareaccess.com' }) })).status).toBe(401);
    expect((await call('/api/sync', { as: DAN })).status).toBe(200);
  });

  it('first sign-in makes a Person named from the email; a name can be changed', async () => {
    expect(nameFromEmail('dan.hiebert@example.com')).toBe('Dan');
    const me = (await pullAs('Dan.Hiebert@Example.com')).me;
    expect(me).toMatchObject({ name: 'Dan', email: 'dan.hiebert@example.com' });
    expect(me.id).toMatch(/^pp-/);
    expect((await pullAs('dan.hiebert@example.com')).me.id).toBe(me.id);
    const renamed = await (await call('/api/me', { as: 'dan.hiebert@example.com', method: 'POST', body: JSON.stringify({ name: ' Dad ' }) })).json();
    expect(renamed).toMatchObject({ id: me.id, name: 'Dad' });
    const people = (await pullAs(ANN)).records.filter((r) => r.type === 'person');
    expect(people.map((p) => p.data?.name).sort()).toEqual(['Ann', 'Dad']);
  });
});

describe('the Worker: push and pull (§12.1)', () => {
  it('an empty server says so; a push is stored with the server time and person, and others pull it', async () => {
    expect((await pullAs(DAN)).serverEmpty).toBe(true);
    const res = await pushAs(DAN, house());
    expect(res.rejected).toEqual([]);
    expect(res.accepted).toHaveLength(5);
    const ann = await pullAs(ANN);
    expect(ann.serverEmpty).toBe(false);
    const it = ann.records.find((r) => r.type === 'item')!;
    expect(it.data).toMatchObject({ name: 'Snowman lights', binId: 'bn-BIN00001' });
    expect(it.updatedBy).toBe((await pullAs(DAN)).me.id);
    // The cursor moves on: a second pull brings only what changed since.
    expect((await pullAs(ANN, ann.cursor)).records).toEqual([]);
  });

  it('pages: `more` until everything has come down', async () => {
    await pushAs(DAN, house());
    const res = await call('/api/sync?since=0', { as: ANN });
    const all = (await res.json()) as PullResponse;
    expect(all.more).toBe(false);
    expect((await call('/api/sync?since=-1', { as: ANN })).status).toBe(400);
  });

  it('a delete is a tombstone: pulled as deleted, left out of a full download', async () => {
    await pushAs(DAN, house());
    const before = await pullAs(ANN);
    await pushAs(DAN, [{ type: 'item', id: 'it-TEST0001', op: 'delete', base: null }]);
    const after = await pullAs(ANN, before.cursor);
    expect(after.records.find((r) => r.type === 'item')).toMatchObject({ id: 'it-TEST0001', deleted: true, data: null });
    expect((await pullAs(ANN)).records.some((r) => r.type === 'item')).toBe(false);
    // Deleting it again is harmless.
    expect((await pushAs(DAN, [{ type: 'item', id: 'it-TEST0001', op: 'delete', base: null }])).accepted).toHaveLength(1);
  });

  it('refuses malformed records and links across parts, sending back the server’s version', async () => {
    await pushAs(DAN, house());
    const res = await pushAs(DAN, [
      put('item', item({ name: 'Both', binId: 'bn-BIN00001', spotId: 'sp-SPOT0001' })),
      put('item', item({ id: 'it-TEST0002', part: 'household', seasonId: '', binId: 'bn-BIN00001' })),
      { type: 'item', id: 'it-TEST0003', op: 'put', data: { id: 'it-TEST0003' }, base: null },
      { type: 'nonsense' as never, id: 'x', op: 'put', base: null },
    ]);
    expect(res.accepted).toEqual([]);
    expect(res.rejected.map((r) => r.reason)).toEqual(['an item is in a bin or on a spot, not both', 'its bin is in the other part', 'the record is missing fields', 'the app sent a change the server doesn’t know']);
    expect(res.rejected[0]!.current).toMatchObject({ name: 'Snowman lights' });
    expect(res.notices[0]).toMatchObject({ kind: 'refused', name: 'Both' });
  });

  it('a bin code taken meanwhile gets the next free number, and a new label', async () => {
    await pushAs(DAN, house());
    const res = await pushAs(ANN, [put('bin', bin({ id: 'bn-BIN00002', code: 'ATTIC-04', name: 'Easter', labelPrintedAt: 5, labelContents: 'x' }))]);
    expect(res.notices).toEqual([{ kind: 'bin-code', id: 'bn-BIN00002', from: 'ATTIC-04', to: 'ATTIC-05' }]);
    const b = (await pullAs(DAN)).records.find((r) => r.id === 'bn-BIN00002')!;
    expect(b.data).toMatchObject({ code: 'ATTIC-05', labelPrintedAt: null, labelContents: null });
    // Its own code again is no clash.
    expect((await pushAs(ANN, [put('bin', { ...b.data, name: 'Easter eggs' } as never)])).notices).toEqual([]);
  });

  it('last write wins; overwriting someone’s newer change is noted; ticked tasks merge', async () => {
    await pushAs(DAN, [...house(), put('task', { id: 'tk-TASK0001', seasonId: 'se-SEAS0001', phase: 'setup', text: 'Lights', order: 0 } as never), put('task', { id: 'tk-TASK0002', seasonId: 'se-SEAS0001', phase: 'setup', text: 'Tree', order: 1 } as never)]);
    const run = { id: 'sr-RUN00001', seasonId: 'se-SEAS0001', year: 2026, setupFrom: '', takedownBy: '', phase: 'setting up', doneTaskIds: [] as string[], startedAt: 1, finishedAt: null };
    await pushAs(DAN, [put('run', run)]);
    const seen = (await pullAs(ANN)).records.find((r) => r.id === 'sr-RUN00001')!.updatedAt;
    await pushAs(DAN, [put('run', { ...run, doneTaskIds: ['tk-TASK0001'] }, seen), put('item', item({ name: 'Snowman lights', binId: 'bn-BIN00001', quantity: 3 }), seen)]);
    // Ann last saw the older versions.
    await pushAs(ANN, [put('run', { ...run, doneTaskIds: ['tk-TASK0002'] }, seen), put('item', item({ name: 'Snowman lights', binId: 'bn-BIN00001', quantity: 9 }), seen)]);
    const recs = (await pullAs(DAN)).records;
    expect(recs.find((r) => r.id === 'sr-RUN00001')!.data!.doneTaskIds).toEqual(['tk-TASK0001', 'tk-TASK0002']);
    expect(recs.find((r) => r.id === 'it-TEST0001')!.data!.quantity).toBe(9);
    const log = recs.filter((r) => r.type === 'activity').map((r) => r.data!);
    const dan = (await pullAs(DAN)).me.id;
    expect(log.find((a) => a.summary === 'changed Snowman lights to 9')).toMatchObject({ overwrote: { personId: dan } });
    expect(log.map((a) => a.summary)).toContain('ticked “Lights” for Christmas');
  });

  it('a photo’s file fields survive a caption edit from a phone that hadn’t pulled them', async () => {
    await pushAs(DAN, house());
    const photo = { id: 'ph-PHOTO001', ownerType: 'item', ownerId: 'it-TEST0001', kind: 'photo', caption: '', order: 0 };
    await pushAs(DAN, [put('photo', photo)]);
    expect((await call('/api/files/ph-PHOTO001', { as: DAN, method: 'PUT', body: new Uint8Array([1, 2, 3]), headers: { 'content-type': 'image/jpeg' } })).status).toBe(200);
    await pushAs(DAN, [put('photo', { ...photo, caption: 'Front' })]);
    const p = (await pullAs(ANN)).records.find((r) => r.id === 'ph-PHOTO001')!;
    expect(p.data).toMatchObject({ caption: 'Front', r2Key: 'photos/ph-PHOTO001', contentType: 'image/jpeg', bytes: 3 });
  });
});

describe('the Worker: activity (F17)', () => {
  it('a line per change, in plain words, with its area and season', async () => {
    await pushAs(DAN, house());
    await pushAs(ANN, [put('item', item({ name: 'Snowman lights', status: 'out', outWhere: 'Mantel', outSince: 1 }))]);
    const log = (await pullAs(DAN)).records.filter((r) => r.type === 'activity').map((r) => r.data!);
    expect(log.map((a) => a.summary)).toEqual(['added season Christmas', 'added area Attic', 'added spot Shelf B', 'added bin ATTIC-04 Christmas 1', 'added Snowman lights', 'moved Snowman lights to No home yet']);
    expect(log[4]).toMatchObject({ recordType: 'item', recordId: 'it-TEST0001', part: 'holiday', areaId: 'ar-AREA0001', seasonId: 'se-SEAS0001' });
    await pushAs(ANN, [put('item', item({ name: 'Snowman lights', binId: 'bn-BIN00001', status: 'out', outWhere: 'Mantel', outSince: 1 }))]);
    await pushAs(ANN, [put('item', item({ name: 'Snowman lights', binId: 'bn-BIN00001' }))]);
    const more = (await pullAs(DAN)).records.filter((r) => r.type === 'activity').map((r) => r.data!.summary);
    expect(more.slice(-2)).toEqual(['moved Snowman lights to ATTIC-04 Christmas 1', 'put back Snowman lights']);
  });

  it('only an order change gets no line; a big push gets one line', async () => {
    await pushAs(DAN, house());
    await pushAs(DAN, [put('season', season({ order: 3 }))]);
    let log = (await pullAs(DAN)).records.filter((r) => r.type === 'activity');
    expect(log).toHaveLength(5);
    await pushAs(DAN, Array.from({ length: 12 }, (_, k) => put('item', item({ id: `it-BULK00${String(k + 10)}`, name: `Ornament ${k}` }))));
    log = (await pullAs(DAN)).records.filter((r) => r.type === 'activity');
    expect(log.at(-1)!.data!.summary).toBe('made 12 changes: 12 items');
  });
});

describe('the Worker: files (§12.3) and clean-up (§12.2)', () => {
  it('an upload waits for its record; then it is stored, and downloads', async () => {
    await pushAs(DAN, house());
    const body = new Uint8Array([9, 8, 7]);
    expect((await call('/api/files/ph-PHOTO001', { as: DAN, method: 'PUT', body })).status).toBe(409);
    await pushAs(DAN, [put('photo', { id: 'ph-PHOTO001', ownerType: 'item', ownerId: 'it-TEST0001', kind: 'photo', caption: '', order: 0 })]);
    expect((await call('/api/files/ph-PHOTO001?thumb=1', { as: DAN, method: 'PUT', body, headers: { 'content-type': 'image/jpeg' } })).status).toBe(200);
    expect(env.FILES.objects.has('photos/ph-PHOTO001.thumb')).toBe(true);
    const got = await call('/api/files/ph-PHOTO001?thumb=1', { as: ANN });
    expect([...new Uint8Array(await got.arrayBuffer())]).toEqual([9, 8, 7]);
    expect((await call('/api/files/ph-PHOTO001', { as: ANN })).status).toBe(404);
    expect((await call('/api/files/../secret', { as: ANN })).status).toBe(404);
    expect((await call('/api/files/nonsense', { as: ANN })).status).toBe(400);
  });

  it('purges old tombstones and their files; an older cursor must start again', async () => {
    await pushAs(DAN, house());
    await pushAs(DAN, [put('photo', { id: 'ph-PHOTO001', ownerType: 'item', ownerId: 'it-TEST0001', kind: 'photo', caption: '', order: 0 })]);
    await call('/api/files/ph-PHOTO001', { as: DAN, method: 'PUT', body: new Uint8Array([1]) });
    const old = await pullAs(ANN);
    await pushAs(DAN, [{ type: 'photo', id: 'ph-PHOTO001', op: 'delete', base: null }]);
    const seen = await pullAs(ANN, old.cursor);
    expect(await purge(env.DB)).toEqual([]);
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 91 * 86_400_000);
    await worker.scheduled({}, env);
    vi.restoreAllMocks();
    expect(env.FILES.objects.size).toBe(0);
    // A phone that hadn't pulled since before the purged delete starts again; one that had doesn't.
    expect((await pullAs(ANN, old.cursor)).reset).toBe(true);
    expect((await pullAs(ANN, seen.cursor)).reset).toBe(false);
  });
});

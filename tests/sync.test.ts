// Sync end to end (SPEC v3.0 §12): two phones (two databases) through the real Worker code,
// on D1 over SQLite. Covers the outbox, first sync, both directions, conflicts, refusals,
// links left by another phone's delete, photos and a reset.
import 'fake-indexeddb/auto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { InventoryDb } from '../src/data/db';
import { getItem, loadSnapshot, replaceAll } from '../src/data/inventory';
import { addItem, updateItem } from '../src/data/items';
import { addPhotos, photosOf } from '../src/data/photos';
import { addBin, deleteBin } from '../src/data/places';
import { applyPulled, fetchFullImage, loadNotices, syncOnce, useServerData } from '../src/data/sync';
import { checkData } from '../src/domain/integrity';
import { httpApi, type SyncApi } from '../src/io/sync-api';
import { clearKeyCache } from '../worker/auth';
import worker from '../worker/index';
import { purge } from '../worker/store';
import { bin, dataset, household, item } from './helpers';
import { accessKeys, testEnv } from './worker-fakes';

let keys: Awaited<ReturnType<typeof accessKeys>>;
let env: ReturnType<typeof testEnv>;
const dbs: InventoryDb[] = [];

beforeAll(async () => {
  keys = await accessKeys();
});
beforeEach(() => {
  env = testEnv();
  clearKeyCache();
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ keys: [keys.jwk] })));
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const d of dbs.splice(0)) d.close();
});

/** The app's API client, talking to the Worker as this person. */
function apiFor(email: string): SyncApi {
  return httpApi(async (input, init) => {
    const req = new Request(`https://x.workers.dev/${input}`, { ...init, cache: undefined });
    req.headers.set('cf-access-jwt-assertion', await keys.token(email));
    return worker.fetch(req, env);
  });
}

function phone(): InventoryDb {
  const db = new InventoryDb(`sync-${Math.random()}`);
  dbs.push(db);
  return db;
}

/** Dan's phone with the test household: two Christmas items in A-04 and a household drill. */
async function dansPhone(): Promise<InventoryDb> {
  const db = phone();
  await replaceAll(db, dataset({ ...household(), items: [item({ id: 'it-garland', name: 'Garland', binId: 'bn-xmas4' }), item({ id: 'it-lights', name: 'Lights', binId: 'bn-xmas4' }), item({ id: 'it-drill', part: 'household', name: 'Drill', category: 'Tools' })] }));
  return db;
}

const DAN = apiFor('dan@example.com');
const ANN = apiFor('ann@example.com');
const jpeg = (n: number) => ({ full: new Blob([new Uint8Array([0xff, 0xd8, n])], { type: 'image/jpeg' }), thumb: new Blob([new Uint8Array([n])], { type: 'image/jpeg' }) });
const bytes = async (b: Blob | null | undefined) => (b ? [...new Uint8Array(await b.arrayBuffer())] : null);

describe('the outbox (§12.1)', () => {
  it('records every change, the latest per record, without images; server writes aren’t recorded', async () => {
    const db = await dansPhone();
    const first = await db.outbox.get('item:it-garland');
    expect(first).toMatchObject({ type: 'item', id: 'it-garland', op: 'put', data: { name: 'Garland' } });
    expect(first!.data).not.toHaveProperty('updatedAt');
    expect(await db.outbox.get('category:holiday:Lights')).toMatchObject({ op: 'put' });
    const base = (await getItem(db, 'it-garland'))!;
    await updateItem(db, base, { ...base, name: 'Long garland' });
    const after = await db.outbox.get('item:it-garland');
    expect(after).toMatchObject({ seq: first!.seq, data: { name: 'Long garland' } });
    expect(after!.rev).toBeGreaterThan(first!.rev);

    await addPhotos(db, 'item', 'it-lights', [jpeg(1)]);
    const [photo] = await photosOf(db, 'it-lights');
    expect((await db.outbox.get(`photo:${photo!.id}`))!.data).not.toHaveProperty('full');
    expect(await db.uploads.get(photo!.id)).toBeTruthy();

    const n = await db.outbox.count();
    await applyPulled(db, [{ type: 'item', id: 'it-new', data: item({ id: 'it-new', name: 'From Ann' }) as never, updatedAt: 1, updatedBy: 'pp-ann', deleted: false }]);
    expect(await getItem(db, 'it-new')).toMatchObject({ name: 'From Ann' });
    expect(await db.outbox.count()).toBe(n);
  });
});

describe('sync between two phones (§12)', () => {
  it('the first phone uploads to an empty server; a new phone downloads everything, photos too', async () => {
    const dan = await dansPhone();
    await addPhotos(dan, 'item', 'it-lights', [jpeg(7)]);
    expect(await syncOnce(dan, DAN)).toMatchObject({ kind: 'synced' });
    expect(await dan.outbox.count()).toBe(0);
    expect(await dan.uploads.count()).toBe(0);

    const ann = phone();
    expect(await syncOnce(ann, ANN)).toMatchObject({ kind: 'synced' });
    const a = await loadSnapshot(ann);
    const d = await loadSnapshot(dan);
    expect(a.items.map((i) => i.name).sort()).toEqual(['Drill', 'Garland', 'Lights']);
    expect(a.bins).toEqual(d.bins);
    expect(a.categories).toEqual(d.categories);
    // The photo: its record, then its thumbnail; the full image when opened.
    const [p] = await photosOf(ann, 'it-lights');
    expect(await bytes(p!.thumb)).toEqual([7]);
    expect(p!.full).toBeNull();
    expect(await bytes(await fetchFullImage(ann, ANN, p!.id))).toEqual([0xff, 0xd8, 7]);
    expect(await bytes((await photosOf(ann, 'it-lights'))[0]!.full)).toEqual([0xff, 0xd8, 7]);
    // People and the log came too.
    expect((await ann.people.toArray()).map((x) => x.name).sort()).toEqual(['Ann', 'Dan']);
    expect((await ann.activity.toArray()).some((x) => x.summary.startsWith('made '))).toBe(true);
  });

  it('changes and deletes go both ways', async () => {
    const dan = await dansPhone();
    await syncOnce(dan, DAN);
    const ann = phone();
    await syncOnce(ann, ANN);
    const lights = (await getItem(ann, 'it-lights'))!;
    await updateItem(ann, lights, { ...lights, quantity: 4 });
    await deleteBin(ann, 'bn-spare', 'to-spot');
    await syncOnce(ann, ANN);
    await syncOnce(dan, DAN);
    expect((await getItem(dan, 'it-lights'))!.quantity).toBe(4);
    expect(await dan.bins.get('bn-spare')).toBeUndefined();
    expect(await dan.outbox.count()).toBe(0);
  });

  it('a phone with its own data asks; “Use the server’s data” replaces it', async () => {
    await syncOnce(await dansPhone(), DAN);
    const ann = phone();
    await replaceAll(ann, dataset({ items: [item({ id: 'it-mine', part: 'household', name: 'Mine', category: 'Tools' })] }));
    expect(await syncOnce(ann, ANN)).toEqual({ kind: 'choose' });
    expect(await getItem(ann, 'it-mine')).toBeTruthy();
    await useServerData(ann);
    expect(await syncOnce(ann, ANN)).toMatchObject({ kind: 'synced' });
    expect(await getItem(ann, 'it-mine')).toBeNull();
    expect((await loadSnapshot(ann)).items).toHaveLength(3);
    expect(await ann.outbox.count()).toBe(0);
  });

  it('a change waiting on the phone isn’t overwritten by a pull; the later push wins', async () => {
    const dan = await dansPhone();
    await syncOnce(dan, DAN);
    const ann = phone();
    await syncOnce(ann, ANN);
    const fromAnn = (await getItem(ann, 'it-lights'))!;
    await updateItem(ann, fromAnn, { ...fromAnn, notes: 'Ann' });
    await syncOnce(ann, ANN);
    // Dan, offline, changes the same item, then syncs: he pulls Ann's version first but keeps his.
    const fromDan = (await getItem(dan, 'it-lights'))!;
    await updateItem(dan, fromDan, { ...fromDan, notes: 'Dan' });
    await syncOnce(dan, DAN);
    expect((await getItem(dan, 'it-lights'))!.notes).toBe('Dan');
    await syncOnce(ann, ANN);
    expect((await getItem(ann, 'it-lights'))!.notes).toBe('Dan');
    const note = (await ann.activity.toArray()).find((a) => a.recordId === 'it-lights' && a.overwrote);
    expect(note?.overwrote?.personId).toBe((await ann.people.toArray()).find((p) => p.name === 'Ann')!.id);
  });

  it('a new bin code taken by another phone is renumbered, with a message', async () => {
    const dan = await dansPhone();
    await syncOnce(dan, DAN);
    const ann = phone();
    await syncOnce(ann, ANN);
    await addBin(dan, { code: 'A-06', name: 'Easter', spotId: 'sp-shelfA', seasonId: '', tags: [], notes: '', state: 'stored' });
    await addBin(ann, { code: 'A-06', name: 'Valentines', spotId: 'sp-shelfA', seasonId: '', tags: [], notes: '', state: 'stored' });
    await syncOnce(dan, DAN);
    await syncOnce(ann, ANN);
    const annBins = (await ann.bins.toArray()).filter((b) => b.code.startsWith('A-0') && b.name !== 'Christmas 4' && b.name !== 'Spare');
    expect(annBins.map((b) => `${b.code} ${b.name}`).sort()).toEqual(['A-06 Easter', 'A-07 Valentines']);
    expect((await loadNotices(ann)).map((n) => n.text)).toEqual(['A-06 was taken by another phone, so your new bin is A-07. Reprint its label.']);
  });

  it('a refused change goes back to the server’s version, with a message', async () => {
    const dan = await dansPhone();
    await syncOnce(dan, DAN);
    // A record no screen would make: an item in a bin and on a spot.
    const lights = (await dan.items.get('it-lights'))!;
    await dan.items.put({ ...lights, spotId: 'sp-shelfA', name: 'Broken' });
    await syncOnce(dan, DAN);
    expect(await getItem(dan, 'it-lights')).toMatchObject({ name: 'Lights', binId: 'bn-xmas4', spotId: '' });
    expect((await loadNotices(dan))[0]!.text).toBe('Couldn’t save Broken: an item is in a bin or on a spot, not both. It’s back to the version on the server.');
  });

  it('an item put in a bin another phone deleted meanwhile ends up with no home, and the data stays whole', async () => {
    const dan = await dansPhone();
    await syncOnce(dan, DAN);
    const ann = phone();
    await syncOnce(ann, ANN);
    await deleteBin(dan, 'bn-spare', 'to-spot');
    await addItem(ann, item({ id: 'it-wreath', name: 'Wreath', binId: 'bn-spare' }));
    await syncOnce(dan, DAN);
    await syncOnce(ann, ANN);
    await syncOnce(dan, DAN);
    for (const db of [dan, ann]) {
      expect(await getItem(db, 'it-wreath')).toMatchObject({ binId: '', spotId: '' });
      expect(checkData({ ...(await loadSnapshot(db)), photos: await db.pictures.toArray() })).toEqual([]);
    }
  });

  it('a phone whose cursor is older than purged deletes downloads everything again, keeping its waiting changes', async () => {
    const dan = await dansPhone();
    await syncOnce(dan, DAN);
    const ann = phone();
    await syncOnce(ann, ANN);
    await deleteBin(dan, 'bn-spare', 'to-spot');
    await syncOnce(dan, DAN);
    await purge(env.DB, Date.now() + 91 * 86_400_000);
    await ann.bins.put(bin({ id: 'bn-only', code: 'G-09', name: 'Only on Ann', part: 'holiday' }));
    // Ann's phone never saw the delete; the server has forgotten it.
    expect(await syncOnce(ann, ANN)).toMatchObject({ kind: 'synced' });
    expect(await ann.bins.get('bn-spare')).toBeUndefined();
    expect(await dan.bins.get('bn-only')).toBeUndefined();
    await syncOnce(dan, DAN);
    expect(await dan.bins.get('bn-only')).toBeTruthy();
  });

  it('signed out, offline, or no server: says so and keeps the changes', async () => {
    const dan = await dansPhone();
    const out = httpApi(async () => new Response(null, { status: 401 }));
    expect(await syncOnce(dan, out)).toEqual({ kind: 'signed-out' });
    const offline = httpApi(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await syncOnce(dan, offline)).toEqual({ kind: 'offline' });
    const pages = httpApi(async () => new Response('<!doctype html>', { status: 404, headers: { 'content-type': 'text/html' } }));
    expect(await syncOnce(dan, pages)).toEqual({ kind: 'no-server' });
    expect(await dan.outbox.count()).toBeGreaterThan(0);
  });
});

describe('the sync line (F15)', () => {
  it('says how sync stands, with what is waiting', async () => {
    const { syncLine } = await import('../src/ui/sync-runner');
    const v = (status: Parameters<typeof syncLine>[0]['status'], waiting = 0, photosWaiting = 0) => ({ status, waiting, photosWaiting, lastAt: null, notices: [] });
    const now = 10 * 60_000;
    expect(syncLine(v({ kind: 'synced', at: now - 2 * 60_000 }), now)).toBe('Synced 2 min ago');
    expect(syncLine(v({ kind: 'synced', at: now }), now)).toBe('Synced just now');
    expect(syncLine(v({ kind: 'offline' }, 2, 1), now)).toBe('Offline · 3 changes waiting');
    expect(syncLine(v({ kind: 'syncing' }), now)).toBe('Syncing…');
    expect(syncLine(v({ kind: 'signed-out' }, 1), now)).toBe('Signed out · 1 change waiting');
    expect(syncLine(v({ kind: 'no-server' }), now)).toBeNull();
  });
});

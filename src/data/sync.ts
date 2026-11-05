// Sync on the phone (SPEC v3.0 §12): pull what changed on the server, push the outbox, pull
// again; upload this phone's new photos and download other phones' thumbnails. Writes that come
// from the server run in transactions that include syncMeta, so the outbox doesn't send them back
// (outbox.ts). A record with a change waiting in the outbox keeps the phone's version until that
// change is pushed: last write wins on the server, in the order it accepts them (§12.1).
import type { Table } from 'dexie';
import { checkData } from '../domain/integrity';
import { nameKey } from '../domain/types';
import {
  PUSH_BATCH,
  SYNC_TABLES,
  TABLE_OF,
  recordId,
  recordKey,
  toWire,
  type Notice,
  type Person,
  type PulledRecord,
  type RecordType,
  type SyncTable,
} from '../domain/sync';
import { NoServerError, OfflineError, SignedOutError, type SyncApi } from '../io/sync-api';
import type { InventoryDb } from './db';
import { loadSnapshot } from './inventory';
import { nextRev, outboxKey, type OutboxRow } from './outbox';

const TABLES = Object.keys(SYNC_TABLES) as SyncTable[];
const table = (db: InventoryDb, t: SyncTable) => db.table(t) as Table<Record<string, unknown>, unknown>;
const syncedTables = (db: InventoryDb) => TABLES.map((t) => table(db, t));

// syncMeta keys. `v:<type>:<id>` holds the server time of the version this phone last pulled.
const CURSOR = 'cursor';
const JOINED = 'joined';
const LAST_SYNC = 'lastSyncAt';
const ME = 'me';
const NOTICES = 'notices';
const versionKey = (type: RecordType, id: string) => `v:${outboxKey(type, id)}`;

/** A message for the attention banner (§12.1): a refused change, a renumbered bin. */
export interface SyncNotice {
  at: number;
  text: string;
}

export function noticeText(n: Notice): string {
  if (n.kind === 'bin-code') return `${n.from} was taken by another phone, so your new bin is ${n.to}. Reprint its label.`;
  return `Couldn’t save ${n.name}: ${n.reason}. It’s back to the version on the server.`;
}

async function meta<T>(db: InventoryDb, key: string): Promise<T | undefined> {
  return (await db.syncMeta.get(key))?.value as T | undefined;
}

/** The row a pulled record becomes on this phone: items and photos keep their phone-only fields. */
function rowFor(type: RecordType, data: Record<string, unknown>, updatedAt: number, existing: Record<string, unknown> | undefined): Record<string, unknown> {
  if (type === 'item') return { ...data, updatedAt };
  if (type === 'photo') {
    const row: Record<string, unknown> = { ...data, full: existing?.full ?? null, thumb: existing?.thumb ?? null, updatedAt };
    if (existing?.taken !== undefined) row.taken = existing.taken;
    return row;
  }
  return data;
}

/**
 * Stores pulled records (§12.1). Records with a change waiting in the outbox are skipped, and so
 * keep their version number, so the push can tell the server what the phone last saw. Returns
 * how many records changed and the owners of photos that changed.
 */
export async function applyPulled(db: InventoryDb, records: readonly PulledRecord[]): Promise<{ changed: number; photoOwners: string[] }> {
  return db.transaction('rw', [...syncedTables(db), db.outbox, db.syncMeta, db.people, db.activity], async () => {
    let changed = 0;
    const owners = new Set<string>();
    const pending = new Set((await db.outbox.toCollection().primaryKeys()) as string[]);
    for (const r of records) {
      if (r.type === 'person') {
        if (r.deleted || !r.data) await db.people.delete(r.id);
        else await db.people.put(r.data as unknown as Person);
        continue;
      }
      if (r.type === 'activity') {
        if (r.deleted || !r.data) await db.activity.delete(r.id);
        else await db.activity.put(r.data as never);
        continue;
      }
      if (!Object.hasOwn(TABLE_OF, r.type) || pending.has(outboxKey(r.type, r.id))) continue;
      const t = table(db, TABLE_OF[r.type]);
      const key = recordKey(r.type, r.id);
      const existing = await t.get(key);
      if (r.type === 'photo') owners.add(String((r.data ?? existing)?.ownerId ?? ''));
      if (r.deleted || !r.data) {
        if (existing) {
          await t.delete(key);
          changed++;
        }
        await db.syncMeta.delete(versionKey(r.type, r.id));
        continue;
      }
      await t.put(rowFor(r.type, r.data, r.updatedAt, existing));
      await db.syncMeta.put({ key: versionKey(r.type, r.id), value: r.updatedAt });
      changed++;
    }
    owners.delete('');
    return { changed, photoOwners: [...owners] };
  });
}

/** Records the person adds on the phone (not just the starting lists): what "Use the server's data" would replace. */
export async function hasOwnData(db: InventoryDb): Promise<boolean> {
  for (const t of [db.items, db.areas, db.bins, db.displays, db.pictures, db.seasonRuns] as Table<unknown, unknown>[]) if ((await t.count()) > 0) return true;
  return false;
}

/** Puts every record on the phone in the outbox, and every photo on the upload list: "Upload mine" (§12.1). */
export async function enqueueAll(db: InventoryDb): Promise<number> {
  return db.transaction('rw', [...syncedTables(db), db.outbox, db.uploads, db.syncMeta], async () => {
    const rows: OutboxRow[] = [];
    for (const name of TABLES) {
      const type = SYNC_TABLES[name];
      const t = table(db, name);
      const keys = await t.toCollection().primaryKeys();
      const values = await t.toArray();
      values.forEach((v, i) => {
        const id = recordId(type, keys[i]);
        rows.push({ key: outboxKey(type, id), type, id, op: 'put', data: toWire(v), seq: nextRev(), rev: nextRev() });
      });
    }
    await db.outbox.bulkPut(rows);
    const photos = (await db.pictures.toArray()).filter((p) => p.full && !p.r2Key).map((p) => ({ id: p.id }));
    await db.uploads.bulkPut(photos);
    return rows.length;
  });
}

/**
 * Empties the phone's records, outbox and sync state, keeping `keep` (outbox keys) and their
 * changes: "Use the server's data" (keep nothing), or a cursor too old (§12.2: keep the
 * changes not yet pushed). Then a pull from 0 brings everything down.
 */
export async function clearLocal(db: InventoryDb, keepPending: boolean): Promise<void> {
  await db.transaction('rw', [...syncedTables(db), db.outbox, db.uploads, db.syncMeta, db.people, db.activity], async () => {
    const pending = keepPending ? new Set((await db.outbox.toCollection().primaryKeys()) as string[]) : new Set<string>();
    for (const name of TABLES) {
      const type = SYNC_TABLES[name];
      const t = table(db, name);
      const keys = await t.toCollection().primaryKeys();
      await t.bulkDelete(keys.filter((k) => !pending.has(outboxKey(type, recordId(type, k)))));
    }
    if (!keepPending) {
      await db.outbox.clear();
      await db.uploads.clear();
    }
    const versions = (await db.syncMeta.toCollection().primaryKeys()) as string[];
    await db.syncMeta.bulkDelete(versions.filter((k) => k.startsWith('v:')));
    await db.syncMeta.put({ key: CURSOR, value: 0 });
    await db.people.clear();
    await db.activity.clear();
  });
}

/**
 * After a pull, links to records another phone deleted are cleared, so the data stays whole
 * (backups must pass checkData, §7): an item in a deleted bin has no home yet, a deleted
 * season or display is cleared, photos, tasks and runs of deleted records go. These are
 * ordinary changes, so they sync like any other.
 */
export async function repairLinks(db: InventoryDb): Promise<number> {
  const snap = await loadSnapshot(db);
  const photos = await db.pictures.toArray();
  if (checkData({ ...snap, photos }).length === 0) return 0;
  return db.transaction('rw', [...syncedTables(db), db.settings], async () => {
    let fixed = 0;
    const has = <T extends { id: string }>(list: readonly T[]) => new Set(list.map((x) => x.id));
    const areas = has(await db.areas.toArray());
    const spots = has((await db.spots.toArray()).filter((s) => areas.has(s.areaId)));
    const bins = has(await db.bins.toArray());
    const seasons = has(await db.seasons.toArray());
    const displays = has(await db.displays.toArray());
    for (const s of await db.spots.toArray()) {
      // A spot whose area was deleted: its records lose their home below, and it goes.
      if (!areas.has(s.areaId)) {
        await db.spots.delete(s.id);
        fixed++;
      }
    }
    for (const b of await db.bins.toArray()) {
      const next = { ...b, spotId: spots.has(b.spotId) ? b.spotId : '', seasonId: seasons.has(b.seasonId) ? b.seasonId : '' };
      if (next.spotId !== b.spotId || next.seasonId !== b.seasonId) {
        await db.bins.put(next);
        fixed++;
      }
    }
    const cats = new Set((await db.categoryList.toArray()).map((c) => `${c.part}\n${nameKey(c.name)}`));
    for (const i of await db.items.toArray()) {
      const next = {
        ...i,
        binId: bins.has(i.binId) ? i.binId : '',
        spotId: spots.has(i.spotId) ? i.spotId : '',
        seasonId: seasons.has(i.seasonId) ? i.seasonId : '',
        displayId: displays.has(i.displayId) ? i.displayId : '',
        outDisplayId: displays.has(i.outDisplayId) ? i.outDisplayId : '',
      };
      if (JSON.stringify(next) !== JSON.stringify(i)) {
        await db.items.put(next);
        fixed++;
      }
      const cat = `${i.part}\n${nameKey(i.category)}`;
      if (!cats.has(cat)) {
        cats.add(cat);
        const order = await db.categoryList.where('part').equals(i.part).count();
        await db.categoryList.put({ part: i.part, name: i.category, order, subcategories: [] });
        fixed++;
      }
    }
    const tasks = await db.seasonTasks.toArray();
    for (const t of tasks) {
      if (!seasons.has(t.seasonId)) {
        await db.seasonTasks.delete(t.id);
        fixed++;
      }
    }
    for (const r of await db.seasonRuns.toArray()) {
      if (!seasons.has(r.seasonId)) {
        await db.seasonRuns.delete(r.id);
        fixed++;
        continue;
      }
      const done = r.doneTaskIds.filter((id) => tasks.some((t) => t.id === id && t.seasonId === r.seasonId));
      if (done.length !== r.doneTaskIds.length) {
        await db.seasonRuns.put({ ...r, doneTaskIds: done });
        fixed++;
      }
    }
    const owners: Record<string, Set<string>> = { item: has(await db.items.toArray()), bin: bins, spot: spots, season: seasons, display: displays };
    for (const p of photos) {
      if (!owners[p.ownerType]?.has(p.ownerId)) {
        await db.pictures.delete(p.id);
        fixed++;
      } else if (p.seasonId && !seasons.has(p.seasonId)) {
        await db.pictures.update(p.id, { seasonId: undefined });
        fixed++;
      }
    }
    if (fixed) await db.settings.put({ key: 'lastChangeAt', value: Date.now() });
    return fixed;
  });
}

/** Sends up to PUSH_BATCH outbox changes. Returns how many were sent (0: nothing waiting). */
export async function pushOnce(db: InventoryDb, api: SyncApi): Promise<number> {
  const rows = await db.outbox.orderBy('seq').limit(PUSH_BATCH).toArray();
  if (rows.length === 0) return 0;
  const versions = await db.syncMeta.bulkGet(rows.map((r) => versionKey(r.type, r.id)));
  const res = await api.push(rows.map((r, i) => ({ type: r.type, id: r.id, op: r.op, ...(r.data && { data: r.data }), base: (versions[i]?.value as number | undefined) ?? null })));
  await db.transaction('rw', [...syncedTables(db), db.outbox, db.syncMeta], async () => {
    // A change made while the push was on its way stays, to go next time.
    const now = await db.outbox.bulkGet(rows.map((r) => r.key));
    await db.outbox.bulkDelete(rows.filter((r, i) => now[i]?.rev === r.rev).map((r) => r.key));
    for (const rej of res.rejected) {
      if (!Object.hasOwn(TABLE_OF, rej.type) || (await db.outbox.get(outboxKey(rej.type, rej.id)))) continue;
      const t = table(db, TABLE_OF[rej.type]);
      const key = recordKey(rej.type, rej.id);
      if (rej.current) await t.put(rowFor(rej.type, rej.current, Date.now(), await t.get(key)));
      else await t.delete(key);
    }
    if (res.notices.length) {
      const list = (await meta<SyncNotice[]>(db, NOTICES)) ?? [];
      await db.syncMeta.put({ key: NOTICES, value: [...list, ...res.notices.map((n) => ({ at: Date.now(), text: noticeText(n) }))] });
    }
  });
  return rows.length;
}

/** Uploads waiting photos (§12.3): the image, then its thumbnail. Stops at one whose record isn't on the server yet. */
export async function uploadPhotos(db: InventoryDb, api: SyncApi, limit = 5): Promise<number> {
  let done = 0;
  for (const { id } of await db.uploads.limit(limit).toArray()) {
    const p = await db.pictures.get(id);
    if (p?.full) {
      if ((await api.upload(id, p.full, false)) === 'later') break;
      if (p.thumb) await api.upload(id, p.thumb, true);
      done++;
    }
    await db.uploads.delete(id);
  }
  return done;
}

/** Stores a downloaded image without sending it back: thumb, or the full image. */
async function storeImage(db: InventoryDb, id: string, image: Blob, field: 'thumb' | 'full'): Promise<string | null> {
  return db.transaction('rw', db.pictures, db.syncMeta, async () => {
    const p = await db.pictures.get(id);
    if (!p) return null;
    await db.pictures.put({ ...p, [field]: image });
    return p.ownerId;
  });
}

/** Other phones' photos: their thumbnails (or images, if no thumbnail was uploaded). Returns the owners that got one. */
export async function downloadThumbnails(db: InventoryDb, api: SyncApi, limit = 20): Promise<string[]> {
  const want = (await db.pictures.filter((p) => !p.thumb && !p.full && !!p.r2Key).limit(limit).toArray()).map((p) => p.id);
  const owners: string[] = [];
  for (const id of want) {
    const thumb = await api.download(id, true);
    const image = thumb ?? (await api.download(id, false));
    if (!image) continue;
    const owner = await storeImage(db, id, image, thumb ? 'thumb' : 'full');
    if (owner) owners.push(owner);
  }
  return owners;
}

/** A photo's full image, downloaded when it's opened (§12.3) and kept. */
export async function fetchFullImage(db: InventoryDb, api: SyncApi, id: string): Promise<Blob | null> {
  const p = await db.pictures.get(id);
  if (p?.full) return p.full;
  if (!p?.r2Key) return null;
  const image = await api.download(id, false);
  if (image) await storeImage(db, id, image, 'full');
  return image;
}

export type SyncStatus =
  /** Not checked yet. */
  | { kind: 'starting' }
  /** This copy has no server (GitHub Pages): sync is off. */
  | { kind: 'no-server' }
  | { kind: 'signed-out' }
  | { kind: 'offline' }
  | { kind: 'syncing' }
  | { kind: 'synced'; at: number }
  | { kind: 'error'; message: string }
  /**
   * First sync of a phone that has its own records while the server has others (§12.1): the
   * person chooses. (When the server is empty, the phone's records are uploaded.)
   */
  | { kind: 'choose' };

/** Pull every page after the cursor. Returns how many records changed and the photo owners touched. */
async function pullAll(db: InventoryDb, api: SyncApi, onProgress?: (n: number) => void): Promise<{ changed: number; photoOwners: string[] }> {
  let cursor = (await meta<number>(db, CURSOR)) ?? 0;
  let changed = 0;
  let got = 0;
  const owners = new Set<string>();
  for (;;) {
    const res = await api.pull(cursor);
    if (res.reset) {
      await clearLocal(db, true);
      cursor = 0;
      continue;
    }
    const r = await applyPulled(db, res.records);
    changed += r.changed;
    got += res.records.length;
    for (const o of r.photoOwners) owners.add(o);
    cursor = res.cursor;
    await db.syncMeta.bulkPut([
      { key: CURSOR, value: cursor },
      { key: ME, value: res.me },
    ]);
    onProgress?.(got);
    if (!res.more) return { changed, photoOwners: [...owners] };
  }
}

export interface SyncDeps {
  /** Photos of these owners changed (thumbnails to reload). */
  onPhotos?: (ownerIds: string[]) => void;
  /** Records downloaded so far in this sync (the first download's progress, §12.5). */
  onProgress?: (n: number) => void;
}

/**
 * One sync (§12.1): pull, push everything, pull again, then photos. The first sync on a phone
 * joins it to the server: an empty server gets this phone's records; a phone with only the
 * starting lists takes the server's; otherwise the person chooses (status 'choose').
 */
export async function syncOnce(db: InventoryDb, api: SyncApi, deps: SyncDeps = {}): Promise<SyncStatus> {
  try {
    if (!(await meta<boolean>(db, JOINED))) {
      const first = await api.pull(0);
      if (first.serverEmpty) {
        await enqueueAll(db);
      } else if (await hasOwnData(db)) {
        return { kind: 'choose' };
      } else {
        await clearLocal(db, false);
      }
      await db.syncMeta.put({ key: JOINED, value: true });
    }
    let { changed, photoOwners } = await pullAll(db, api, deps.onProgress);
    let pushed = 0;
    for (let n = await pushOnce(db, api); n > 0; n = await pushOnce(db, api)) pushed += n;
    if (pushed) {
      const again = await pullAll(db, api);
      changed += again.changed;
      photoOwners = [...photoOwners, ...again.photoOwners];
    }
    if (changed && (await repairLinks(db))) while ((await pushOnce(db, api)) > 0);
    while ((await uploadPhotos(db, api)) > 0);
    photoOwners = [...photoOwners, ...(await downloadThumbnails(db, api))];
    if (photoOwners.length) deps.onPhotos?.([...new Set(photoOwners)]);
    const at = Date.now();
    await db.syncMeta.put({ key: LAST_SYNC, value: at });
    return { kind: 'synced', at };
  } catch (e) {
    if (e instanceof NoServerError) return { kind: 'no-server' };
    if (e instanceof SignedOutError) return { kind: 'signed-out' };
    if (e instanceof OfflineError) return { kind: 'offline' };
    return { kind: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * The person's answer to 'choose' (§12.1): "Use the server's data" replaces the phone's records
 * (the screen offers a backup first). "Upload mine" is only offered on an empty server, which
 * syncOnce does by itself.
 */
export async function useServerData(db: InventoryDb): Promise<void> {
  await clearLocal(db, false);
  await db.syncMeta.put({ key: JOINED, value: true });
}

export async function lastSyncAt(db: InventoryDb): Promise<number | null> {
  return (await meta<number>(db, LAST_SYNC)) ?? null;
}

export async function signedInPerson(db: InventoryDb): Promise<Person | null> {
  return (await meta<Person>(db, ME)) ?? null;
}

export async function loadNotices(db: InventoryDb): Promise<SyncNotice[]> {
  return (await meta<SyncNotice[]>(db, NOTICES)) ?? [];
}

export async function dismissNotices(db: InventoryDb): Promise<void> {
  await db.syncMeta.delete(NOTICES);
}

/** Changes your own name (More, §3), online only; stored like a pulled record. */
export async function renameMe(db: InventoryDb, api: SyncApi, name: string): Promise<Person> {
  const me = await api.rename(name);
  await db.transaction('rw', db.people, db.syncMeta, async () => {
    await db.people.put(me);
    await db.syncMeta.put({ key: ME, value: me });
  });
  return me;
}

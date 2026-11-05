// The outbox (SPEC v3.0 §12.1): every change to a synced table is recorded, in the same
// transaction, as the record's new version (or its delete), to be pushed to the server. Done as a
// Dexie middleware, so the many writes in src/data stay as they are. Only the latest change per
// record is kept, at the place in the queue of its first one. New photos taken or restored on
// this phone also go on the upload list (§12.3).
//
// Writes that come from the server (a pull) aren't changes to send back: they run in a
// transaction that includes the syncMeta table, and only the sync code (sync.ts) does that.
// Upgrades (versionchange transactions) aren't recorded either.
import type { DBCore, DBCoreTable, DBCoreTransaction, Middleware } from 'dexie';
import { SYNC_TABLES, recordId, toWire, type RecordType, type SyncTable } from '../domain/sync';

export const OUTBOX = 'outbox';
export const UPLOADS = 'uploads';
export const SYNC_META = 'syncMeta';

/** One record's change waiting to be pushed. */
export interface OutboxRow {
  /** "item:it-ABCDEFGH". */
  key: string;
  type: RecordType;
  id: string;
  op: 'put' | 'delete';
  /** The record as it travels (toWire); absent for a delete. */
  data?: Record<string, unknown>;
  /** Queue position: when this record was first changed since its last push. */
  seq: number;
  /** Changes on every write, so a push only clears the version it sent. */
  rev: number;
}

/** A photo whose image this phone has and the server may not (§12.3). */
export interface UploadRow {
  id: string;
}

export const outboxKey = (type: RecordType, id: string) => `${type}:${id}`;

let tick = 0;
/** Increasing numbers, also across reloads (time-based). */
export function nextRev(): number {
  tick = (tick + 1) % 1000;
  return Date.now() * 1000 + tick;
}

const isSynced = (name: string): name is SyncTable => Object.hasOwn(SYNC_TABLES, name);

interface Entry {
  op: 'put' | 'delete';
  key: unknown;
  value?: Record<string, unknown>;
}

async function record(core: DBCore, trans: DBCoreTransaction, type: RecordType, entries: Entry[]): Promise<void> {
  if (entries.length === 0) return;
  // The last change to a record in this write wins.
  const latest = new Map<string, Entry>();
  for (const e of entries) latest.set(recordId(type, e.key), e);
  const ids = [...latest.keys()];
  const keys = ids.map((id) => outboxKey(type, id));
  const outbox = core.table(OUTBOX);
  const existing = (await outbox.getMany({ trans, keys })) as (OutboxRow | undefined)[];
  const rows: OutboxRow[] = ids.map((id, i) => {
    const e = latest.get(id)!;
    const row: OutboxRow = { key: keys[i]!, type, id, op: e.op, seq: existing[i]?.seq ?? nextRev(), rev: nextRev() };
    if (e.op === 'put') row.data = toWire(e.value!);
    return row;
  });
  await outbox.mutate({ type: 'put', trans, values: rows, keys });
  if (type !== 'photo') return;
  const uploads = core.table(UPLOADS);
  const toUpload = ids.filter((id) => {
    const v = latest.get(id)!.value;
    return v && v.full instanceof Blob && !v.r2Key;
  });
  const gone = ids.filter((id) => latest.get(id)!.op === 'delete');
  if (toUpload.length) await uploads.mutate({ type: 'put', trans, values: toUpload.map((id) => ({ id })), keys: toUpload });
  if (gone.length) await uploads.mutate({ type: 'delete', trans, keys: gone });
}

export const outboxMiddleware: Middleware<DBCore> = {
  stack: 'dbcore',
  name: 'Outbox',
  create(down) {
    const capturing = new WeakSet<DBCoreTransaction>();
    const hasOutbox = down.schema.tables.some((t) => t.name === OUTBOX);
    return {
      ...down,
      transaction(stores, mode, options) {
        if (hasOutbox && mode === 'readwrite' && stores.some(isSynced) && !stores.includes(SYNC_META)) {
          const trans = down.transaction([...new Set([...stores, OUTBOX, UPLOADS])], mode, options);
          capturing.add(trans);
          return trans;
        }
        return down.transaction(stores, mode, options);
      },
      table(name) {
        const table = down.table(name);
        if (!isSynced(name)) return table;
        const type = SYNC_TABLES[name];
        const pk = table.schema.primaryKey;
        const wrapped: DBCoreTable = {
          ...table,
          async mutate(req) {
            if (!capturing.has(req.trans)) return table.mutate(req);
            // A clear() names no keys: find them first.
            const cleared =
              req.type === 'deleteRange' ? (await table.query({ trans: req.trans, values: false, query: { index: pk, range: req.range } })).result : [];
            const res = await table.mutate(req);
            const entries: Entry[] = [];
            if (req.type === 'add' || req.type === 'put') {
              req.values.forEach((value: Record<string, unknown>, i) => {
                if (res.failures[i]) return;
                entries.push({ op: 'put', key: req.keys?.[i] ?? pk.extractKey!(value), value });
              });
            } else {
              for (const key of req.type === 'delete' ? req.keys : cleared) entries.push({ op: 'delete', key });
            }
            await record(down, req.trans, type, entries);
            return res;
          },
        };
        return wrapped;
      },
    };
  },
};

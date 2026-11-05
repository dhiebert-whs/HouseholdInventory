// The server's copy of the household (SPEC v3.0 §12): every record of both parts in one D1 table,
// as JSON, with the time and person of its last change and a sequence number. A phone pulls
// everything with a sequence number above its cursor, so nothing is missed even when two
// changes land in the same millisecond. Deletes are tombstones, purged after 90 days (§12.2).
// The schema is made on first use, so a new database needs no migration step.
import { ID_ALPHABET } from '../src/domain/ids';
import { nextBinCode, splitBinCode } from '../src/domain/places';
import {
  ACTIVITY_DAYS,
  PULL_PAGE,
  PUSH_BATCH,
  TOMBSTONE_DAYS,
  isRecordType,
  mergeDoneTasks,
  recordName,
  recordProblem,
  type Activity,
  type Change,
  type Notice,
  type Person,
  type PulledRecord,
  type PullResponse,
  type PushResponse,
  type RecordType,
  type ServerType,
} from '../src/domain/sync';
import type { D1Database, D1Stmt } from './bindings';
import { BULK_LINES, bulkSummary, describe, type Described, type Lookup } from './activity';

type Data = Record<string, unknown>;
const DAY = 86_400_000;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS records (
    type TEXT NOT NULL,
    id TEXT NOT NULL,
    data TEXT,
    updated_at INTEGER NOT NULL,
    updated_by TEXT NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0,
    seq INTEGER NOT NULL,
    PRIMARY KEY (type, id)
  )`,
  `CREATE INDEX IF NOT EXISTS records_seq ON records (seq)`,
  `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value INTEGER NOT NULL)`,
  // seq: the last sequence number given out. purged: the highest one of a purged tombstone.
  `INSERT OR IGNORE INTO meta (key, value) VALUES ('seq', 0), ('purged', 0)`,
];

const ready = new WeakMap<D1Database, Promise<void>>();

/** Makes the tables once per database per Worker instance. */
export function ensureSchema(db: D1Database): Promise<void> {
  let p = ready.get(db);
  if (!p) {
    p = db.batch(SCHEMA.map((sql) => db.prepare(sql))).then(() => undefined);
    p.catch(() => ready.delete(db));
    ready.set(db, p);
  }
  return p;
}

interface Row {
  type: ServerType;
  id: string;
  data: string | null;
  updated_at: number;
  updated_by: string;
  deleted: number;
  seq: number;
}

const parse = (s: string | null): Data | null => (s === null ? null : (JSON.parse(s) as Data));

async function getRow(db: D1Database, type: ServerType, id: string): Promise<Row | null> {
  return db.prepare('SELECT * FROM records WHERE type = ?1 AND id = ?2').bind(type, id).first<Row>();
}

/** The statements that store one record under the next sequence number. */
function write(db: D1Database, type: ServerType, id: string, data: Data | null, at: number, by: string, deleted = false): D1Stmt[] {
  return [
    db.prepare(`UPDATE meta SET value = value + 1 WHERE key = 'seq'`),
    db
      .prepare(
        `INSERT INTO records (type, id, data, updated_at, updated_by, deleted, seq)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, (SELECT value FROM meta WHERE key = 'seq'))
         ON CONFLICT (type, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at,
           updated_by = excluded.updated_by, deleted = excluded.deleted, seq = excluded.seq`,
      )
      .bind(type, id, data === null ? null : JSON.stringify(data), at, by, deleted ? 1 : 0),
  ];
}

function randomId(prefix: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return prefix + [...bytes].map((b) => ID_ALPHABET[b % ID_ALPHABET.length]).join('');
}

/** "dan.hiebert@…" → "Dan". */
export function nameFromEmail(email: string): string {
  const first = email.split('@')[0]!.split(/[._+-]/)[0] ?? '';
  return first ? first[0]!.toUpperCase() + first.slice(1) : email;
}

async function people(db: D1Database): Promise<Person[]> {
  const { results } = await db.prepare(`SELECT data FROM records WHERE type = 'person' AND deleted = 0`).all<{ data: string }>();
  return results.map((r) => JSON.parse(r.data) as Person);
}

/** The Person for a signed-in email, made on first sign-in (§12.4). */
export async function personFor(db: D1Database, email: string, now = Date.now()): Promise<Person> {
  const key = email.toLowerCase();
  const found = (await people(db)).find((p) => p.email === key);
  if (found) return found;
  const person: Person = { id: randomId('pp-'), name: nameFromEmail(key), email: key };
  await db.batch(write(db, 'person', person.id, { ...person }, now, person.id));
  return person;
}

/** Changes a person's own name (More, §3). */
export async function renamePerson(db: D1Database, me: Person, name: string, now = Date.now()): Promise<Person> {
  const person = { ...me, name: name.trim().slice(0, 40) || me.name };
  await db.batch(write(db, 'person', me.id, { ...person }, now, me.id));
  return person;
}

async function meta(db: D1Database, key: 'seq' | 'purged'): Promise<number> {
  return (await db.prepare('SELECT value FROM meta WHERE key = ?1').bind(key).first<number>('value')) ?? 0;
}

async function serverEmpty(db: D1Database): Promise<boolean> {
  return (await db.prepare(`SELECT 1 AS x FROM records WHERE deleted = 0 AND type NOT IN ('person', 'activity') LIMIT 1`).first()) === null;
}

/**
 * Everything changed after `since` (§12.1, pull), a page at a time. From 0 (a new phone, or a
 * reset) deleted records are left out. A cursor older than purged deletes gets `reset`.
 */
export async function pull(db: D1Database, since: number, me: Person, limit = PULL_PAGE): Promise<PullResponse> {
  const empty = await serverEmpty(db);
  if (since > 0 && since < (await meta(db, 'purged'))) return { records: [], cursor: 0, more: false, reset: true, serverEmpty: empty, me };
  const sql = since === 0 ? 'SELECT * FROM records WHERE deleted = 0 ORDER BY seq LIMIT ?1' : 'SELECT * FROM records WHERE seq > ?2 ORDER BY seq LIMIT ?1';
  const stmt = since === 0 ? db.prepare(sql).bind(limit) : db.prepare(sql).bind(limit, since);
  const { results } = await stmt.all<Row>();
  const records: PulledRecord[] = results.map((r) => ({ type: r.type, id: r.id, data: r.deleted ? null : parse(r.data), updatedAt: r.updated_at, updatedBy: r.updated_by, deleted: r.deleted === 1 }));
  const cursor = results.length ? results[results.length - 1]!.seq : since === 0 ? 0 : since;
  return { records, cursor, more: results.length === limit, reset: false, serverEmpty: empty, me };
}

/** A link to a record of the other part (§3: nothing links across parts). */
async function linkProblem(type: RecordType, data: Data, look: Lookup): Promise<string | null> {
  const spotPart = async (spotId: string) => {
    const spot = await look('spot', spotId);
    return spot ? ((await look('area', String(spot.areaId)))?.part ?? null) : null;
  };
  if (type === 'item') {
    const binPart = data.binId ? ((await look('bin', String(data.binId)))?.part ?? null) : null;
    if (binPart && binPart !== data.part) return 'its bin is in the other part';
    const sp = data.spotId ? await spotPart(String(data.spotId)) : null;
    if (sp && sp !== data.part) return 'its spot is in the other part';
  }
  if (type === 'bin' && data.spotId) {
    const sp = await spotPart(String(data.spotId));
    if (sp && sp !== data.part) return 'its spot is in the other part';
  }
  return null;
}

/** Photo fields only the server sets (on upload), kept when a phone sends the record without them. */
const FILE_FIELDS = ['r2Key', 'contentType', 'bytes'];

/**
 * Stores a phone's changes in order (§12.1, push): checks each, gives it the server's time and
 * the person, and logs it. Last write wins; a change that replaced someone else's newer one is
 * noted in the log. A clashing new bin code gets the next free number.
 */
export async function push(db: D1Database, changes: readonly Change[], me: Person, now = Date.now()): Promise<PushResponse> {
  const out: PushResponse = { accepted: [], rejected: [], notices: [] };
  const cache = new Map<string, Data | null>();
  const look: Lookup = async (type, id) => {
    const k = `${type}:${id}`;
    if (!cache.has(k)) {
      const r = await getRow(db, type, id);
      cache.set(k, r && !r.deleted ? parse(r.data) : null);
    }
    return cache.get(k) ?? null;
  };
  const lines: { type: RecordType; id: string; d: Described; overwrote?: Activity['overwrote'] }[] = [];

  for (const c of changes.slice(0, PUSH_BATCH)) {
    if (!isRecordType(c.type) || typeof c.id !== 'string' || (c.op !== 'put' && c.op !== 'delete')) {
      out.rejected.push({ type: c.type, id: String(c.id), reason: 'the app sent a change the server doesn’t know', current: null });
      continue;
    }
    const row = await getRow(db, c.type, c.id);
    const before = row && !row.deleted ? parse(row.data) : null;
    const overwrote = row && !row.deleted && row.updated_by !== me.id && (c.base === null || row.updated_at > c.base) ? { personId: row.updated_by, at: row.updated_at } : undefined;

    if (c.op === 'delete') {
      if (before) {
        await db.batch(write(db, c.type, c.id, before, now, me.id, true));
        const d = await describe(c.type, before, null, look);
        if (d) lines.push({ type: c.type, id: c.id, d, overwrote });
      }
      cache.set(`${c.type}:${c.id}`, null);
      out.accepted.push({ type: c.type, id: c.id, updatedAt: now });
      continue;
    }

    let data = c.data ?? null;
    const problem = recordProblem(c.type, c.id, data) ?? (await linkProblem(c.type, data!, look));
    if (problem) {
      out.rejected.push({ type: c.type, id: c.id, reason: problem, current: before });
      out.notices.push({ kind: 'refused', type: c.type, id: c.id, name: recordName(c.type, data ?? before), reason: problem });
      continue;
    }
    data = { ...data! };
    if (c.type === 'photo' && before) for (const f of FILE_FIELDS) if (data[f] === undefined && before[f] !== undefined) data[f] = before[f];
    if (c.type === 'run' && overwrote && before) data.doneTaskIds = mergeDoneTasks(before.doneTaskIds as unknown[], data.doneTaskIds as unknown[]);
    if (c.type === 'bin') {
      const code = String(data.code);
      const clash = await db.prepare(`SELECT id FROM records WHERE type = 'bin' AND deleted = 0 AND id != ?1 AND json_extract(data, '$.code') = ?2`).bind(c.id, code).first();
      if (clash) {
        // Deleted bins' codes count too, so a printed label never points at a new bin (D4).
        const { results } = await db.prepare(`SELECT json_extract(data, '$.code') AS code FROM records WHERE type = 'bin'`).all<{ code: string }>();
        const to = nextBinCode(splitBinCode(code)?.area ?? code.split('-')[0]!, results.map((r) => r.code));
        data = { ...data, code: to, labelPrintedAt: null, labelContents: null };
        out.notices.push({ kind: 'bin-code', id: c.id, from: code, to });
      }
    }
    await db.batch(write(db, c.type, c.id, data, now, me.id));
    const d = await describe(c.type, before, data, look);
    cache.set(`${c.type}:${c.id}`, data);
    if (d) lines.push({ type: c.type, id: c.id, d, overwrote });
    out.accepted.push({ type: c.type, id: c.id, updatedAt: now });
  }

  // The activity log (F17): a line per change, or one line for a big batch (a restore, a bulk move).
  const entries: Activity[] =
    lines.length > BULK_LINES
      ? [{ id: randomId('ac-'), at: now, personId: me.id, summary: bulkSummary(lines.map((l) => l.type)), recordType: lines[0]!.type, recordId: '', part: lines.every((l) => l.d.part === lines[0]!.d.part) ? lines[0]!.d.part : '', areaId: '', seasonId: '' }]
      : lines.map((l) => {
          const a: Activity = { id: randomId('ac-'), at: now, personId: me.id, summary: l.d.summary, recordType: l.type, recordId: l.id, part: l.d.part, areaId: l.d.areaId, seasonId: l.d.seasonId };
          if (l.overwrote) a.overwrote = l.overwrote;
          return a;
        });
  if (entries.length) await db.batch(entries.flatMap((a) => write(db, 'activity', a.id, { ...a }, now, me.id)));
  return out;
}

/** After an upload, the photo record says where its image is, so other phones can fetch it (§12.3). */
export async function recordUpload(db: D1Database, photoId: string, file: { r2Key: string; contentType: string; bytes: number }, me: Person, now = Date.now()): Promise<boolean> {
  const row = await getRow(db, 'photo', photoId);
  if (!row || row.deleted) return false;
  const data = { ...parse(row.data), ...file };
  await db.batch(write(db, 'photo', photoId, data, now, me.id));
  return true;
}

export async function photoExists(db: D1Database, photoId: string): Promise<boolean> {
  const row = await getRow(db, 'photo', photoId);
  return !!row && !row.deleted;
}

/**
 * Daily clean-up (§12.2, D6, D8): tombstones older than 90 days go, with their photos' files,
 * and activity older than two years. Returns the photo ids whose files to delete.
 */
export async function purge(db: D1Database, now = Date.now()): Promise<string[]> {
  const cut = now - TOMBSTONE_DAYS * DAY;
  const { results } = await db.prepare('SELECT type, id, seq FROM records WHERE deleted = 1 AND updated_at < ?1').bind(cut).all<Pick<Row, 'type' | 'id' | 'seq'>>();
  const maxSeq = results.reduce((m, r) => Math.max(m, r.seq), 0);
  await db.batch([
    db.prepare('DELETE FROM records WHERE deleted = 1 AND updated_at < ?1').bind(cut),
    db.prepare(`UPDATE meta SET value = MAX(value, ?1) WHERE key = 'purged'`).bind(maxSeq),
    db.prepare(`DELETE FROM records WHERE type = 'activity' AND updated_at < ?1`).bind(now - ACTIVITY_DAYS * DAY),
  ]);
  return results.filter((r) => r.type === 'photo').map((r) => r.id);
}

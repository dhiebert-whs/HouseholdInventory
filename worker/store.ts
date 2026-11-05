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
  categoryIdOf,
  isRecordType,
  mergeDoneTasks,
  recordName,
  recordProblem,
  withoutGone,
  type Activity,
  type Change,
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

/** A new person's id, from their email: two first requests at once make the same person, not two. */
async function personId(email: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email)));
  return 'pp-' + [...bytes.slice(0, 10)].map((b) => ID_ALPHABET[b % ID_ALPHABET.length]).join('');
}

/** The Person for a signed-in email, made on first sign-in (§12.4). */
export async function personFor(db: D1Database, email: string, now = Date.now()): Promise<Person> {
  const key = email.toLowerCase();
  const found = (await people(db)).find((p) => p.email === key);
  if (found) return found;
  const person: Person = { id: await personId(key), name: nameFromEmail(key), email: key };
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

/** A record as a push sees it: the server's version, then this push's changes to it. */
interface Rec {
  data: Data | null;
  deleted: boolean;
  updatedAt: number;
  updatedBy: string;
}

const COLUMNS = 'type, id, data, updated_at, updated_by, deleted';
const recOf = (r: Omit<Row, 'seq'>): Rec => ({ data: parse(r.data), deleted: r.deleted === 1, updatedAt: r.updated_at, updatedBy: r.updated_by });
const s = (v: unknown) => (typeof v === 'string' ? v : '');

/** The records a record links to, by type and id. */
function linksOf(type: ServerType, data: Data): [RecordType, string][] {
  const out: [RecordType, string][] = [];
  const add = (t: RecordType, v: unknown) => {
    if (s(v)) out.push([t, s(v)]);
  };
  switch (type) {
    case 'item':
      add('bin', data.binId);
      add('spot', data.spotId);
      add('season', data.seasonId);
      add('display', data.displayId);
      add('display', data.outDisplayId);
      add('category', categoryIdOf(data));
      break;
    case 'bin':
      add('spot', data.spotId);
      add('season', data.seasonId);
      break;
    case 'spot':
      add('area', data.areaId);
      break;
    case 'photo':
      if (isRecordType(data.ownerType)) add(data.ownerType, data.ownerId);
      add('season', data.seasonId);
      break;
    case 'task':
      add('season', data.seasonId);
      break;
    case 'run':
      add('season', data.seasonId);
      if (Array.isArray(data.doneTaskIds)) for (const t of data.doneTaskIds) add('task', t);
      break;
  }
  return out;
}

/**
 * What a push reads, in a few queries: D1's free plan allows 50 a request, and a push of 50
 * changes read one record at a time would need well over that. Records come in rounds (the
 * changed records and what they link to, then what those link to…), one query a round.
 */
class View {
  private readonly recs = new Map<string, Rec | null>();
  constructor(private readonly db: D1Database) {}

  async load(keys: readonly [ServerType, string][]): Promise<void> {
    const want = [...new Map(keys.filter(([t, i]) => !this.recs.has(`${t}:${i}`)).map((k) => [`${k[0]}:${k[1]}`, k] as const)).values()];
    if (want.length === 0) return;
    const { results } = await this.db
      .prepare(`SELECT ${COLUMNS} FROM records WHERE (type, id) IN (SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]') FROM json_each(?1))`)
      .bind(JSON.stringify(want))
      .all<Row>();
    for (const [t, i] of want) this.recs.set(`${t}:${i}`, null);
    for (const r of results) this.recs.set(`${r.type}:${r.id}`, recOf(r));
  }

  /** Loads what these records link to, and what that links to, a few levels down (a photo's item's bin's spot's area). */
  async loadLinks(records: readonly { type: ServerType; data: Data | null }[]): Promise<void> {
    let next = records.flatMap((r) => (r.data ? linksOf(r.type, r.data) : []));
    for (let round = 0; round < 4 && next.length; round++) {
      const keys = next;
      await this.load(keys);
      next = keys.flatMap(([t, i]) => {
        const d = this.live(t, i);
        return d ? linksOf(t, d) : [];
      });
    }
  }

  get(type: ServerType, id: string): Rec | null {
    return this.recs.get(`${type}:${id}`) ?? null;
  }
  live(type: ServerType, id: string): Data | null {
    const r = this.get(type, id);
    return r && !r.deleted ? r.data : null;
  }
  set(type: ServerType, id: string, rec: Rec): void {
    this.recs.set(`${type}:${id}`, rec);
  }
  /** The live records this push has read or written. */
  liveRecords(): { type: RecordType; id: string; rec: Rec }[] {
    const out: { type: RecordType; id: string; rec: Rec }[] = [];
    for (const [k, rec] of this.recs) {
      const at = k.indexOf(':');
      const type = k.slice(0, at);
      if (rec && !rec.deleted && rec.data && isRecordType(type)) out.push({ type, id: k.slice(at + 1), rec });
    }
    return out;
  }
}

/** A link to a record of the other part (§3: nothing links across parts). */
function linkProblem(type: RecordType, data: Data, view: View): string | null {
  const spotPart = (spotId: string) => {
    const spot = view.live('spot', spotId);
    return spot ? (view.live('area', s(spot.areaId))?.part ?? null) : null;
  };
  if (type === 'item') {
    const binPart = data.binId ? (view.live('bin', s(data.binId))?.part ?? null) : null;
    if (binPart && binPart !== data.part) return 'its bin is in the other part';
    const sp = data.spotId ? spotPart(s(data.spotId)) : null;
    if (sp && sp !== data.part) return 'its spot is in the other part';
  }
  if (type === 'bin' && data.spotId) {
    const sp = spotPart(s(data.spotId));
    if (sp && sp !== data.part) return 'its spot is in the other part';
  }
  return null;
}

/** Why a record can't be kept when what it belongs to was deleted (withoutGone's 'drop'). */
const DROPPED: Partial<Record<RecordType, string>> = {
  spot: 'its area was deleted on another phone',
  photo: 'what it belongs to was deleted on another phone',
  task: 'its season was deleted on another phone',
  run: 'its season was deleted on another phone',
};

/** Photo fields only the server sets (on upload), kept when a phone sends the record without them. */
const FILE_FIELDS = ['r2Key', 'contentType', 'bytes'];

/** Live records on the server that link to any of these ids (records, or categories as "part:name"). */
async function linkedTo(db: D1Database, ids: readonly string[]): Promise<{ type: RecordType; id: string; rec: Rec }[]> {
  const anyOf = `IN (SELECT value FROM json_each(?1))`;
  const fields = ['binId', 'spotId', 'seasonId', 'displayId', 'outDisplayId', 'areaId', 'ownerId'].map((f) => `json_extract(data, '$.${f}') ${anyOf}`);
  const { results } = await db
    .prepare(
      `SELECT ${COLUMNS} FROM records WHERE deleted = 0 AND type IN ('item', 'bin', 'spot', 'photo', 'task', 'run') AND (
        ${fields.join(' OR ')}
        OR (type = 'item' AND json_extract(data, '$.part') || ':' || json_extract(data, '$.category') ${anyOf})
        OR (type = 'run' AND EXISTS (SELECT 1 FROM json_each(data, '$.doneTaskIds') AS t WHERE t.value ${anyOf})))`,
    )
    .bind(JSON.stringify(ids))
    .all<Row>();
  return results.flatMap((r) => (isRecordType(r.type) ? [{ type: r.type, id: r.id, rec: recOf(r) }] : []));
}

/**
 * Stores a phone's changes in order (§12.1, push): checks each, gives it the server's time and
 * the person, and logs it. Last write wins; a change that replaced someone else's newer one is
 * noted in the log. A clashing new bin code gets the next free number. Links to deleted records
 * are cleared (§12.2); when the changes come in pushRank order (`ordered`), so is whatever else still
 * links to a record this push deletes. Everything is written in one batch: all or nothing.
 */
export async function push(db: D1Database, changes: readonly Change[], me: Person, now = Date.now(), ordered = false): Promise<PushResponse> {
  const out: PushResponse = { accepted: [], rejected: [], notices: [] };
  const list = changes.slice(0, PUSH_BATCH);
  const known = list.filter((c) => isRecordType(c.type) && typeof c.id === 'string' && (c.op === 'put' || c.op === 'delete'));
  const view = new View(db);
  await view.load(known.map((c) => [c.type, c.id]));
  await view.loadLinks(known.flatMap((c) => [{ type: c.type, data: c.data ?? null }, { type: c.type, data: view.live(c.type, c.id) }]));
  // Every bin code ever used, deleted bins' too, so a printed label never points at a new bin (D4).
  const bins = known.some((c) => c.type === 'bin' && c.op === 'put')
    ? (await db.prepare(`SELECT id, json_extract(data, '$.code') AS code, deleted FROM records WHERE type = 'bin'`).all<{ id: string; code: string; deleted: number }>()).results
    : [];

  const stmts: D1Stmt[] = [];
  const store = (type: ServerType, id: string, data: Data | null, deleted = false) => {
    stmts.push(...write(db, type, id, data, now, me.id, deleted));
    view.set(type, id, { data, deleted, updatedAt: now, updatedBy: me.id });
  };
  const look: Lookup = async (type, id) => view.live(type, id);
  const isGone = (type: RecordType, id: string) => view.get(type, id)?.deleted === true;
  /** An item in a category deleted meanwhile brings the category back. */
  const keepCategory = (item: Data) => {
    const cat = view.get('category', categoryIdOf(item));
    if (cat?.deleted && cat.data) store('category', categoryIdOf(item), cat.data);
  };
  /** Ids deleted (or refused new) in this push: what else links to them is cleared below. */
  const gone: string[] = [];
  const lines: { type: RecordType; id: string; d: Described; overwrote?: Activity['overwrote'] }[] = [];
  const refuse = (c: Change, reason: string, current: Data | null) => {
    out.rejected.push({ type: c.type, id: c.id, reason, current });
    out.notices.push({ kind: 'refused', type: c.type, id: c.id, name: recordName(c.type, c.data ?? current), reason });
    // A refused new record leaves a tombstone, so records that link to it are cleared too.
    if (!view.get(c.type, c.id) && c.id.length <= 64) {
      store(c.type, c.id, null, true);
      gone.push(c.id);
    }
  };

  for (const c of list) {
    if (!known.includes(c)) {
      out.rejected.push({ type: c.type, id: String(c.id), reason: 'the app sent a change the server doesn’t know', current: null });
      continue;
    }
    const row = view.get(c.type, c.id);
    const before = row && !row.deleted ? row.data : null;
    const overwrote = row && !row.deleted && row.updatedBy !== me.id && (c.base === null || row.updatedAt > c.base) ? { personId: row.updatedBy, at: row.updatedAt } : undefined;

    if (c.op === 'delete') {
      if (before) {
        store(c.type, c.id, before, true);
        gone.push(c.id);
        const d = await describe(c.type, before, null, look);
        if (d) lines.push({ type: c.type, id: c.id, d, overwrote });
      }
      out.accepted.push({ type: c.type, id: c.id, updatedAt: now });
      continue;
    }

    const problem = recordProblem(c.type, c.id, c.data ?? null) ?? linkProblem(c.type, c.data!, view);
    if (problem) {
      refuse(c, problem, before);
      continue;
    }
    let data: Data = { ...c.data! };
    const unlinked = withoutGone(c.type, data, isGone);
    if (unlinked === 'drop') {
      if (before) {
        store(c.type, c.id, before, true);
        gone.push(c.id);
      }
      refuse(c, DROPPED[c.type]!, null);
      continue;
    }
    if (unlinked) data = unlinked;
    if (c.type === 'item') keepCategory(data);
    if (c.type === 'photo' && before) for (const f of FILE_FIELDS) if (data[f] === undefined && before[f] !== undefined) data[f] = before[f];
    if (c.type === 'run' && overwrote && before) data.doneTaskIds = mergeDoneTasks(before.doneTaskIds as unknown[], data.doneTaskIds as unknown[]);
    if (c.type === 'bin') {
      const code = String(data.code);
      const taken = (k: string) => bins.some((b) => b.id !== c.id && !b.deleted && b.code === k);
      if (taken(code)) {
        const area = splitBinCode(code)?.area ?? code.split('-')[0]!;
        // A bin the server already gave a number keeps it (this change may have crossed that renumbering).
        const own = before && typeof before.code === 'string' && !taken(before.code) && splitBinCode(before.code)?.area === area ? before.code : null;
        const to = own ?? nextBinCode(area, bins.map((b) => b.code));
        data = own ? { ...data, code: own, labelPrintedAt: before!.labelPrintedAt ?? null, labelContents: before!.labelContents ?? null } : { ...data, code: to, labelPrintedAt: null, labelContents: null };
        out.notices.push({ kind: 'bin-code', id: c.id, from: code, to });
      }
      const mine = bins.find((b) => b.id === c.id);
      if (mine) Object.assign(mine, { code: data.code, deleted: 0 });
      else bins.push({ id: c.id, code: String(data.code), deleted: 0 });
    }
    store(c.type, c.id, data);
    const d = await describe(c.type, before, data, look);
    if (d) lines.push({ type: c.type, id: c.id, d, overwrote });
    out.accepted.push({ type: c.type, id: c.id, updatedAt: now });
  }

  // What still links to a record this push deleted (§12.2): records the deleting phone didn't
  // have yet. Cleared quietly (the delete has its line). Only for pushes in pushRank order: an earlier 0.1.5
  // phone may send a delete before the moves that go with it.
  if (ordered) {
    for (let round = 0; round < 4 && gone.length; round++) {
      const found = new Map((await linkedTo(db, gone.splice(0))).map((r) => [`${r.type}:${r.id}`, r]));
      // This push's own records stand in for the server's copy of them.
      for (const r of view.liveRecords()) found.set(`${r.type}:${r.id}`, r);
      for (const { type, id, rec } of found.values()) {
        const cur = view.get(type, id) ?? rec;
        if (cur.deleted || !cur.data) continue;
        const fixed = withoutGone(type, cur.data, isGone);
        if (fixed === 'drop') {
          store(type, id, cur.data, true);
          gone.push(id);
        } else if (fixed) store(type, id, fixed);
        if (type === 'item') keepCategory(cur.data);
      }
    }
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
  for (const a of entries) stmts.push(...write(db, 'activity', a.id, { ...a }, now, me.id));
  if (stmts.length) await db.batch(stmts);
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

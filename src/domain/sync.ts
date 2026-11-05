// Sync between the phones and the server (SPEC v3.0 §12): what travels, and the rules the server
// checks a record against. Shared by the app and the Worker, so nothing here touches storage,
// the network or the DOM.
import { PHOTO_OWNERS, nameKey, type Part } from './types';
import { isPart, validateArea, validateBin, validateDisplay, validateItem, validateSeason, validateSeasonRun, validateSeasonTask, validateSpot, type FieldError } from './validate';

/** The phone's tables that sync, and the record type each holds on the server. */
export const SYNC_TABLES = {
  items: 'item',
  areas: 'area',
  spots: 'spot',
  bins: 'bin',
  seasons: 'season',
  tagList: 'tag',
  categoryList: 'category',
  pictures: 'photo',
  displays: 'display',
  seasonTasks: 'task',
  seasonRuns: 'run',
} as const;
export type SyncTable = keyof typeof SYNC_TABLES;
/** A record type a phone can change. */
export type RecordType = (typeof SYNC_TABLES)[SyncTable];
export const RECORD_TYPES = Object.values(SYNC_TABLES) as RecordType[];
export const TABLE_OF = Object.fromEntries(Object.entries(SYNC_TABLES).map(([t, r]) => [r, t])) as Record<RecordType, SyncTable>;
/** Every type the server sends: the phones' records, plus people and the activity log, which only the server writes. */
export type ServerType = RecordType | 'person' | 'activity';

export function isRecordType(t: unknown): t is RecordType {
  return RECORD_TYPES.includes(t as RecordType);
}

/**
 * A record's id on the server. Tags and categories are keyed by part and name on the phone, so
 * their id is "household:lights"; everything else has its own id.
 */
export function recordId(type: RecordType, key: unknown): string {
  if (type === 'tag' || type === 'category') {
    const [part, name] = key as [string, string];
    return `${part}:${name}`;
  }
  return String(key);
}

/** The phone's primary key for a server id (the reverse of recordId). */
export function recordKey(type: RecordType, id: string): string | [string, string] {
  if (type === 'tag' || type === 'category') {
    const at = id.indexOf(':');
    return [id.slice(0, at), id.slice(at + 1)];
  }
  return id;
}

/** Fields kept on the phone only: images, and the phone's own save time. */
const LOCAL_FIELDS = ['full', 'thumb', 'taken', 'updatedAt'];

/** A stored row as it travels: without the phone-only fields. */
export function toWire(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) if (!LOCAL_FIELDS.includes(k)) out[k] = v;
  return out;
}

/** One change in a phone's outbox, as sent. `base` is the server time of the version the phone last had (null: none). */
export interface Change {
  type: RecordType;
  id: string;
  op: 'put' | 'delete';
  data?: Record<string, unknown>;
  base: number | null;
}

export interface PushRequest {
  changes: Change[];
  /**
   * The changes come in pushRank order (since the H5 review), so the server’s copy is whole after every
   * batch and a delete can clear what still links to it. Absent from earlier 0.1.5 builds.
   */
  ordered?: boolean;
}

/** Parents before the records that link to them: an item's bin, a bin's spot, a spot's area… */
const PUT_ORDER: readonly RecordType[] = ['area', 'spot', 'season', 'display', 'bin', 'tag', 'category', 'item', 'task', 'run', 'photo'];

/**
 * The order a phone pushes its outbox in (§12.1): new and changed records parents first, then
 * deletes children first, each type in the order it was changed. A push can take several
 * batches, and another phone may pull between them; in this order nothing it pulls links to a
 * record that hasn't arrived yet or is already gone.
 */
export function pushRank(type: RecordType, op: 'put' | 'delete'): number {
  const i = PUT_ORDER.indexOf(type);
  return op === 'put' ? i : 2 * PUT_ORDER.length - 1 - i;
}

/** Is this record deleted (§12.2)? By type and id. */
export type IsGone = (type: RecordType, id: string) => boolean;

/**
 * A record without its links to deleted records (§12.2), as the server and the phones both clear
 * them: an item in a deleted bin has no home yet, a deleted season or display is cleared, a
 * deleted task is unticked. 'drop': the record goes with the one it belongs to (a spot with its
 * area, a photo with its owner, a task or run with its season). null: nothing to change. An
 * item's category is the caller's to restore.
 */
export function withoutGone(type: RecordType, data: Record<string, unknown>, gone: IsGone): Record<string, unknown> | 'drop' | null {
  const id = (v: unknown) => (typeof v === 'string' ? v : '');
  const next = { ...data };
  const clear = (field: string, t: RecordType) => {
    if (id(next[field]) && gone(t, id(next[field]))) next[field] = '';
  };
  switch (type) {
    case 'item':
      clear('binId', 'bin');
      clear('spotId', 'spot');
      clear('seasonId', 'season');
      clear('displayId', 'display');
      clear('outDisplayId', 'display');
      break;
    case 'bin':
      clear('spotId', 'spot');
      clear('seasonId', 'season');
      break;
    case 'spot':
      if (gone('area', id(data.areaId))) return 'drop';
      break;
    case 'photo':
      if (isRecordType(data.ownerType) && gone(data.ownerType, id(data.ownerId))) return 'drop';
      if (id(data.seasonId) && gone('season', id(data.seasonId))) delete next.seasonId;
      break;
    case 'task':
      if (gone('season', id(data.seasonId))) return 'drop';
      break;
    case 'run':
      if (gone('season', id(data.seasonId))) return 'drop';
      if (Array.isArray(data.doneTaskIds)) next.doneTaskIds = data.doneTaskIds.filter((t) => !gone('task', id(t)));
      break;
  }
  return JSON.stringify(next) === JSON.stringify(data) ? null : next;
}

/** The category record an item belongs to, by the id it has on the server ("holiday:Lights"). */
export const categoryIdOf = (item: Record<string, unknown>) => `${String(item.part)}:${String(item.category)}`;

/** Something the server changed or refused that the person should be told about (§12.1). */
export type Notice =
  | { kind: 'bin-code'; id: string; from: string; to: string }
  | { kind: 'refused'; type: RecordType; id: string; name: string; reason: string };

export interface PushResponse {
  accepted: { type: RecordType; id: string; updatedAt: number }[];
  /** `current` is the server's version, which the phone goes back to (null: the server has none). */
  rejected: { type: RecordType; id: string; reason: string; current: Record<string, unknown> | null }[];
  notices: Notice[];
}

export interface PulledRecord {
  type: ServerType;
  id: string;
  /** null for a deleted record. */
  data: Record<string, unknown> | null;
  updatedAt: number;
  updatedBy: string;
  deleted: boolean;
}

export interface PullResponse {
  records: PulledRecord[];
  /** Pass back as `since` for the next page or the next pull. */
  cursor: number;
  /** More pages to fetch now. */
  more: boolean;
  /** The phone's cursor is from before deletes the server has since forgotten (§12.2): start again from 0. */
  reset: boolean;
  /** No household records on the server yet (people and activity don't count): §12.1, first sync. */
  serverEmpty: boolean;
  me: Person;
}

/** Someone signed in (§3, Person). Made by the server on first sign-in; anyone can change their own name. */
export interface Person {
  id: string;
  name: string;
  email: string;
}

/** An activity log entry (§3, F17), written by the server. */
export interface Activity {
  id: string;
  at: number;
  personId: string;
  summary: string;
  recordType: RecordType;
  recordId: string;
  part: Part | '';
  /** For the filters (F17): the area and season the record belonged to, or ''. */
  areaId: string;
  seasonId: string;
  /** This change replaced someone else's newer one (§12.1, conflicts). */
  overwrote?: { personId: string; at: number };
}

/** How many changes a push carries at most. */
export const PUSH_BATCH = 50;
/** Records per pull page. */
export const PULL_PAGE = 500;
/** Deletes are kept this long, then purged with their files (§12.2, D6). */
export const TOMBSTONE_DAYS = 90;
/** Activity is kept this long (§3, D8). */
export const ACTIVITY_DAYS = 730;
/** The largest photo or attachment accepted (§3). */
export const FILE_MAX_BYTES = 15 * 1024 * 1024;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown) => typeof v === 'string';
const firstError = (errors: FieldError[]) => errors[0]?.message ?? null;
/**
 * A record id the server accepts: its type's prefix and up to 32 letters, digits, _ or -. Looser
 * than the ids this app makes (ids.ts), since a refused new record is removed from the phone.
 */
export const idFits = (id: string, prefix: string) => id.startsWith(prefix) && /^[a-z]{2}-[A-Za-z0-9_-]{1,32}$/.test(id);

/**
 * What's wrong with a record on its own, or null if it can be stored (§12.1, validation). Links
 * to other records are the server's to check, since it knows them. A record missing fields
 * fails rather than throwing.
 */
export function recordProblem(type: RecordType, id: string, data: unknown): string | null {
  if (!isObj(data)) return 'the record is empty';
  try {
    switch (type) {
      case 'tag':
      case 'category': {
        if (!isPart(data.part) || !str(data.name) || (data.name as string).trim() === '') return 'a list entry needs a part and a name';
        if (!Number.isSafeInteger(data.order)) return 'a list entry needs an order';
        const key = type === 'tag' ? data.key : data.name;
        if (type === 'tag' && data.key !== nameKey(data.name as string)) return 'the tag key doesn’t match its name';
        if (type === 'category' && !(Array.isArray(data.subcategories) && data.subcategories.every(str))) return 'subcategories must be a list of names';
        return id === recordId(type, [data.part, key]) ? null : 'the id doesn’t match the record';
      }
      case 'photo':
        if (data.id !== id || !idFits(id, 'ph-')) return 'the id doesn’t match the record';
        if (!PHOTO_OWNERS.includes(data.ownerType as never) || !str(data.ownerId)) return 'a photo needs an owner';
        if (data.kind !== 'photo' && data.kind !== 'setup') return 'a photo’s kind must be photo or setup';
        if (!str(data.caption) || !Number.isSafeInteger(data.order)) return 'a photo needs a caption and an order';
        return null;
    }
    const prefix = { item: 'it-', area: 'ar-', spot: 'sp-', bin: 'bn-', season: 'se-', display: 'dp-', task: 'tk-', run: 'sr-' }[type];
    if (data.id !== id || !idFits(id, prefix)) return 'the id doesn’t match the record';
    const v = data as never;
    switch (type) {
      case 'item':
        return firstError(validateItem(v));
      case 'area':
        return firstError(validateArea(v));
      case 'spot':
        return firstError(validateSpot(v));
      case 'bin':
        return firstError(validateBin(v));
      case 'season':
        return firstError(validateSeason(v));
      case 'display':
        return firstError(validateDisplay(v));
      case 'task':
        return firstError(validateSeasonTask(v));
      case 'run':
        return Array.isArray(data.doneTaskIds) ? firstError(validateSeasonRun(v)) : 'a season run needs its ticked tasks';
    }
  } catch {
    return 'the record is missing fields';
  }
}

/** A record's name for a person: "Snowman lights", "ATTIC-04 Christmas 4". */
export function recordName(type: RecordType, data: Record<string, unknown> | null): string {
  if (!data) return `a ${type}`;
  if (type === 'bin') return `${String(data.code)} ${String(data.name)}`;
  if (type === 'task') return `“${String(data.text)}”`;
  if (type === 'photo') return 'a photo';
  if (type === 'run') return `a season’s ${String(data.year)} run`;
  return String(data.name ?? `a ${type}`);
}

/** Season runs merge their ticked tasks when two phones changed the run at once (§12.1). */
export function mergeDoneTasks(server: readonly unknown[], phone: readonly unknown[]): string[] {
  return [...new Set([...server, ...phone].filter(str) as string[])];
}

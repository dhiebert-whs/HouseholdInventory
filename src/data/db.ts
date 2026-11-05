// IndexedDB schema (SPEC v3.0 §2, §3). Database `home-inventory`: v1 was H1's flat locations,
// v2 (H2a) is Area › Spot › Bin › Item with seasons, tags and several photos per record, v3 (H3)
// splits everything into the Household and Holiday parts, v4 gives areas codes from their names,
// v5 (H4) adds the Holiday setup: displays, season tasks and season runs, v6 (H5) adds sync: the
// outbox, photos to upload, sync state, people and the activity log.
// Never edit a version once a phone has data in it (HANDOFF §5); add the next one.
import Dexie, { type Table, type Transaction } from 'dexie';
import { convertH1, itemFromH1 } from '../domain/h1';
import { ID_PREFIX, newId } from '../domain/ids';
import { fromV2, lettersToCodes, type V2Data } from '../domain/parts';
import type { Activity, Person } from '../domain/sync';
import { outboxMiddleware, type OutboxRow, type UploadRow } from './outbox';
import { nameKey, type Area, type Bin, type Category, type Display, type Item, type Part, type PhotoInfo, type Season, type SeasonRun, type SeasonTask, type Spot, type Tag } from '../domain/types';

export { UNSORTED_AREA } from '../domain/h1';

/** Item as stored: adds when it was last saved. */
export interface ItemRow extends Item {
  /** ms since epoch of the last save. */
  updatedAt: number;
}

export type AreaRow = Area;
export type SpotRow = Spot;
export type BinRow = Bin;
export type SeasonRow = Season;
export type CategoryRow = Category;
export type DisplayRow = Display;
export type SeasonTaskRow = SeasonTask;
export type SeasonRunRow = SeasonRun;

/** A Tags list entry, keyed by part and name ignoring capitals. */
export interface TagRow extends Tag {
  key: string;
}

/** A photo: its record (§3) and the image. */
export interface PhotoRow extends PhotoInfo {
  /** JPEG, about 1600 px on the long side (§8). null for a photo from another phone until it is downloaded (§12.3). */
  full: Blob | null;
  /** Small JPEG for list rows; null until generated (needs a browser canvas). */
  thumb: Blob | null;
  updatedAt: number;
  /** Set when the photo was taken or chosen on this phone; absent for restored photos. */
  taken?: number;
  /** Set by the server once the image is uploaded (§3, §12.3). */
  r2Key?: string;
  contentType?: string;
  bytes?: number;
}

export interface SettingRow {
  key: string;
  value: unknown;
}

export const DB_NAME = 'home-inventory';

/** The schema this code was built for. Stored as a setting so an older copy can tell. */
export const SCHEMA_VERSION = 6;
export const SCHEMA_KEY = 'schemaVersion';

export class InventoryDb extends Dexie {
  items!: Table<ItemRow, string>;
  areas!: Table<AreaRow, string>;
  spots!: Table<SpotRow, string>;
  bins!: Table<BinRow, string>;
  seasons!: Table<SeasonRow, string>;
  /** Both parts' Tags lists (v3; v2's `tags` was keyed by name alone). */
  tagList!: Table<TagRow, [Part, string]>;
  pictures!: Table<PhotoRow, string>;
  /** Both parts' Categories lists (v3; v2's `categories` was keyed by name alone, and "Other" is in both parts). */
  categoryList!: Table<CategoryRow, [Part, string]>;
  settings!: Table<SettingRow, string>;
  displays!: Table<DisplayRow, string>;
  seasonTasks!: Table<SeasonTaskRow, string>;
  seasonRuns!: Table<SeasonRunRow, string>;
  /** H5 sync (§12): changes waiting to be pushed, photos waiting to upload, the sync state. */
  outbox!: Table<OutboxRow, string>;
  uploads!: Table<UploadRow, string>;
  syncMeta!: Table<SettingRow, string>;
  /** From the server: everyone signed in, and the activity log (F17). */
  people!: Table<Person, string>;
  activity!: Table<Activity, string>;

  constructor(name = DB_NAME) {
    super(name);
    // H1 (0.1.1). Kept as it was: phones upgrade from it.
    this.version(1).stores({
      items: 'id, category, location, barcode',
      photos: 'itemId',
      locations: 'key, order',
      categories: 'name, order',
      settings: 'key',
    });
    // H2a (0.1.2). Photos move to `pictures` (a new primary key needs a new table).
    this.version(2)
      .stores({
        items: 'id, category, binId, spotId, seasonId, barcode',
        areas: 'id, order',
        spots: 'id, areaId',
        bins: 'id, code, spotId, seasonId',
        seasons: 'id, order',
        tags: 'key, order',
        pictures: 'id, ownerId',
        photos: null,
        locations: null,
      })
      .upgrade(upgradeFromH1);
    // H3 (0.1.3). Lists keyed by part need new tables (a new primary key needs a new table).
    this.version(3)
      .stores({
        items: 'id, part, category, binId, spotId, seasonId, barcode',
        areas: 'id, part, order',
        bins: 'id, part, code, spotId, seasonId',
        categoryList: '[part+name], part',
        tagList: '[part+key], part',
        categories: null,
        tags: null,
      })
      .upgrade(upgradeFromV2);
    // H3 follow-up (0.1.3, area codes). The first 0.1.3 build gave areas one-letter `letter`s;
    // they become codes from their names, and their bins are renamed (A-04 → ATTIC-04). A phone
    // coming from v2 already has codes (the v3 upgrade above makes them), so this changes nothing.
    this.version(4).stores({}).upgrade(upgradeLettersToCodes);
    // H4 (0.1.4). New, empty tables; nothing stored changes. Photos may now carry a seasonId.
    this.version(5).stores({
      displays: 'id, order',
      seasonTasks: 'id, seasonId',
      seasonRuns: 'id, seasonId',
    });
    // H5 (0.1.5). New, empty tables. Changes from here on are recorded in the outbox (outbox.ts).
    this.version(6).stores({
      outbox: 'key, seq',
      uploads: 'id',
      syncMeta: 'key',
      people: 'id',
      activity: 'id, at, recordId',
    });
    this.use(outboxMiddleware);
  }
}

async function upgradeLettersToCodes(tx: Transaction): Promise<void> {
  const areas = await tx.table<Area & { letter?: string }>('areas').toArray();
  const lettered = areas.filter((a) => typeof a.letter === 'string' && typeof a.code !== 'string');
  if (lettered.length === 0) return;
  const bins = await tx.table<Bin>('bins').toArray();
  const coded = lettersToCodes(
    lettered.map((a) => ({ ...a, letter: a.letter! })),
    bins,
  );
  await tx.table('areas').bulkPut(coded.areas);
  await tx.table('bins').bulkPut(coded.bins.filter((b, i) => b !== bins[i]));
}

/**
 * 0.1.2 → 0.1.3 (§3, "Upgrading a 0.1.2 phone"): everything goes to Household, the seasons move
 * to Holiday with their default dates, and Holiday gets its default categories. The same
 * conversion as restoring a 0.1.2 backup (`fromV2`).
 */
async function upgradeFromV2(tx: Transaction): Promise<void> {
  const old: V2Data = {
    items: await tx.table('items').toArray(),
    areas: await tx.table('areas').toArray(),
    spots: [],
    bins: await tx.table('bins').toArray(),
    seasons: await tx.table('seasons').toArray(),
    tags: (await tx.table<{ key: string; name: string; order: number }>('tags').toArray()).map(({ name, order }) => ({ name, order })),
    categories: await tx.table('categories').toArray(),
  };
  const d = fromV2(old);
  await tx.table('items').bulkPut(d.items);
  await tx.table('areas').bulkPut(d.areas);
  await tx.table('bins').bulkPut(d.bins);
  await tx.table('seasons').bulkPut(d.seasons);
  await tx.table('tagList').bulkAdd(d.tags.map(toTagRow));
  await tx.table('categoryList').bulkAdd(d.categories);
}

interface H1Item {
  id: string;
  name: string;
  category: string;
  subcategory: string;
  location: string;
  quantity: number;
  barcode: string;
  notes: string;
  hasPhoto: boolean;
  updatedAt: number;
}
interface H1Location {
  key: string;
  name: string;
  notes: string;
  order: number;
}
interface H1Photo {
  itemId: string;
  full: Blob;
  thumb: Blob | null;
  updatedAt: number;
  taken?: number;
}

async function upgradeFromH1(tx: Transaction): Promise<void> {
  const locations = (await tx.table<H1Location>('locations').toArray()).map(({ name, notes, order }) => ({ name, notes, order }));
  const items = await tx.table<H1Item>('items').toArray();
  // A location only items used (not in the list) still becomes a spot.
  const listed = new Set(locations.map((l) => nameKey(l.name)));
  for (const i of items) {
    if (i.location.trim() !== '' && !listed.has(nameKey(i.location))) {
      listed.add(nameKey(i.location));
      locations.push({ name: i.location.trim(), notes: '', order: Number.MAX_SAFE_INTEGER });
    }
  }
  const c = convertH1(locations);
  if (c.area) await tx.table('areas').add(c.area);
  await tx.table('spots').bulkAdd(c.spots);
  await tx.table('seasons').bulkAdd(c.seasons);
  await tx.table('items').clear();
  await tx.table('items').bulkAdd(items.map((i) => ({ ...itemFromH1(i, c.spotIdFor(i.location)), updatedAt: i.updatedAt })));
  const taken = new Set<string>();
  const photos = await tx.table<H1Photo>('photos').toArray();
  await tx.table('pictures').bulkAdd(
    photos.map((p) => {
      const id = newId(ID_PREFIX.photo, (x) => taken.has(x));
      taken.add(id);
      const row: PhotoRow = { id, ownerType: 'item', ownerId: p.itemId, kind: 'photo', caption: '', order: 0, full: p.full, thumb: p.thumb, updatedAt: p.updatedAt };
      if (p.taken !== undefined) row.taken = p.taken;
      return row;
    }),
  );
}

/**
 * A copy of the app older than the database (a stale cached copy, or a rolled-back deploy)
 * must not read or write it. Dexie 4 opens a newer database without an error, so the stored
 * schema version and the browser's own version number are both checked.
 * Returns 'outdated' without writing anything; otherwise records this schema version.
 */
export async function checkSchema(db: InventoryDb): Promise<'ok' | 'outdated'> {
  const stored = (await db.settings.get(SCHEMA_KEY))?.value;
  // Dexie stores version n as IndexedDB version n × 10.
  const native = db.backendDB()?.version ?? 0;
  if ((typeof stored === 'number' && stored > SCHEMA_VERSION) || native / 10 > SCHEMA_VERSION) return 'outdated';
  if (stored !== SCHEMA_VERSION) await db.settings.put({ key: SCHEMA_KEY, value: SCHEMA_VERSION });
  return 'ok';
}

export function toItemRow(item: Item, updatedAt: number): ItemRow {
  return { ...item, updatedAt };
}

/** Strips the derived fields so callers work with the plain domain type. */
export function fromItemRow(row: ItemRow): Item {
  const { updatedAt: _u, ...item } = row;
  return item;
}

/** A Tags list row's primary key. */
export const tagKey = (part: Part, name: string): [Part, string] => [part, nameKey(name)];

export function toTagRow(t: Tag): TagRow {
  return { ...t, key: nameKey(t.name) };
}

export function fromTagRow({ key: _k, ...t }: TagRow): Tag {
  return t;
}

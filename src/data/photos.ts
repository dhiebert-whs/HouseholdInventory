// Photo reads and writes (SPEC v2.0 §8): several per item, bin, spot or season, in carousel
// order. Thumbnails are derived data (not in backups): made on save, or on first use for
// restored photos, and kept. An item's hasPhoto flag is kept in step in the same transaction.
import { ID_PREFIX, newId } from '../domain/ids';
import type { PhotoInfo, PhotoKind, PhotoOwner } from '../domain/types';
import type { InventoryDb, ItemRow, PhotoRow } from './db';

/** A new photo, already resized (io/image.ts). */
export interface NewPhoto {
  full: Blob;
  thumb: Blob | null;
}

/** Photo changes made in an editor, saved with the record. */
export interface PhotoEdits {
  add: readonly NewPhoto[];
  /** Ids of stored photos to delete. */
  remove: readonly string[];
}

export const NO_PHOTO_EDITS: PhotoEdits = { add: [], remove: [] };

const tables = (db: InventoryDb) => [db.pictures, db.items, db.bins, db.spots, db.seasons, db.displays, db.settings];

/** The owner's photos in carousel order. */
export async function photosOf(db: InventoryDb, ownerId: string): Promise<PhotoRow[]> {
  return (await db.pictures.where('ownerId').equals(ownerId).toArray()).sort((a, b) => a.order - b.order);
}

/** The rows whose stored order differs from their position (to put after a change). */
const reordered = (list: readonly PhotoRow[]) => list.flatMap((p, order) => (p.order === order ? [] : [{ ...p, order }]));

/**
 * Applies an editor's photo changes to a record that exists. Must run inside a rw transaction
 * over the tables in `tables`. New photos go at the end of the carousel.
 * Written as direct database calls: an earlier version with small async helpers in between
 * failed with Dexie's PrematureCommitError when adding a bin or spot photo (exact cause not
 * isolated; tests/photos.test.ts covers it).
 */
export async function applyPhotoEdits(db: InventoryDb, type: PhotoOwner, ownerId: string, edits: PhotoEdits, now: number, kind: PhotoKind = 'photo', seasonId = ''): Promise<void> {
  if (edits.add.length === 0 && edits.remove.length === 0) return;
  const table = type === 'item' ? db.items : type === 'bin' ? db.bins : type === 'spot' ? db.spots : type === 'display' ? db.displays : db.seasons;
  const owner = await table.get(ownerId);
  if (!owner) throw new Error(`no ${type} with id ${ownerId}`);
  const current = (await db.pictures.where('ownerId').equals(ownerId).toArray()).sort((a, b) => a.order - b.order);
  const removing = new Set(edits.remove);
  for (const id of removing) if (!current.some((p) => p.id === id)) throw new Error(`photo ${id} isn't one of this ${type}'s photos`);
  for (const p of edits.add) if (!p.full.size) throw new Error('the photo is empty');
  const kept = current.filter((p) => !removing.has(p.id));
  const taken = new Set((await db.pictures.toCollection().primaryKeys()) as string[]);
  const added: PhotoRow[] = edits.add.map((p, k) => {
    const id = newId(ID_PREFIX.photo, (x) => taken.has(x));
    taken.add(id);
    const row: PhotoRow = { id, ownerType: type, ownerId, kind, caption: '', order: kept.length + k, full: p.full, thumb: p.thumb, updatedAt: now, taken: now };
    if (seasonId) row.seasonId = seasonId;
    return row;
  });
  if (removing.size) await db.pictures.bulkDelete([...removing]);
  if (added.length) await db.pictures.bulkAdd(added);
  const moved = reordered(kept);
  if (moved.length) await db.pictures.bulkPut(moved);
  if (type === 'item') {
    const row = owner as ItemRow;
    const has = kept.length + added.length > 0;
    if (row.hasPhoto !== has) await db.items.put({ ...row, hasPhoto: has, updatedAt: now });
  }
  await db.settings.put({ key: 'lastChangeAt', value: now });
}

/**
 * Adds photos to a record's carousel. A display's setup photos (F8) are kind `setup` and carry
 * the season they show; a season's setup photos are kind `setup` without one.
 */
export async function addPhotos(db: InventoryDb, type: PhotoOwner, ownerId: string, photos: readonly NewPhoto[], now = Date.now(), setup: { seasonId: string } | null = null): Promise<void> {
  if (setup?.seasonId && !(await db.seasons.get(setup.seasonId))) throw new Error('That season was removed meanwhile.');
  await db.transaction('rw', tables(db), () => applyPhotoEdits(db, type, ownerId, { add: photos, remove: [] }, now, setup ? 'setup' : 'photo', setup?.seasonId ?? ''));
}

/** Changes the season a setup photo shows (F8); '' for none. */
export async function setPhotoSeason(db: InventoryDb, photoId: string, seasonId: string, now = Date.now()): Promise<void> {
  await db.transaction('rw', db.pictures, db.seasons, db.settings, async () => {
    if (seasonId && !(await db.seasons.get(seasonId))) throw new Error('That season was removed meanwhile.');
    const n = await db.pictures.update(photoId, { seasonId: seasonId || undefined });
    if (n === 0) throw new Error(`no photo with id ${photoId}`);
    await db.settings.put({ key: 'lastChangeAt', value: now });
  });
}

/** Deletes one photo (after the carousel's confirmation, §8). */
export async function deletePhoto(db: InventoryDb, photoId: string, now = Date.now()): Promise<void> {
  await db.transaction('rw', tables(db), async () => {
    const row = await db.pictures.get(photoId);
    if (!row) throw new Error(`no photo with id ${photoId}`);
    await applyPhotoEdits(db, row.ownerType, row.ownerId, { add: [], remove: [photoId] }, now);
  });
}

/** Moves a photo one place in its carousel (−1 earlier, +1 later); the first is the thumbnail. */
export async function movePhoto(db: InventoryDb, photoId: string, delta: number, now = Date.now()): Promise<void> {
  await db.transaction('rw', tables(db), async () => {
    const row = await db.pictures.get(photoId);
    if (!row) throw new Error(`no photo with id ${photoId}`);
    const list = await photosOf(db, row.ownerId);
    const at = list.findIndex((p) => p.id === photoId);
    const to = at + delta;
    if (to < 0 || to >= list.length) return;
    const [moved] = list.splice(at, 1);
    list.splice(to, 0, moved!);
    const changed = reordered(list);
    if (changed.length) await db.pictures.bulkPut(changed);
    await db.settings.put({ key: 'lastChangeAt', value: now });
  });
}

export async function setCaption(db: InventoryDb, photoId: string, caption: string, now = Date.now()): Promise<void> {
  await db.transaction('rw', db.pictures, db.settings, async () => {
    const n = await db.pictures.update(photoId, { caption: caption.trim() });
    if (n === 0) throw new Error(`no photo with id ${photoId}`);
    await db.settings.put({ key: 'lastChangeAt', value: now });
  });
}

/** Deletes every photo of records being deleted. Inside the caller's rw transaction. */
export async function deletePhotosOf(db: InventoryDb, ownerIds: readonly string[]): Promise<void> {
  if (ownerIds.length === 0) return;
  await db.pictures.where('ownerId').anyOf([...ownerIds]).delete();
}

/** Copies an owner's photos to another record (Duplicate, F16). Inside the caller's rw transaction. */
export async function copyPhotos(db: InventoryDb, fromId: string, type: PhotoOwner, toId: string, now: number): Promise<number> {
  const list = await photosOf(db, fromId);
  const taken = new Set((await db.pictures.toCollection().primaryKeys()) as string[]);
  for (const p of list) {
    const id = newId(ID_PREFIX.photo, (x) => taken.has(x));
    taken.add(id);
    await db.pictures.add({ ...p, id, ownerType: type, ownerId: toId, updatedAt: now });
  }
  return list.length;
}

/**
 * The owner's thumbnail (its first photo), or null when it has none. A missing thumbnail is
 * made from the full photo with `make` and stored, unless the photo changed meanwhile.
 * Storing a thumbnail is not an inventory change, so lastChangeAt is not touched.
 */
export async function getThumbnail(db: InventoryDb, ownerId: string, make: (full: Blob) => Promise<Blob>): Promise<Blob | null> {
  const row = (await photosOf(db, ownerId))[0];
  if (!row) return null;
  if (row.thumb) return row.thumb;
  // A photo from another phone shows once its thumbnail or image has downloaded (§12.3).
  if (!row.full) return null;
  const full = row.full;
  const thumb = await make(full);
  await db.transaction('rw', db.pictures, async () => {
    const now = await db.pictures.get(row.id);
    if (now && now.updatedAt === row.updatedAt && !now.thumb) await db.pictures.update(row.id, { thumb });
  });
  return thumb;
}

/** Photo records without their images (backups, counts). */
export function photoInfo({ id, ownerType, ownerId, kind, seasonId, caption, order }: PhotoRow): PhotoInfo {
  const info: PhotoInfo = { id, ownerType, ownerId, kind, caption, order };
  if (seasonId) info.seasonId = seasonId;
  return info;
}

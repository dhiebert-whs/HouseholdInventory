// Reads for a backup, the record that one was exported (F18), and applying a restore.
import { buildDataCsv, buildFullBackup, type BackupKind } from '../io/backup';
import type { RestorePlan } from '../io/restore';
import type { InventoryDb } from './db';
import { loadSnapshot, replaceAll, type ReplaceAllInput } from './inventory';
import { photoInfo } from './photos';
import { setSettings } from './settings';

/**
 * The backup file's contents, read in one transaction so records and photos agree. Photos from
 * other phones whose image isn't here yet are fetched with `fetchFull` (§12.3) when given; any
 * still missing are listed without an image, and a restore keeps the phone's own copy.
 */
export async function buildBackup(db: InventoryDb, kind: BackupKind, now: Date, fetchFull?: (photoId: string) => Promise<Blob | null>): Promise<Blob> {
  if (kind === 'data') {
    const snap = await loadSnapshot(db);
    return new Blob([buildDataCsv(snap)], { type: 'text/csv' });
  }
  const { snap, rows } = await db.transaction('r', [db.items, db.areas, db.spots, db.bins, db.seasons, db.tagList, db.categoryList, db.displays, db.seasonTasks, db.seasonRuns, db.pictures], async () => ({
    snap: await loadSnapshot(db),
    rows: await db.pictures.toArray(),
  }));
  const images = new Map<string, Blob>();
  for (const p of rows) {
    const full = p.full ?? (fetchFull ? await fetchFull(p.id).catch(() => null) : null);
    if (full) images.set(p.id, full);
  }
  return buildFullBackup({ ...snap, photos: rows.map(photoInfo) }, images, now);
}

/** Exporting (shared or saved) resets the reminder clock (F18). */
export async function recordBackup(db: InventoryDb, at: number): Promise<void> {
  await setSettings(db, { lastBackupAt: at });
}

export async function photoCount(db: InventoryDb): Promise<number> {
  return db.pictures.count();
}

/** What a restore plan writes (restore, or first setup from a backup). */
export const planInput = (plan: RestorePlan): ReplaceAllInput => ({ ...plan.data, images: plan.images, missingImages: plan.missingImages });

/** Applies a restore plan (F18) in one transaction. Returns how many photos are stored. */
export async function applyRestore(db: InventoryDb, plan: RestorePlan, now = Date.now()): Promise<number> {
  return replaceAll(db, planInput(plan), now);
}

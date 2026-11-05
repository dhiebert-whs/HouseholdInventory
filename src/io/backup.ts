// Backup export (F18, SPEC v3.0 §7): a full-backup ZIP or a data-only CSV, built in memory.
// Settings are never included.
import JSZip from 'jszip';
import type { InventorySnapshot } from '../data/inventory';
import type { HouseholdData } from '../domain/integrity';
import { indexPlaces, itemPath, itemSeasonId, pathText } from '../domain/places';
import { PARTS } from '../domain/types';
import { MANIFEST_FILE, type Manifest } from './bundle';
import { writeCsv } from './csv';
import {
  AREAS_FILE,
  BINS_FILE,
  DISPLAYS_FILE,
  FILES_FILE,
  ITEMS_FILE,
  ITEM_COLUMNS,
  RUNS_FILE,
  SEASONS_FILE,
  SPOTS_FILE,
  TAGS_FILE,
  TASKS_FILE,
  itemCells,
  photoPathFor,
  serializeAreas,
  serializeBins,
  serializeDisplays,
  serializeFiles,
  serializeItems,
  serializeRuns,
  serializeSeasons,
  serializeSpots,
  serializeTags,
  serializeTasks,
} from './household-csv';
import { CATEGORIES_FILE, serializeCategoriesCsv } from './lists-csv';

export const APP_NAME = 'Hiebert Home Inventory';
export const APP_VERSION = '0.1.5';

export type BackupKind = 'full' | 'data';

const p2 = (n: number) => String(n).padStart(2, '0');

/** home-inventory-backup-2026-11-02-1035.zip / .csv (local time, §7). */
export function backupFileName(kind: BackupKind, now: Date): string {
  const stamp = `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}-${p2(now.getHours())}${p2(now.getMinutes())}`;
  return `home-inventory-backup-${stamp}.${kind === 'full' ? 'zip' : 'csv'}`;
}

/**
 * The date and time a file name carries (`…-2026-10-10-1535.zip`, or a date only,
 * `…-2026-10-21.zip`), as a local time; null when there is none.
 */
export function dateFromFileName(name: string): Date | null {
  const m = /(\d{4})-(\d{2})-(\d{2})(?:-(\d{2})(\d{2}))?(?!.*\d{4}-\d{2}-\d{2})/.exec(name);
  if (!m) return null;
  const [y, mo, d, h, mi] = [m[1], m[2], m[3], m[4] ?? '0', m[5] ?? '0'].map(Number) as [number, number, number, number, number];
  const date = new Date(y, mo - 1, d, h, mi);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d || h > 23 || mi > 59) return null;
  return date;
}

/** Data only (§7): items.csv with the readable path and season added first, for a spreadsheet. Not restorable. */
export const DATA_COLUMNS = ['path', 'season', ...ITEM_COLUMNS] as const;

export function buildDataCsv(snapshot: InventorySnapshot): string {
  const ix = indexPlaces(snapshot);
  const seasons = new Map(snapshot.seasons.map((s) => [s.id, s.name]));
  return writeCsv(
    DATA_COLUMNS,
    snapshot.items.map((i) => [pathText(itemPath(i, ix)), seasons.get(itemSeasonId(i, ix)) ?? '', ...itemCells(i)]),
  );
}

/**
 * Full backup (§7): the record files, categories.csv, files.csv, manifest.json, and
 * photos/<photo id>.jpg for each photo with an image. Photos are stored as they are (already
 * compressed).
 */
export async function buildFullBackup(data: HouseholdData, images: ReadonlyMap<string, Blob>, now: Date): Promise<Blob> {
  const zip = new JSZip();
  const date = now;
  // files.csv lists only photos actually written, so it never names a missing file.
  const photos = data.photos.filter((p) => images.has(p.id));
  const paths = new Map(photos.map((p) => [p.id, photoPathFor(p.id, images.get(p.id)!.type)]));
  const files: Array<[string, string]> = [
    [AREAS_FILE, serializeAreas(data.areas)],
    [SPOTS_FILE, serializeSpots(data.spots)],
    [BINS_FILE, serializeBins(data.bins)],
    [ITEMS_FILE, serializeItems(data.items)],
    [SEASONS_FILE, serializeSeasons(data.seasons)],
    [TAGS_FILE, serializeTags(data.tags)],
    [DISPLAYS_FILE, serializeDisplays(data.displays)],
    [TASKS_FILE, serializeTasks(data.seasonTasks)],
    [RUNS_FILE, serializeRuns(data.seasonRuns)],
    [CATEGORIES_FILE, serializeCategoriesCsv(data.categories)],
    [FILES_FILE, serializeFiles(photos, (p) => paths.get(p.id)!)],
  ];
  for (const [name, text] of files) zip.file(name, text, { date });
  const manifest: Manifest = {
    app: APP_NAME,
    appVersion: APP_VERSION,
    savedAt: now.toISOString(),
    itemCount: data.items.length,
    photoCount: photos.length,
    areaCount: data.areas.length,
    spotCount: data.spots.length,
    binCount: data.bins.length,
    seasonCount: data.seasons.length,
    displayCount: data.displays.length,
    parts: Object.fromEntries(
      PARTS.map((p) => [p, { items: data.items.filter((i) => i.part === p).length, areas: data.areas.filter((a) => a.part === p).length, bins: data.bins.filter((b) => b.part === p).length }]),
    ),
  };
  zip.file(MANIFEST_FILE, JSON.stringify(manifest, null, 2) + '\n', { date });
  // Bytes rather than Blobs: JSZip reads a Blob through FileReader, which Node (tests) lacks.
  for (const p of photos) zip.file(paths.get(p.id)!, new Uint8Array(await images.get(p.id)!.arrayBuffer()), { date, compression: 'STORE' });
  const bytes = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  return new Blob([bytes], { type: 'application/zip' });
}

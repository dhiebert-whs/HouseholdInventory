// Full backup and restore (SPEC v3.0 F18, §7): both parts' records and photos round-trip with
// nothing lost, a 0.1.2 backup restores the way the phone upgrades (§3), a 0.1.1 backup is
// refused clearly, and a restore never half-applies.
import 'fake-indexeddb/auto';
import JSZip from 'jszip';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyRestore, buildBackup, recordBackup } from '../src/data/backup';
import { InventoryDb } from '../src/data/db';
import { loadSnapshot, replaceAll, type ReplaceAllInput } from '../src/data/inventory';
import { photosOf } from '../src/data/photos';
import { getSettings } from '../src/data/settings';
import { DEFAULT_CATEGORIES } from '../src/domain/parts';
import { backupFileName, buildDataCsv, dateFromFileName } from '../src/io/backup';
import { readRestoreFile, looksLikeZip, type RestorePlan } from '../src/io/restore';
import { area, bin, dataset, item, season, spot } from './helpers';

const dbs: InventoryDb[] = [];
afterEach(() => {
  for (const d of dbs.splice(0)) d.close();
});
const newDb = () => {
  const d = new InventoryDb(`br-${Math.random()}`);
  dbs.push(d);
  return d;
};

const jpeg = (...b: number[]) => new Blob([new Uint8Array(b)], { type: 'image/jpeg' });
const blobBytes = async (b: Blob) => [...new Uint8Array(await b.arrayBuffer())];
const fileOf = async (name: string, blob: Blob) => ({ name, bytes: new Uint8Array(await blob.arrayBuffer()) });
const zipBytes = (z: JSZip) => z.generateAsync({ type: 'uint8array' });

const TRICKY = 'Goes on the "big" mantel, left side.\nLine two, with a comma\r\nLine three: 6 × ¾″ hooks — ünïcödé 🎄';

/**
 * Both parts using every field: areas, spots, bins, seasons, tags, records, photos on five kinds
 * of owner. Holiday: the Attic, Christmas and Halloween, two displays, setup tasks and a run.
 * Household: the Garage, the drill, a tote.
 */
function phoneData(): ReplaceAllInput {
  const areas = [
    area({ id: 'ar-ATTIC001', name: 'Attic', code: 'A', order: 0, notes: 'pull-down "ladder"' }),
    area({ id: 'ar-GARAGE01', part: 'household', name: 'Garage', code: 'G', order: 0 }),
    area({ id: 'ar-EMPTY001', name: 'Basement', code: 'B', order: 1 }),
  ];
  const spots = [
    spot({ id: 'sp-SHELFB01', areaId: 'ar-ATTIC001', name: 'Shelf B', order: 0, notes: TRICKY }),
    spot({ id: 'sp-PEGBRD01', areaId: 'ar-GARAGE01', name: 'Pegboard', order: 0 }),
    spot({ id: 'sp-BENCH001', areaId: 'ar-GARAGE01', name: 'Bench', order: 1 }),
  ];
  const seasons = [season({ id: 'se-HALLOW01', name: 'Halloween', order: 0, color: 'orange', setupNotes: 'Porch: skeleton left' }), season({ id: 'se-XMAS0001', name: 'Christmas', order: 1, color: 'red' })];
  const bins = [
    bin({ id: 'bn-XMAS0004', code: 'A-04', name: 'Christmas 4: lights & garland', spotId: 'sp-SHELFB01', seasonId: 'se-XMAS0001', tags: ['Fragile', 'Heavy'], state: 'out', notes: 'lid cracked', labelPrintedAt: Date.UTC(2026, 10, 1, 15, 30), labelContents: 'Snowman lights ×3\nGarland ×2' }),
    bin({ id: 'bn-LOOSE001', part: 'household', code: 'G-12', name: 'Tote with no spot', spotId: '', tags: ['Fragile'] }),
  ];
  const items = [
    item({ id: 'it-SNOWMAN2', name: 'Snowman lights, "outdoor"', category: 'Lights', binId: 'bn-XMAS0004', quantity: 3, notes: TRICKY, barcode: '012345678905', tags: ['Outdoor'], condition: 'needs repair', conditionNote: 'left strand dead', value: 2499, purchaseDate: '2023-11-24', warrantyUntil: '2025-11-24' }),
    item({ id: 'it-ORNAMENT', name: 'Glass ornaments 6 × ¾', category: 'Decorations', subcategory: 'Ornaments & hooks', binId: 'bn-XMAS0004', quantity: 40, approx: true, status: 'out', outWhere: 'Mantel', outSince: Date.UTC(2026, 11, 1, 18, 0), displayId: 'dp-MANTEL01', outDisplayId: 'dp-MANTEL01', checkedAt: Date.UTC(2026, 0, 3) }),
    item({ id: 'it-DRILL222', part: 'household', name: 'Cordless drill', category: 'Tools', subcategory: 'Power', spotId: 'sp-PEGBRD01', status: 'lent', lentTo: 'Mike', lentOn: '2026-10-30', value: 12900, model: 'DCD771', serial: 'S/N 0042', keepAtLeast: 1 }),
    item({ id: 'it-NOHOME01', name: 'Mystery cable', category: 'Decorations', seasonId: 'se-HALLOW01', quantity: 0, condition: 'toss' }),
  ];
  const photos = [
    { id: 'ph-SNOW0001', ownerType: 'item' as const, ownerId: 'it-SNOWMAN2', kind: 'photo' as const, caption: 'Box, "front"', order: 0 },
    { id: 'ph-SNOW0002', ownerType: 'item' as const, ownerId: 'it-SNOWMAN2', kind: 'photo' as const, caption: '', order: 1 },
    { id: 'ph-DRILL001', ownerType: 'item' as const, ownerId: 'it-DRILL222', kind: 'photo' as const, caption: '', order: 0 },
    { id: 'ph-BIN00001', ownerType: 'bin' as const, ownerId: 'bn-XMAS0004', kind: 'photo' as const, caption: 'Inside', order: 0 },
    { id: 'ph-PEG00001', ownerType: 'spot' as const, ownerId: 'sp-PEGBRD01', kind: 'photo' as const, caption: '', order: 0 },
    { id: 'ph-SETUP001', ownerType: 'season' as const, ownerId: 'se-HALLOW01', kind: 'setup' as const, caption: 'Porch', order: 0 },
    { id: 'ph-MANTEL01', ownerType: 'display' as const, ownerId: 'dp-MANTEL01', kind: 'setup' as const, seasonId: 'se-XMAS0001', caption: 'Garland left to right; stockings in age order', order: 0 },
  ];
  const displays = [
    { id: 'dp-PORCH001', name: 'Front porch', order: 1, notes: '' },
    { id: 'dp-MANTEL01', name: 'Mantel', order: 0, notes: TRICKY },
  ];
  const seasonTasks = [
    { id: 'tk-LADDER01', seasonId: 'se-XMAS0001', phase: 'setup' as const, text: 'Get the ladder from the garage', order: 1 },
    { id: 'tk-TEST0001', seasonId: 'se-XMAS0001', phase: 'setup' as const, text: 'Test light strands; replace "dead" ones', order: 0 },
    { id: 'tk-WATER001', seasonId: 'se-XMAS0001', phase: 'takedown' as const, text: 'Recycle the tree', order: 0 },
  ];
  const seasonRuns = [
    { id: 'sr-XMAS2026', seasonId: 'se-XMAS0001', year: 2026, setupFrom: '11-28', takedownBy: '01-04', phase: 'setting up' as const, doneTaskIds: ['tk-TEST0001'], startedAt: Date.UTC(2026, 10, 28, 15, 12), finishedAt: null },
    { id: 'sr-HALL2026', seasonId: 'se-HALLOW01', year: 2026, setupFrom: '', takedownBy: '', phase: 'done' as const, doneTaskIds: [], startedAt: Date.UTC(2026, 9, 1), finishedAt: Date.UTC(2026, 10, 2) },
  ];
  const images = new Map<string, Blob>([
    ['ph-SNOW0001', jpeg(0xff, 0xd8, 0xff, 0x00, 0x01, 0x02, 0x0a, 0x0d, 0xff, 0xd9)],
    ['ph-SNOW0002', jpeg(0xff, 0xd8, 2)],
    ['ph-DRILL001', new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3])], { type: 'image/png' })],
    ['ph-BIN00001', jpeg(0xff, 0xd8, 4)],
    ['ph-PEG00001', jpeg(0xff, 0xd8, 5)],
    ['ph-SETUP001', jpeg(0xff, 0xd8, 6)],
    ['ph-MANTEL01', jpeg(0xff, 0xd8, 7)],
  ]);
  const categories = [
    { part: 'holiday' as const, name: 'Lights', order: 0, subcategories: [] },
    { part: 'holiday' as const, name: 'Empty category', order: 1, subcategories: [] },
    { part: 'holiday' as const, name: 'Decorations', order: 2, subcategories: ['Garland', 'Empty sub', 'Ornaments & hooks'] },
    { part: 'household' as const, name: 'Tools', order: 0, subcategories: ['Power'] },
    // "Other" in both parts: names are unique within a part only.
    { part: 'household' as const, name: 'Other', order: 1, subcategories: [] },
    { part: 'holiday' as const, name: 'Other', order: 3, subcategories: [] },
  ];
  const tags = [...(['Fragile', 'Outdoor', 'Heavy', 'Unused tag'] as const).map((name, order) => ({ part: 'holiday' as const, name, order })), { part: 'household' as const, name: 'Fragile', order: 0 }];
  return { items, areas, spots, bins, seasons, tags, categories, displays, seasonTasks, seasonRuns, photos, images };
}

async function planFor(db: InventoryDb, file: { name: string; bytes: Uint8Array }): Promise<RestorePlan> {
  const read = await readRestoreFile(file, await loadSnapshot(db));
  if (!read.ok) throw new Error(JSON.stringify(read.problems));
  return read.plan;
}

/** Everything restorable on a phone, photos as bytes, in a stable order. */
async function everything(db: InventoryDb) {
  const s = await loadSnapshot(db);
  const pics = await db.pictures.toArray();
  const photos = await Promise.all(
    pics.sort((a, b) => a.id.localeCompare(b.id)).map(async (p) => ({ id: p.id, ownerType: p.ownerType, ownerId: p.ownerId, kind: p.kind, seasonId: p.seasonId ?? '', caption: p.caption, order: p.order, type: p.full!.type, bytes: await blobBytes(p.full!) })),
  );
  const byId = <T extends { id: string }>(l: T[]) => [...l].sort((a, b) => a.id.localeCompare(b.id));
  return { ...s, items: byId(s.items), bins: byId(s.bins), seasonTasks: byId(s.seasonTasks), seasonRuns: byId(s.seasonRuns), photos };
}

describe('backup file names (§7)', () => {
  it('carry a local timestamp', () => {
    expect(backupFileName('full', new Date(2026, 10, 2, 9, 5))).toBe('home-inventory-backup-2026-11-02-0905.zip');
    expect(backupFileName('data', new Date(2026, 10, 2, 9, 5))).toBe('home-inventory-backup-2026-11-02-0905.csv');
  });
  it('are read back for the restore comparison', () => {
    expect(dateFromFileName('home-inventory-backup-2026-11-02-0905.zip')).toEqual(new Date(2026, 10, 2, 9, 5));
    expect(dateFromFileName('home-inventory-backup-2026-11-02.zip')).toEqual(new Date(2026, 10, 2));
    expect(dateFromFileName('backup.zip')).toBeNull();
  });
});

describe('full backup ZIP (F18, §7)', () => {
  it('has the §7 files, a manifest with counts, and photos/<photo id>', async () => {
    const db = newDb();
    await replaceAll(db, phoneData());
    const zip = await JSZip.loadAsync(await buildBackup(db, 'full', new Date(2026, 10, 2, 12, 0)));
    const names = Object.keys(zip.files).filter((n) => !zip.files[n]!.dir).sort();
    expect(names).toEqual(
      ['areas.csv', 'bins.csv', 'categories.csv', 'displays.csv', 'files.csv', 'items.csv', 'manifest.json', 'photos/ph-BIN00001.jpg', 'photos/ph-DRILL001.png', 'photos/ph-MANTEL01.jpg', 'photos/ph-PEG00001.jpg', 'photos/ph-SETUP001.jpg', 'photos/ph-SNOW0001.jpg', 'photos/ph-SNOW0002.jpg', 'season_runs.csv', 'season_tasks.csv', 'seasons.csv', 'spots.csv', 'tags.csv'].sort(),
    );
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
    expect(manifest).toMatchObject({
      app: 'Hiebert Home Inventory',
      appVersion: '0.1.5',
      itemCount: 4,
      photoCount: 7,
      areaCount: 3,
      spotCount: 3,
      binCount: 2,
      seasonCount: 2,
      displayCount: 2,
      parts: { household: { items: 1, areas: 1, bins: 1 }, holiday: { items: 3, areas: 2, bins: 1 } },
    });
    const items = await zip.file('items.csv')!.async('string');
    expect(items.split('\r\n')[0]).toBe(
      '﻿id,part,name,category,subcategory,bin_id,spot_id,quantity,approx,season_id,display_id,tags,status,out_where,out_display_id,out_since,lent_to,lent_on,condition,condition_note,checked_at,barcode,notes,value,purchase_date,model,serial,warranty_until,keep_at_least',
    );
    expect(items).toContain('it-DRILL222,household,Cordless drill,Tools,Power,,sp-PEGBRD01,0,,,,,lent,,,,Mike,2026-10-30,ok,,,,,129.00,,DCD771,S/N 0042,,1');
    expect(items).toContain(',dp-MANTEL01,,out,Mantel,dp-MANTEL01,2026-12-01T18:00:00.000Z,,,ok,,2026-01-03T00:00:00.000Z,');
    expect(await zip.file('bins.csv')!.async('string')).toContain('bn-XMAS0004,holiday,A-04,Christmas 4: lights & garland,sp-SHELFB01,se-XMAS0001,Fragile; Heavy,out,lid cracked,2026-11-01T15:30:00.000Z');
    expect((await zip.file('categories.csv')!.async('string')).split('\r\n').slice(0, 3)).toEqual(['﻿part,category,subcategory,order', 'household,Tools,Power,0', 'household,Other,,1']);
    expect(await zip.file('seasons.csv')!.async('string')).toContain('se-XMAS0001,Christmas,1,red,11-25,01-06,');
    expect((await zip.file('tags.csv')!.async('string')).split('\r\n').slice(0, 3)).toEqual(['﻿part,name,order', 'household,Fragile,0', 'holiday,Fragile,0']);
  });

  it('round-trips with nothing lost: every field, tricky text, list order, photos byte for byte with captions and order', async () => {
    const src = newDb();
    await replaceAll(src, phoneData(), 5);
    const before = await everything(src);
    const dst = newDb();
    const plan = await planFor(dst, await fileOf('b.zip', await buildBackup(src, 'full', new Date(2026, 10, 2, 12, 0))));
    expect(plan.format).toBe('v3');
    expect(plan.warnings).toEqual([]);
    expect(await applyRestore(dst, plan, 9)).toBe(7);
    const after = await everything(dst);
    expect(after).toEqual(before);
    expect(after.items.find((i) => i.id === 'it-SNOWMAN2')).toMatchObject({ notes: TRICKY, value: 2499, hasPhoto: true });
    expect(after.tags.map((t) => `${t.part}:${t.name}`)).toEqual(['household:Fragile', 'holiday:Fragile', 'holiday:Outdoor', 'holiday:Heavy', 'holiday:Unused tag']);
    expect(after.items.find((i) => i.id === 'it-DRILL222')!.part).toBe('household');
    expect(after.seasons.find((s) => s.id === 'se-XMAS0001')).toMatchObject({ setupFrom: '11-25', takedownBy: '01-06' });
    expect((await photosOf(dst, 'it-SNOWMAN2')).map((p) => p.caption)).toEqual(['Box, "front"', '']);
  });

  it('a second round trip gives the same files', async () => {
    const a = newDb();
    await replaceAll(a, phoneData());
    const when = new Date(2026, 10, 2, 12, 0);
    const first = await JSZip.loadAsync(await buildBackup(a, 'full', when));
    const b = newDb();
    await applyRestore(b, await planFor(b, await fileOf('a.zip', await buildBackup(a, 'full', when))));
    const second = await JSZip.loadAsync(await buildBackup(b, 'full', when));
    for (const name of Object.keys(first.files).filter((n) => !first.files[n]!.dir)) expect(await second.file(name)!.async('uint8array')).toEqual(await first.file(name)!.async('uint8array'));
  });

  it('files inside one top-level folder (a re-zipped backup) still restore', async () => {
    const src = newDb();
    await replaceAll(src, phoneData());
    const orig = await JSZip.loadAsync(await buildBackup(src, 'full', new Date()));
    const z = new JSZip();
    for (const [name, f] of Object.entries(orig.files)) if (!f.dir) z.file(`backup folder/${name}`, await f.async('uint8array'));
    const dst = newDb();
    await applyRestore(dst, await planFor(dst, { name: 'x.zip', bytes: await zipBytes(z) }));
    expect(await dst.pictures.count()).toBe(7);
  });
});

describe('data-only CSV (§7)', () => {
  it('is items.csv with the readable path and season first, and isn’t restorable', async () => {
    const db = newDb();
    await replaceAll(db, phoneData());
    const csv = buildDataCsv(await loadSnapshot(db));
    const lines = csv.split('\r\n');
    expect(lines[0]!.startsWith('﻿path,season,id,part,name,')).toBe(true);
    expect(csv).toContain('Attic › Shelf B › A-04 Christmas 4: lights & garland,Christmas,it-ORNAMENT,holiday,');
    expect(csv).toContain('Garage › Pegboard,,it-DRILL222,household,');
    expect(csv).toContain('No home yet,Halloween,it-NOHOME01,holiday,');
    const read = await readRestoreFile({ name: 'home-inventory-backup.csv', bytes: new TextEncoder().encode(csv) }, await loadSnapshot(db));
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.problems[0]!.message).toMatch(/only a full-backup ZIP can be restored/);
  });
});

describe('older backups (SPEC v3.0 §3, §7)', () => {
  /** A full backup as 0.1.2 wrote it: no part columns, no season dates, fewer item columns. */
  async function v2Zip(): Promise<Uint8Array> {
    const z = new JSZip();
    z.file('areas.csv', '﻿id,name,letter,order,notes\r\nar-ATTIC001,Attic,A,0,\r\n');
    z.file('spots.csv', '﻿id,area_id,name,order,notes\r\nsp-SHELFB01,ar-ATTIC001,Shelf B,0,\r\n');
    z.file('bins.csv', '﻿id,code,name,spot_id,season_id,tags,state,notes,label_printed_at,label_contents\r\nbn-XMAS0004,A-04,Christmas 4,sp-SHELFB01,se-XMAS0001,Fragile,stored,,,\r\n');
    z.file(
      'items.csv',
      '﻿id,name,category,subcategory,bin_id,spot_id,quantity,approx,season_id,tags,status,out_where,out_since,lent_to,lent_on,condition,condition_note,barcode,notes,value,purchase_date,model,serial,warranty_until,keep_at_least\r\n' +
        'it-LIGHTS01,Lights,Decorations,,bn-XMAS0004,,3,,se-XMAS0001,Fragile,stored,,,,,ok,,,,,,,,,\r\n',
    );
    z.file('seasons.csv', '﻿id,name,order,color,setup_notes\r\nse-XMAS0001,Christmas,0,red,mantel first\r\n');
    z.file('tags.csv', '﻿name,order\r\nFragile,0\r\n');
    z.file('categories.csv', '﻿category,subcategory,order\r\nDecorations,,0\r\nOther,,1\r\n');
    z.file('files.csv', '﻿id,owner_type,owner_id,kind,caption,order,path\r\nph-PIC00001,item,it-LIGHTS01,photo,,0,photos/ph-PIC00001.jpg\r\n');
    z.file('manifest.json', JSON.stringify({ app: 'Hiebert Home Inventory', appVersion: '0.1.2', savedAt: '2026-11-02T18:00:00.000Z', itemCount: 1, photoCount: 1 }));
    z.file('photos/ph-PIC00001.jpg', new Uint8Array([0xff, 0xd8, 7]));
    return zipBytes(z);
  }

  it('a 0.1.2 backup restores as the phone upgrades: all Household, seasons kept (Holiday) with dates, Holiday categories added', async () => {
    const db = newDb();
    const plan = await planFor(db, { name: 'home-inventory-backup-2026-11-02-1200.zip', bytes: await v2Zip() });
    expect(plan.format).toBe('v2');
    expect(plan.warnings).toContain('This backup is from version 0.1.2: everything in it goes to Household, and its seasons to Holiday.');
    await applyRestore(db, plan);
    const s = await loadSnapshot(db);
    expect(s.areas.map((a) => [a.part, a.name])).toEqual([['household', 'Attic']]);
    expect(s.bins).toEqual([expect.objectContaining({ part: 'household', code: 'ATTIC-04', seasonId: '', tags: ['Fragile'] })]);
    expect(s.areas.map((a) => a.code)).toEqual(['ATTIC']);
    expect(s.items).toEqual([expect.objectContaining({ part: 'household', binId: 'bn-XMAS0004', seasonId: '', tags: ['Fragile'], hasPhoto: true })]);
    expect(s.seasons).toEqual([expect.objectContaining({ id: 'se-XMAS0001', name: 'Christmas', setupFrom: '11-25', takedownBy: '01-06', setupNotes: 'mantel first' })]);
    expect(s.categories.filter((c) => c.part === 'household').map((c) => c.name)).toEqual(['Decorations', 'Other']);
    expect(s.categories.filter((c) => c.part === 'holiday').map((c) => c.name)).toEqual([...DEFAULT_CATEGORIES.holiday]);
    expect(s.tags).toEqual([{ part: 'household', name: 'Fragile', order: 0 }]);
    expect(await blobBytes((await photosOf(db, 'it-LIGHTS01'))[0]!.full!)).toEqual([0xff, 0xd8, 7]);
  });

  it('hand-edited files: a blank part cell, or files that disagree about the part column, are refused', async () => {
    const src = newDb();
    await replaceAll(src, phoneData());
    const z = await JSZip.loadAsync(await buildBackup(src, 'full', new Date()));
    z.file('items.csv', (await z.file('items.csv')!.async('string')).replace('it-NOHOME01,holiday,', 'it-NOHOME01,,'));
    z.file('categories.csv', (await z.file('categories.csv')!.async('string')).replace('holiday,Lights', ',Lights'));
    const blank = await readRestoreFile({ name: 'x.zip', bytes: await zipBytes(z) }, await loadSnapshot(src));
    expect(blank.ok || blank.problems.map((p) => p.message)).toEqual(['part is required (household or holiday)', 'part is required (household or holiday)']);
    // items.csv re-saved without its part column, beside 0.1.3 areas and bins.
    const z2 = await JSZip.loadAsync(await buildBackup(src, 'full', new Date()));
    const lines = (await z2.file('items.csv')!.async('string')).split('\r\n').map((l) => l.replace(/^(﻿?[^,]*),[^,]*,/, '$1,'));
    z2.file('items.csv', lines.join('\r\n'));
    const mixed = await readRestoreFile({ name: 'x.zip', bytes: await zipBytes(z2) }, await loadSnapshot(src));
    // (Stripping a column by regex also garbles the row with a quoted comma; only the mismatch matters here.)
    expect(mixed.ok || mixed.problems.map((p) => p.message)).toContain("areas.csv, bins.csv have the part column that items.csv lacks; the files don't come from one backup");
  });

  it('a 0.1.1 (H1) backup is refused, saying so; nothing changes', async () => {
    const db = newDb();
    await replaceAll(db, dataset({ items: [item({ id: 'keep' })] }));
    const z = new JSZip();
    z.file('inventory.csv', '﻿id,name,category,subcategory,location,quantity,barcode,notes,photo_file\r\nit-AAAAAAAA,Snowman lights,decorations,Indoor,attic shelf b,3,,,\r\n');
    z.file('locations.csv', 'name,notes,order\r\nAttic shelf B,,0\r\n');
    const read = await readRestoreFile({ name: 'old.zip', bytes: await zipBytes(z) }, await loadSnapshot(db));
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.problems.map((p) => p.message)).toEqual(['this is a backup from version 0.1.1, which this version can no longer read']);
    expect((await loadSnapshot(db)).items.map((i) => i.id)).toEqual(['keep']);
  });
});

describe('restore keeps lists the backup lacks, and completes them (§7)', () => {
  it('a ZIP without categories.csv or tags.csv keeps the phone’s, adding only what the records use', async () => {
    const src = newDb();
    await replaceAll(src, phoneData());
    const orig = await JSZip.loadAsync(await buildBackup(src, 'full', new Date()));
    orig.remove('categories.csv');
    orig.remove('tags.csv');
    const dst = newDb();
    await replaceAll(dst, dataset({ categories: [{ part: 'household' as const, name: 'Tools', order: 0, subcategories: ['Hand'] }], tags: [{ part: 'holiday' as const, name: 'Kids', order: 0 }] }));
    const plan = await planFor(dst, { name: 'x.zip', bytes: await zipBytes(orig) });
    expect(plan.data.categories.map((c) => [c.part, c.name, c.subcategories])).toEqual([
      ['household', 'Tools', ['Hand', 'Power']],
      ['holiday', 'Decorations', ['Ornaments & hooks']],
      ['holiday', 'Lights', []],
    ]);
    // Added in the order the items (stored by id) first use them, each in its part.
    expect(plan.addedCategories).toEqual(['Tools › Power', 'Decorations', 'Decorations › Ornaments & hooks', 'Lights']);
    expect(plan.data.tags.map((t) => [t.part, t.name, t.order])).toEqual([
      ['holiday', 'Kids', 0],
      ['holiday', 'Fragile', 1],
      ['holiday', 'Heavy', 2],
      ['household', 'Fragile', 0],
      ['holiday', 'Outdoor', 3],
    ]);
    // Bins (by code) first, then items: A-04's tags, G-12's (Household), then the items'.
    expect(plan.addedTags).toEqual(['Fragile', 'Heavy', 'Fragile', 'Outdoor']);
  });

  it('hand-edited capitals take the list’s spelling', async () => {
    const src = newDb();
    await replaceAll(src, phoneData());
    const z = await JSZip.loadAsync(await buildBackup(src, 'full', new Date()));
    z.file('items.csv', (await z.file('items.csv')!.async('string')).replace('it-DRILL222,Cordless drill,Tools,Power', 'it-DRILL222,Cordless drill,TOOLS,power'));
    const plan = await planFor(newDb(), { name: 'x.zip', bytes: await zipBytes(z) });
    expect(plan.data.items.find((i) => i.id === 'it-DRILL222')).toMatchObject({ category: 'Tools', subcategory: 'Power' });
  });
});

describe('restore never half-applies (F18)', () => {
  it('a file with bad rows is refused with row numbers; nothing changes', async () => {
    const src = newDb();
    await replaceAll(src, phoneData());
    const z = await JSZip.loadAsync(await buildBackup(src, 'full', new Date()));
    const csv = await z.file('items.csv')!.async('string');
    z.file('items.csv', csv.replace(',lent,', ',borrowed,').replace(',129.00,', ',12.345,'));
    const read = await readRestoreFile({ name: 'x.zip', bytes: await zipBytes(z) }, await loadSnapshot(src));
    expect(read.ok).toBe(false);
    if (!read.ok) {
      expect(read.problems).toEqual([
        { file: 'items.csv', row: 2, message: 'status "borrowed" must be one of: stored, out, lent' },
        { file: 'items.csv', row: 2, message: 'value "12.345" has more than 2 decimal places' },
      ]);
    }
  });

  it('records that don’t fit together are refused, naming the problem', async () => {
    const src = newDb();
    await replaceAll(src, phoneData());
    const z = await JSZip.loadAsync(await buildBackup(src, 'full', new Date()));
    z.file('bins.csv', (await z.file('bins.csv')!.async('string')).replace('G-12', 'A-04'));
    z.file('spots.csv', (await z.file('spots.csv')!.async('string')).replace('sp-BENCH001,ar-GARAGE01', 'sp-BENCH001,ar-NOWHERE1'));
    const read = await readRestoreFile({ name: 'x.zip', bytes: await zipBytes(z) }, await loadSnapshot(src));
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.problems.map((p) => p.message)).toEqual(['bin code A-04 is used by two bins ("Christmas 4: lights & garland" and "Tote with no spot")', 'spot "Bench" is in area ar-NOWHERE1, which isn\'t there']);
  });

  it('garbage, a ZIP without items.csv, and an empty backup are refused', async () => {
    const db = newDb();
    const snap = await loadSnapshot(db);
    const garbage = await readRestoreFile({ name: 'x.zip', bytes: new Uint8Array([0x50, 0x4b, 3, 4, 1, 2, 3]) }, snap);
    expect(garbage.ok || garbage.problems[0]!.message).toMatch(/isn't a readable ZIP/);
    const z = new JSZip();
    z.file('notes.txt', 'hello');
    const noItems = await readRestoreFile({ name: 'x.zip', bytes: await zipBytes(z) }, snap);
    expect(noItems.ok || noItems.problems[0]!.message).toMatch(/no items.csv/);
    const empty = new JSZip();
    empty.file('items.csv', 'id,name,category,quantity\r\n');
    const e = await readRestoreFile({ name: 'x.zip', bytes: await zipBytes(empty) }, snap);
    expect(e.ok || e.problems[0]!.message).toMatch(/would empty this phone/);
    expect(looksLikeZip(new TextEncoder().encode('id,name'))).toBe(false);
  });

  it('a failure inside the transaction leaves the phone unchanged', async () => {
    const src = newDb();
    await replaceAll(src, phoneData());
    const plan = await planFor(newDb(), await fileOf('x.zip', await buildBackup(src, 'full', new Date())));
    const dst = newDb();
    await replaceAll(dst, dataset({ areas: [area({ id: 'ar-KEEP0001', name: 'Keep' })], items: [item({ id: 'keep' })] }));
    const before = await everything(dst);
    const spy = vi.spyOn(dst.pictures, 'bulkAdd').mockRejectedValueOnce(new Error('disk full'));
    await expect(applyRestore(dst, plan)).rejects.toThrow('disk full');
    spy.mockRestore();
    expect(await everything(dst)).toEqual(before);
  });

  it('restore never touches settings such as the backup clock', async () => {
    const src = newDb();
    await replaceAll(src, phoneData());
    const dst = newDb();
    await recordBackup(dst, 1234);
    await applyRestore(dst, await planFor(dst, await fileOf('x.zip', await buildBackup(src, 'full', new Date()))), 99);
    const s = await getSettings(dst);
    expect(s.lastBackupAt).toBe(1234);
    expect(s.lastChangeAt).toBe(99);
  });
});

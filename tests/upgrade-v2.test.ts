// Upgrading a 0.1.2 phone in place (SPEC v3.0 §3, "Upgrading a 0.1.2 phone"): schema v2 → v3.
// Everything goes to Household; the seasons are kept (Holiday) with default dates; household
// items and bins lose their season; Holiday gets its default categories and no areas.
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { InventoryDb, SCHEMA_VERSION, checkSchema } from '../src/data/db';
import { loadSnapshot } from '../src/data/inventory';
import { checkData } from '../src/domain/integrity';
import { DEFAULT_CATEGORIES } from '../src/domain/parts';

/** A database exactly as 0.1.2 declared it (versions 1 and 2), with H2a-shaped records. */
async function makeV2(name: string): Promise<void> {
  const old = new Dexie(name);
  old.version(1).stores({ items: 'id, category, location, barcode', photos: 'itemId', locations: 'key, order', categories: 'name, order', settings: 'key' });
  old.version(2).stores({
    items: 'id, category, binId, spotId, seasonId, barcode',
    areas: 'id, order',
    spots: 'id, areaId',
    bins: 'id, code, spotId, seasonId',
    seasons: 'id, order',
    tags: 'key, order',
    pictures: 'id, ownerId',
    photos: null,
    locations: null,
  });
  await old.open();
  await old.table('areas').bulkAdd([
    { id: 'ar-ATTIC001', name: 'Attic', letter: 'A', order: 0, notes: '' },
    { id: 'ar-GARAGE01', name: 'Garage', letter: 'G', order: 1, notes: 'cold' },
  ]);
  await old.table('spots').add({ id: 'sp-SHELFB01', areaId: 'ar-ATTIC001', name: 'Shelf B', order: 0, notes: '' });
  await old.table('seasons').bulkAdd([
    { id: 'se-XMAS0001', name: 'Christmas', order: 0, color: 'red', setupNotes: 'mantel first' },
    { id: 'se-ODD00001', name: 'Grandma visits', order: 1, color: 'teal', setupNotes: '' },
  ]);
  await old.table('bins').add({ id: 'bn-XMAS0004', code: 'A-04', name: 'Christmas 4', spotId: 'sp-SHELFB01', seasonId: 'se-XMAS0001', tags: ['Fragile'], state: 'stored', notes: '', labelPrintedAt: 7, labelContents: 'Lights ×3' });
  const item = {
    category: 'Decorations', subcategory: '', binId: '', spotId: '', quantity: 1, approx: false, seasonId: '', tags: [], status: 'stored', outWhere: '', outSince: null, lentTo: '', lentOn: '',
    condition: 'ok', conditionNote: '', barcode: '', notes: '', value: null, purchaseDate: '', model: '', serial: '', warrantyUntil: '', keepAtLeast: null, hasPhoto: false, updatedAt: 3,
  };
  await old.table('items').bulkAdd([
    { ...item, id: 'it-LIGHTS01', name: 'Lights', binId: 'bn-XMAS0004', quantity: 3, seasonId: 'se-XMAS0001', tags: ['Fragile', 'Outdoor'], hasPhoto: true },
    { ...item, id: 'it-RAKE0001', name: 'Rake', category: 'Tools', spotId: 'sp-SHELFB01', status: 'out', outWhere: 'Yard', outSince: 9, value: 1999 },
  ]);
  await old.table('categories').bulkAdd([
    { name: 'Decorations', order: 0, subcategories: [] },
    { name: 'Tools', order: 1, subcategories: ['Hand'] },
    { name: 'Other', order: 2, subcategories: [] },
  ]);
  await old.table('tags').bulkAdd([
    { key: 'fragile', name: 'Fragile', order: 0 },
    { key: 'outdoor', name: 'Outdoor', order: 1 },
  ]);
  await old.table('pictures').add({ id: 'ph-PIC00001', ownerType: 'item', ownerId: 'it-LIGHTS01', kind: 'photo', caption: 'box', order: 0, full: new Blob([new Uint8Array([1, 2])], { type: 'image/jpeg' }), thumb: null, updatedAt: 3 });
  await old.table('settings').bulkAdd([
    { key: 'schemaVersion', value: 2 },
    { key: 'setupDoneAt', value: 1 },
    { key: 'lastBackupAt', value: 11 },
  ]);
  old.close();
}

describe('upgrade from 0.1.2 (schema v2 → v3 → v4 → v5 → v6)', () => {
  it('moves everything into Household and the seasons into Holiday, keeping every record', async () => {
    const name = `v2-${Math.random()}`;
    await makeV2(name);
    const db = new InventoryDb(name);
    await db.open();
    expect(await checkSchema(db)).toBe('ok');
    expect((await db.settings.get('schemaVersion'))?.value).toBe(SCHEMA_VERSION);
    expect(SCHEMA_VERSION).toBe(6);

    const snap = await loadSnapshot(db);
    // Letters become codes from the names (Dan, 2026-11-03).
    expect(snap.areas.map((a) => [a.id, a.part, a.name, a.code, a.notes])).toEqual([
      ['ar-ATTIC001', 'household', 'Attic', 'ATTIC', ''],
      ['ar-GARAGE01', 'household', 'Garage', 'GARAGE', 'cold'],
    ]);
    expect(snap.spots).toEqual([{ id: 'sp-SHELFB01', areaId: 'ar-ATTIC001', name: 'Shelf B', order: 0, notes: '' }]);
    // The bin is renamed A-04 → ATTIC-04 (its old label no longer matches, so it counts as not
    // printed), keeps its tags and loses its season.
    expect(snap.bins).toEqual([{ id: 'bn-XMAS0004', part: 'household', code: 'ATTIC-04', name: 'Christmas 4', spotId: 'sp-SHELFB01', seasonId: '', tags: ['Fragile'], state: 'stored', notes: '', labelPrintedAt: null, labelContents: null }]);

    const lights = snap.items.find((i) => i.id === 'it-LIGHTS01')!;
    expect(lights).toMatchObject({ part: 'household', binId: 'bn-XMAS0004', quantity: 3, seasonId: '', tags: ['Fragile', 'Outdoor'], hasPhoto: true, displayId: '', outDisplayId: '', checkedAt: null });
    const rake = snap.items.find((i) => i.id === 'it-RAKE0001')!;
    expect(rake).toMatchObject({ part: 'household', category: 'Tools', spotId: 'sp-SHELFB01', status: 'out', outWhere: 'Yard', outSince: 9, value: 1999 });
    expect((await db.items.get('it-RAKE0001'))!.updatedAt).toBe(3);

    // Seasons kept; a default name gets its default dates, another none.
    expect(snap.seasons.map((s) => [s.name, s.setupFrom, s.takedownBy, s.setupNotes])).toEqual([
      ['Christmas', '11-25', '01-06', 'mantel first'],
      ['Grandma visits', '', '', ''],
    ]);
    // Lists: the old ones in Household, Holiday's defaults; "Other" is in both.
    expect(snap.categories.filter((c) => c.part === 'household').map((c) => [c.name, c.subcategories])).toEqual([
      ['Decorations', []],
      ['Tools', ['Hand']],
      ['Other', []],
    ]);
    expect(snap.categories.filter((c) => c.part === 'holiday').map((c) => c.name)).toEqual([...DEFAULT_CATEGORIES.holiday]);
    expect(snap.tags).toEqual([
      { part: 'household', name: 'Fragile', order: 0 },
      { part: 'household', name: 'Outdoor', order: 1 },
    ]);
    // Photos and settings untouched; the old list tables are gone.
    expect(await db.pictures.count()).toBe(1);
    expect((await db.settings.get('setupDoneAt'))?.value).toBe(1);
    expect((await db.settings.get('lastBackupAt'))?.value).toBe(11);
    const tables = db.tables.map((t) => t.name);
    expect(tables).not.toContain('categories');
    expect(tables).not.toContain('tags');
    expect(tables).toEqual(expect.arrayContaining(['categoryList', 'tagList']));
    // The result is valid two-part data (it can be backed up and restored).
    expect(checkData({ ...snap, photos: [] })).toEqual([]);
    db.close();
  });

  it('a 0.1.2 copy of the app finds the upgraded database too new and writes nothing', async () => {
    const name = `v2-${Math.random()}`;
    await makeV2(name);
    const db = new InventoryDb(name);
    await db.open();
    await checkSchema(db);
    db.close();
    // 0.1.2's checkSchema: stored 4 > 2, and native version 40 / 10 = 4 > 2.
    const v2 = new Dexie(name);
    await v2.open();
    expect(v2.verno).toBe(6);
    expect(((await v2.table('settings').get('schemaVersion')) as { value: number }).value).toBe(6);
    v2.close();
  });

  it('an empty 0.1.2 phone (set up, nothing added) upgrades cleanly', async () => {
    const name = `v2-${Math.random()}`;
    const old = new Dexie(name);
    old.version(1).stores({ items: 'id, category, location, barcode', photos: 'itemId', locations: 'key, order', categories: 'name, order', settings: 'key' });
    old.version(2).stores({ items: 'id, category, binId, spotId, seasonId, barcode', areas: 'id, order', spots: 'id, areaId', bins: 'id, code, spotId, seasonId', seasons: 'id, order', tags: 'key, order', pictures: 'id, ownerId', photos: null, locations: null });
    await old.open();
    old.close();
    const db = new InventoryDb(name);
    await db.open();
    const snap = await loadSnapshot(db);
    expect(snap.items).toEqual([]);
    expect(snap.categories.filter((c) => c.part === 'household')).toEqual([]);
    expect(snap.categories.filter((c) => c.part === 'holiday')).toHaveLength(DEFAULT_CATEGORIES.holiday.length);
    db.close();
  });
});

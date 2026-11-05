// Upgrading an H1 phone in place (SPEC v2.0 "Upgrading an H1 phone"), then on to v3 (SPEC v3.0 §3):
// schema v1 → v2 → v3 in one open. Everything lands in Household.
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import { InventoryDb, SCHEMA_VERSION, UNSORTED_AREA, checkSchema } from '../src/data/db';
import { DEFAULT_SEASONS } from '../src/domain/places';

/** An H1 database exactly as H1 (0.1.1) declared it. */
async function makeH1(name: string): Promise<void> {
  const old = new Dexie(name);
  old.version(1).stores({ items: 'id, category, location, barcode', photos: 'itemId', locations: 'key, order', categories: 'name, order', settings: 'key' });
  await old.open();
  await old.table('locations').bulkAdd([
    { key: 'garage shelf', name: 'Garage shelf', notes: 'by the door', order: 1 },
    { key: 'attic shelf b', name: 'Attic shelf B', notes: '', order: 0 },
  ]);
  await old.table('categories').bulkAdd([{ name: 'Decorations', order: 0, subcategories: ['Indoor'] }]);
  await old.table('items').bulkAdd([
    { id: 'it-AAAAAAAA', name: 'Snowman lights', category: 'Decorations', subcategory: 'Indoor', location: 'attic SHELF b', quantity: 3, barcode: '012345678905', notes: 'left strand dim', hasPhoto: true, updatedAt: 5 },
    { id: 'it-BBBBBBBB', name: 'Wreath', category: 'Decorations', subcategory: '', location: '', quantity: 1, barcode: '', notes: '', hasPhoto: false, updatedAt: 6 },
    { id: 'it-CCCCCCCC', name: 'Rake', category: 'Decorations', subcategory: '', location: 'Shed', quantity: 2, barcode: '', notes: '', hasPhoto: false, updatedAt: 7 },
  ]);
  await old.table('photos').add({ itemId: 'it-AAAAAAAA', full: new Blob([new Uint8Array([9, 8, 7])], { type: 'image/jpeg' }), thumb: null, updatedAt: 5, taken: 4 });
  await old.table('settings').bulkAdd([
    { key: 'schemaVersion', value: 1 },
    { key: 'setupDoneAt', value: 1 },
    { key: 'reminderDays', value: 14 },
  ]);
  old.close();
}

describe('upgrade from H1 (schema v1 → v2 → v3 → v4 → v5 → v6)', () => {
  it('turns locations into spots in Unsorted, keeps items, photos, lists and settings', async () => {
    const name = `up-${Math.random()}`;
    await makeH1(name);
    const db = new InventoryDb(name);
    await db.open();
    expect(await checkSchema(db)).toBe('ok');
    expect((await db.settings.get('schemaVersion'))?.value).toBe(SCHEMA_VERSION);

    const areas = await db.areas.toArray();
    expect(areas).toHaveLength(1);
    expect(areas[0]).toMatchObject({ part: 'household', name: UNSORTED_AREA.name, code: 'UNSORTED', order: 0 });
    expect('letter' in areas[0]!).toBe(false);
    const spots = (await db.spots.toArray()).sort((a, b) => a.order - b.order);
    // Walk order kept; a location only an item used comes last.
    expect(spots.map((s) => [s.name, s.notes, s.order, s.areaId])).toEqual([
      ['Attic shelf B', '', 0, areas[0]!.id],
      ['Garage shelf', 'by the door', 1, areas[0]!.id],
      ['Shed', '', 2, areas[0]!.id],
    ]);

    const a = (await db.items.get('it-AAAAAAAA'))!;
    expect(a).toMatchObject({ part: 'household', name: 'Snowman lights', subcategory: 'Indoor', quantity: 3, barcode: '012345678905', notes: 'left strand dim', hasPhoto: true, updatedAt: 5 });
    expect(a.spotId).toBe(spots[0]!.id);
    expect(a).toMatchObject({ binId: '', approx: false, seasonId: '', tags: [], status: 'stored', condition: 'ok', value: null, keepAtLeast: null, outSince: null });
    expect('location' in a).toBe(false);
    expect((await db.items.get('it-BBBBBBBB'))!.spotId).toBe('');
    expect((await db.items.get('it-CCCCCCCC'))!.spotId).toBe(spots[2]!.id);

    const pics = await db.pictures.toArray();
    expect(pics).toHaveLength(1);
    expect(pics[0]).toMatchObject({ ownerType: 'item', ownerId: 'it-AAAAAAAA', kind: 'photo', order: 0, caption: '', taken: 4 });
    expect(pics[0]!.id).toMatch(/^ph-/);
    expect(new Uint8Array(await pics[0]!.full!.arrayBuffer())).toEqual(new Uint8Array([9, 8, 7]));

    expect((await db.seasons.orderBy('order').toArray()).map((s) => s.name)).toEqual(DEFAULT_SEASONS.map((s) => s.name));
    expect(await db.categoryList.where('part').equals('household').toArray()).toEqual([{ part: 'household', name: 'Decorations', order: 0, subcategories: ['Indoor'] }]);
    expect(await db.categoryList.where('part').equals('holiday').count()).toBeGreaterThan(0);
    expect((await db.settings.get('reminderDays'))?.value).toBe(14);
    expect((await db.settings.get('setupDoneAt'))?.value).toBe(1);
    expect(db.tables.map((t) => t.name).sort()).not.toContain('photos');
    expect(db.tables.map((t) => t.name).sort()).not.toContain('locations');
    db.close();
  });

  it('an H1 phone with no locations gets no Unsorted area', async () => {
    const name = `up-${Math.random()}`;
    const old = new Dexie(name);
    old.version(1).stores({ items: 'id, category, location, barcode', photos: 'itemId', locations: 'key, order', categories: 'name, order', settings: 'key' });
    await old.open();
    await old.table('items').add({ id: 'it-AAAAAAAA', name: 'X', category: 'Other', subcategory: '', location: '', quantity: 1, barcode: '', notes: '', hasPhoto: false, updatedAt: 1 });
    old.close();
    const db = new InventoryDb(name);
    await db.open();
    expect(await db.areas.count()).toBe(0);
    expect(await db.spots.count()).toBe(0);
    expect((await db.items.get('it-AAAAAAAA'))!.spotId).toBe('');
    db.close();
  });

  it('an H1 copy of the app finds the upgraded database too new', async () => {
    const name = `up-${Math.random()}`;
    await makeH1(name);
    const db = new InventoryDb(name);
    await db.open();
    await checkSchema(db);
    db.close();
    // H1's checkSchema compared against SCHEMA_VERSION 1: native version 50 / 10 = 5 > 1.
    const h1 = new Dexie(name);
    await h1.open();
    expect(h1.verno).toBe(6);
    expect(((await h1.table('settings').get('schemaVersion')) as { value: number }).value).toBeGreaterThan(1);
    h1.close();
  });
});

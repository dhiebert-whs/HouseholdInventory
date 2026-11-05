import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { InventoryDb } from '../src/data/db';
import { DB_NAME, InventoryDb as Db, SCHEMA_KEY, SCHEMA_VERSION, checkSchema } from '../src/data/db';
import { adjustQuantity, getItem, loadSnapshot, replaceAll, setQuantity } from '../src/data/inventory';
import { DEFAULT_SETTINGS, getSettings, setSettings } from '../src/data/settings';
import { area, dataset, item } from './helpers';

let db: InventoryDb;
const fresh = () => (db = new InventoryDb(`t-${Math.random()}`));
afterEach(() => db?.close());

describe('replaceAll', () => {
  it('stores items with their photo flags and save time', async () => {
    fresh();
    const photo = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' });
    const photos = [{ id: 'ph-1', ownerType: 'item' as const, ownerId: 'a', kind: 'photo' as const, caption: '', order: 0 }];
    expect(await replaceAll(db, dataset({ items: [item({ id: 'a' }), item({ id: 'b' })], photos, images: new Map([['ph-1', photo]]) }), 77)).toBe(1);
    const row = await db.items.get('a');
    expect(row!.hasPhoto).toBe(true);
    expect(row!.updatedAt).toBe(77);
    expect((await db.items.get('b'))!.hasPhoto).toBe(false);
  });

  it('refuses data whose links don’t fit together, before writing anything', async () => {
    fresh();
    await replaceAll(db, dataset({ items: [item({ id: 'keep' })] }));
    await expect(replaceAll(db, dataset({ items: [item({ id: 'x', binId: 'bn-gone' })] }))).rejects.toThrow(/bin bn-gone, which isn't there/);
    await expect(replaceAll(db, dataset({ areas: [area({ id: 'a1', code: 'A' }), area({ id: 'a2', name: 'Other', code: 'A' })] }))).rejects.toThrow(/both use the code A/);
    expect((await loadSnapshot(db)).items.map((i) => i.id)).toEqual(['keep']);
  });

  it('is all-or-nothing: an invalid item leaves the existing data untouched', async () => {
    fresh();
    await replaceAll(db, dataset({ items: [item({ id: 'keep' })] }));
    const bad = dataset({ items: [item({ id: 'new1' }), item({ id: 'new2', quantity: -1 })] });
    await expect(replaceAll(db, bad)).rejects.toThrow(/new2/);
    const snap = await loadSnapshot(db);
    expect(snap.items.map((i) => i.id)).toEqual(['keep']);
  });

  it('rolls back if the database write itself fails part-way', async () => {
    fresh();
    await replaceAll(db, dataset({ items: [item({ id: 'keep' })] }));
    // A value IndexedDB can't store makes the items write fail after the areas were written in the transaction.
    const unstorable = item({ id: 'other-item', notes: (() => 1) as unknown as string });
    await expect(replaceAll(db, dataset({ areas: [area()], items: [unstorable] }))).rejects.toThrow();
    expect(await db.areas.count()).toBe(0);
    expect((await loadSnapshot(db)).items.map((i) => i.id)).toEqual(['keep']);
  });

  it('does not touch settings other than lastChangeAt', async () => {
    fresh();
    await setSettings(db, { reminderDays: 3 });
    await replaceAll(db, dataset({ items: [] }), 1234);
    const s = await getSettings(db);
    expect(s.reminderDays).toBe(3);
    expect(s.lastChangeAt).toBe(1234);
  });
});

describe('setQuantity (the stepper’s typed value)', () => {
  it('changes the quantity only', async () => {
    fresh();
    await replaceAll(db, dataset({ items: [item({ id: 'a', notes: 'n' })] }));
    await setQuantity(db, 'a', 5);
    expect(await getItem(db, 'a')).toEqual(item({ id: 'a', notes: 'n', quantity: 5 }));
  });
  it('rejects negative or fractional values and unknown ids', async () => {
    fresh();
    await replaceAll(db, dataset({ items: [item({ id: 'a' })] }));
    await expect(setQuantity(db, 'a', -1)).rejects.toThrow(RangeError);
    await expect(setQuantity(db, 'a', 1.5)).rejects.toThrow(RangeError);
    await expect(setQuantity(db, 'zzz', 1)).rejects.toThrow(/no item/);
  });
});

describe('adjustQuantity (stepper ±)', () => {
  it('steps up and down and never goes below 0', async () => {
    fresh();
    await replaceAll(db, dataset({ items: [item({ id: 'a', quantity: 1 })] }));
    expect(await adjustQuantity(db, 'a', -1)).toBe(0);
    expect(await adjustQuantity(db, 'a', -1)).toBe(0);
    expect(await adjustQuantity(db, 'a', 1)).toBe(1);
    expect(await getItem(db, 'a')).toMatchObject({ quantity: 1 });
  });
  it('fast repeated taps are never lost', async () => {
    fresh();
    await replaceAll(db, dataset({ items: [item({ id: 'a', quantity: 0 })] }));
    await Promise.all(Array.from({ length: 10 }, () => adjustQuantity(db, 'a', 1)));
    expect((await getItem(db, 'a'))!.quantity).toBe(10);
  });
  it('records the change time only when the number changes', async () => {
    fresh();
    await replaceAll(db, dataset({ items: [item({ id: 'a', quantity: 0 })] }), 100);
    await adjustQuantity(db, 'a', -1, 200);
    expect((await getSettings(db)).lastChangeAt).toBe(100);
    await adjustQuantity(db, 'a', 1, 300);
    expect((await getSettings(db)).lastChangeAt).toBe(300);
  });
  it('rejects fractional steps and unknown ids', async () => {
    fresh();
    await replaceAll(db, dataset({ items: [item({ id: 'a' })] }));
    await expect(adjustQuantity(db, 'a', 0.5)).rejects.toThrow(RangeError);
    await expect(adjustQuantity(db, 'zzz', 1)).rejects.toThrow(/no item/);
  });
});

describe('settings', () => {
  it('defaults match SPEC v2.0 F18: a monthly backup reminder', async () => {
    fresh();
    const s = await getSettings(db);
    expect(s).toEqual(DEFAULT_SETTINGS);
    expect(s.reminderDays).toBe(30);
  });
});

describe('schema (SPEC v3.0 §2, D1)', () => {
  it('database home-inventory at schema v6 (H5, sync)', async () => {
    expect(DB_NAME).toBe('home-inventory');
    expect(SCHEMA_VERSION).toBe(6);
    fresh();
    await db.open();
    expect(await checkSchema(db)).toBe('ok');
    expect((await db.settings.get(SCHEMA_KEY))?.value).toBe(6);
  });

  it('an older copy of the app refuses a newer database without writing to it', async () => {
    fresh();
    await db.open();
    await db.settings.put({ key: SCHEMA_KEY, value: SCHEMA_VERSION + 1 });
    expect(await checkSchema(db)).toBe('outdated');
    expect((await db.settings.get(SCHEMA_KEY))?.value).toBe(SCHEMA_VERSION + 1);
  });

  it('opens under its own name by default', () => {
    const d = new Db();
    expect(d.name).toBe('home-inventory');
    d.close();
  });
});

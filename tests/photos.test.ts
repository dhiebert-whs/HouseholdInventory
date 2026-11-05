// Photos (SPEC v2.0 §8): several per item, bin, spot or season, in carousel order.
import 'fake-indexeddb/auto';
import JSZip from 'jszip';
import { afterEach, describe, expect, it } from 'vitest';
import { buildBackup } from '../src/data/backup';
import { InventoryDb } from '../src/data/db';
import { replaceAll } from '../src/data/inventory';
import { addItem, deleteItem, duplicateItem, updateItem } from '../src/data/items';
import { addPhotos, deletePhoto, getThumbnail, movePhoto, photosOf, setCaption } from '../src/data/photos';
import { deleteBin, removeSpot } from '../src/data/places';
import { getSettings } from '../src/data/settings';
import { dataset, household, item } from './helpers';

let db: InventoryDb;
afterEach(() => db?.close());

const jpeg = (...bytes: number[]) => new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' });
const bytesOf = async (b: Blob) => [...new Uint8Array(await b.arrayBuffer())];

async function setup() {
  db = new InventoryDb(`p-${Math.random()}`);
  const h = household();
  await replaceAll(db, dataset({ ...h, items: [item({ id: 'a', name: 'Alpha', binId: 'bn-xmas4' }), item({ id: 'b', name: 'Bravo' })] }), 1);
}

describe('photos on a record', () => {
  it('several photos in carousel order; the item’s hasPhoto follows; each is a change', async () => {
    await setup();
    await addPhotos(db, 'item', 'a', [{ full: jpeg(1), thumb: jpeg(11) }, { full: jpeg(2), thumb: null }], 5);
    await addPhotos(db, 'item', 'a', [{ full: jpeg(3), thumb: null }], 6);
    const list = await photosOf(db, 'a');
    expect(await Promise.all(list.map((p) => bytesOf(p.full!)))).toEqual([[1], [2], [3]]);
    expect(list.map((p) => [p.order, p.ownerType, p.kind, p.taken])).toEqual([
      [0, 'item', 'photo', 5],
      [1, 'item', 'photo', 5],
      [2, 'item', 'photo', 6],
    ]);
    expect(list.every((p) => /^ph-/.test(p.id))).toBe(true);
    expect((await db.items.get('a'))!.hasPhoto).toBe(true);
    expect((await getSettings(db)).lastChangeAt).toBe(6);
  });

  it('bins and spots have photos too (no hasPhoto flag needed)', async () => {
    await setup();
    await addPhotos(db, 'bin', 'bn-xmas4', [{ full: jpeg(4), thumb: null }]);
    await addPhotos(db, 'spot', 'sp-peg', [{ full: jpeg(5), thumb: null }]);
    expect((await photosOf(db, 'bn-xmas4')).map((p) => p.ownerType)).toEqual(['bin']);
    expect((await photosOf(db, 'sp-peg')).map((p) => p.ownerType)).toEqual(['spot']);
  });

  it('reorder: the first is the thumbnail; moves past the ends change nothing', async () => {
    await setup();
    await addPhotos(db, 'item', 'a', [{ full: jpeg(1), thumb: jpeg(11) }, { full: jpeg(2), thumb: jpeg(22) }]);
    const [first, second] = await photosOf(db, 'a');
    await movePhoto(db, second!.id, -1);
    expect((await photosOf(db, 'a')).map((p) => p.id)).toEqual([second!.id, first!.id]);
    expect(await bytesOf((await getThumbnail(db, 'a', async () => jpeg(0)))!)).toEqual([22]);
    await movePhoto(db, second!.id, -1);
    expect((await photosOf(db, 'a')).map((p) => [p.id, p.order])).toEqual([
      [second!.id, 0],
      [first!.id, 1],
    ]);
  });

  it('delete one: the rest close up; deleting the last clears hasPhoto; other items untouched', async () => {
    await setup();
    await addPhotos(db, 'item', 'a', [{ full: jpeg(1), thumb: null }, { full: jpeg(2), thumb: null }]);
    await addPhotos(db, 'item', 'b', [{ full: jpeg(9), thumb: null }]);
    const [p1, p2] = await photosOf(db, 'a');
    await deletePhoto(db, p1!.id);
    expect((await photosOf(db, 'a')).map((p) => [p.id, p.order])).toEqual([[p2!.id, 0]]);
    expect((await db.items.get('a'))!.hasPhoto).toBe(true);
    await deletePhoto(db, p2!.id);
    expect((await db.items.get('a'))!.hasPhoto).toBe(false);
    expect((await db.items.get('b'))!.hasPhoto).toBe(true);
    await expect(deletePhoto(db, p2!.id)).rejects.toThrow(/no photo/);
  });

  it('captions are trimmed; an unknown record or an empty photo changes nothing', async () => {
    await setup();
    await addPhotos(db, 'item', 'a', [{ full: jpeg(1), thumb: null }]);
    const [p] = await photosOf(db, 'a');
    await setCaption(db, p!.id, '  Mantel, left to right ');
    expect((await db.pictures.get(p!.id))!.caption).toBe('Mantel, left to right');
    await expect(addPhotos(db, 'item', 'zz', [{ full: jpeg(1), thumb: null }])).rejects.toThrow(/no item/);
    await expect(addPhotos(db, 'item', 'b', [{ full: new Blob([]), thumb: null }])).rejects.toThrow(/empty/);
    expect(await photosOf(db, 'b')).toEqual([]);
    expect((await db.items.get('b'))!.hasPhoto).toBe(false);
  });
});

describe('list thumbnails', () => {
  it('no photo → null, and make is never called', async () => {
    await setup();
    expect(await getThumbnail(db, 'a', async () => { throw new Error('called'); })).toBeNull();
  });

  it('made once from the first photo, then stored and reused', async () => {
    await setup();
    await addPhotos(db, 'item', 'a', [{ full: jpeg(1), thumb: null }], 4);
    let calls = 0;
    const make = async () => (calls++, jpeg(7));
    expect(await bytesOf((await getThumbnail(db, 'a', make))!)).toEqual([7]);
    expect(await bytesOf((await getThumbnail(db, 'a', make))!)).toEqual([7]);
    expect(calls).toBe(1);
    // Storing a thumbnail isn't an inventory change.
    expect((await getSettings(db)).lastChangeAt).toBe(4);
  });

  it('a photo changed while the thumbnail was being made doesn’t get the stale thumbnail', async () => {
    await setup();
    await addPhotos(db, 'item', 'a', [{ full: jpeg(1), thumb: null }], 2);
    const [p] = await photosOf(db, 'a');
    const thumb = await getThumbnail(db, 'a', async () => {
      await db.pictures.update(p!.id, { full: jpeg(2), updatedAt: 3 });
      return jpeg(8);
    });
    expect(await bytesOf(thumb!)).toEqual([8]);
    expect((await db.pictures.get(p!.id))!.thumb).toBeNull();
  });
});

describe('photos follow their records', () => {
  it('deleting an item, a bin (with its items) or a spot deletes their photos', async () => {
    await setup();
    await addPhotos(db, 'item', 'a', [{ full: jpeg(1), thumb: null }]);
    await addPhotos(db, 'item', 'b', [{ full: jpeg(2), thumb: null }]);
    await addPhotos(db, 'bin', 'bn-xmas4', [{ full: jpeg(3), thumb: null }]);
    await addPhotos(db, 'spot', 'sp-peg', [{ full: jpeg(4), thumb: null }]);
    await deleteItem(db, 'b');
    expect(await photosOf(db, 'b')).toEqual([]);
    await deleteBin(db, 'bn-xmas4', 'delete');
    expect(await photosOf(db, 'bn-xmas4')).toEqual([]);
    expect(await photosOf(db, 'a')).toEqual([]);
    await removeSpot(db, 'sp-peg', '');
    expect(await db.pictures.count()).toBe(0);
  });

  it('Duplicate copies the photos under new ids', async () => {
    await setup();
    await addPhotos(db, 'item', 'a', [{ full: jpeg(1), thumb: null }, { full: jpeg(2), thumb: null }]);
    const copy = await duplicateItem(db, 'a');
    const mine = await photosOf(db, 'a');
    const theirs = await photosOf(db, copy.id);
    expect(await Promise.all(theirs.map((p) => bytesOf(p.full!)))).toEqual([[1], [2]]);
    expect(theirs.some((p) => mine.some((m) => m.id === p.id))).toBe(false);
    expect((await db.items.get(copy.id))!.hasPhoto).toBe(true);
  });

  it('a photo goes into the full backup as photos/<photo id>.jpg, byte for byte, listed in files.csv', async () => {
    await setup();
    await addPhotos(db, 'item', 'a', [{ full: jpeg(1, 2, 3), thumb: null }]);
    const [p] = await photosOf(db, 'a');
    const zip = await JSZip.loadAsync(await (await buildBackup(db, 'full', new Date(2026, 10, 2))).arrayBuffer());
    expect([...(await zip.file(`photos/${p!.id}.jpg`)!.async('uint8array'))]).toEqual([1, 2, 3]);
    expect(await zip.file('files.csv')!.async('string')).toContain(`${p!.id},item,a,photo,,,0,photos/${p!.id}.jpg`);
  });
});

describe('photos saved with the editor (F16)', () => {
  it('Add item with photos: item and photos in one save', async () => {
    await setup();
    const saved = await addItem(db, item({ id: 'it-NEW00001', name: 'New' }), 5, { add: [{ full: jpeg(1), thumb: null }, { full: jpeg(2), thumb: null }], remove: [] });
    expect(saved.hasPhoto).toBe(true);
    expect((await photosOf(db, 'it-NEW00001')).length).toBe(2);
  });

  it('Add item that fails validation stores no photo either', async () => {
    await setup();
    await expect(addItem(db, item({ id: 'it-NEW00001', name: ' ' }), 5, { add: [{ full: jpeg(1), thumb: null }], remove: [] })).rejects.toThrow();
    expect(await db.pictures.count()).toBe(0);
  });

  it('Edit adds and removes photos with the save; a failed edit leaves them', async () => {
    await setup();
    await addPhotos(db, 'item', 'a', [{ full: jpeg(1), thumb: null }]);
    const [old] = await photosOf(db, 'a');
    const base = (await db.items.get('a'))!;
    await updateItem(db, base, { ...base, notes: 'x' }, 7, { add: [{ full: jpeg(2), thumb: null }], remove: [old!.id] });
    expect(await Promise.all((await photosOf(db, 'a')).map((p) => bytesOf(p.full!)))).toEqual([[2]]);
    const now = (await db.items.get('a'))!;
    await expect(updateItem(db, now, { ...now, name: '' }, 8, { add: [], remove: [(await photosOf(db, 'a'))[0]!.id] })).rejects.toThrow();
    expect((await photosOf(db, 'a')).length).toBe(1);
  });
});

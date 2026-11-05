// The Holiday setup's writes (SPEC v3.0 F22, F25, F5): displays, season tasks, season runs,
// putting items and bins out and back, and what removing a season or display clears.
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { InventoryDb, SCHEMA_VERSION, checkSchema } from '../src/data/db';
import {
  addDisplay,
  addTask,
  finishSetup,
  moveDisplay,
  moveTask,
  putBack,
  putOut,
  removeDisplay,
  removeTask,
  reopenSetup,
  setBinsState,
  setRunDates,
  startSetup,
  tickTask,
  unpackBin,
  updateDisplay,
} from '../src/data/holiday';
import { getItem, loadSnapshot, replaceAll } from '../src/data/inventory';
import { addItem, updateItem } from '../src/data/items';
import { removeSeason } from '../src/data/lists';
import { addPhotos, photosOf, setPhotoSeason } from '../src/data/photos';
import { checkData } from '../src/domain/integrity';
import { bin, dataset, household, item } from './helpers';

const dbs: InventoryDb[] = [];
afterEach(() => {
  for (const d of dbs.splice(0)) d.close();
});

/** The test household with two Christmas items in A-04 and a household drill. */
async function setUp(): Promise<InventoryDb> {
  const db = new InventoryDb(`hol-${Math.random()}`);
  dbs.push(db);
  const h = household();
  await replaceAll(
    db,
    dataset({
      ...h,
      items: [
        item({ id: 'it-garland', name: 'Garland', binId: 'bn-xmas4' }),
        item({ id: 'it-lights', name: 'Lights', binId: 'bn-xmas4' }),
        item({ id: 'it-drill', part: 'household', name: 'Drill', category: 'Tools' }),
      ],
    }),
  );
  return db;
}

const jpeg = () => ({ full: new Blob([new Uint8Array([0xff, 0xd8, 1])], { type: 'image/jpeg' }), thumb: null });

describe('displays (F22)', () => {
  it('add, rename, reorder; names unique ignoring capitals', async () => {
    const db = await setUp();
    const mantel = await addDisplay(db, { name: ' Mantel ' });
    const porch = await addDisplay(db, { name: 'Front porch', notes: 'left of the door' });
    expect([mantel.name, mantel.order, porch.order, porch.notes]).toEqual(['Mantel', 0, 1, 'left of the door']);
    await expect(addDisplay(db, { name: 'mantel' })).rejects.toThrow(/already in the list/);
    await moveDisplay(db, porch.id, -1);
    expect((await loadSnapshot(db)).displays.map((d) => d.name)).toEqual(['Front porch', 'Mantel']);
    await updateDisplay(db, mantel.id, { name: 'Fireplace mantel', notes: '' });
    expect((await loadSnapshot(db)).displays.map((d) => d.name)).toEqual(['Front porch', 'Fireplace mantel']);
  });
  it('a renamed display renames where its items are out', async () => {
    const db = await setUp();
    const mantel = await addDisplay(db, { name: 'Mantel' });
    await putOut(db, [{ id: 'it-garland', to: { displayId: mantel.id } }], 50);
    await updateDisplay(db, mantel.id, { name: 'Fireplace', notes: '' });
    expect((await getItem(db, 'it-garland'))!.outWhere).toBe('Fireplace');
  });
  it('removing one clears it from items (out ones keep its name as text) and deletes its photos', async () => {
    const db = await setUp();
    const mantel = await addDisplay(db, { name: 'Mantel' });
    const g = (await getItem(db, 'it-garland'))!;
    await updateItem(db, g, { ...g, displayId: mantel.id });
    await putOut(db, [{ id: 'it-garland' }, { id: 'it-lights', to: { displayId: mantel.id } }], 50);
    await addPhotos(db, 'display', mantel.id, [jpeg()], 60, { seasonId: 'se-xmas' });
    expect(await removeDisplay(db, mantel.id)).toEqual({ usual: 1, on: 2 });
    const garland = (await getItem(db, 'it-garland'))!;
    expect([garland.displayId, garland.outDisplayId, garland.outWhere, garland.status]).toEqual(['', '', 'Mantel', 'out']);
    expect(await photosOf(db, mantel.id)).toEqual([]);
    expect(checkData({ ...(await loadSnapshot(db)), photos: [] })).toEqual([]);
  });
  it('the item editor keeps the usual display in Holiday and refuses a removed one', async () => {
    const db = await setUp();
    const porch = await addDisplay(db, { name: 'Porch' });
    const g = (await getItem(db, 'it-garland'))!;
    expect((await updateItem(db, g, { ...g, displayId: porch.id })).displayId).toBe(porch.id);
    await expect(addItem(db, item({ id: 'it-new', displayId: 'dp-gone' }))).rejects.toThrow(/display was removed/);
    await expect(addItem(db, item({ id: 'it-new2', part: 'household', category: 'Tools', displayId: porch.id }))).rejects.toThrow(/household item has no display/);
  });
});

describe('setup photos (F8)', () => {
  it('a display’s setup photo carries its season, which can change, and is cleared when the season goes', async () => {
    const db = await setUp();
    const mantel = await addDisplay(db, { name: 'Mantel' });
    await addPhotos(db, 'display', mantel.id, [jpeg()], 60, { seasonId: 'se-xmas' });
    const [p] = await photosOf(db, mantel.id);
    expect([p!.kind, p!.seasonId]).toEqual(['setup', 'se-xmas']);
    await setPhotoSeason(db, p!.id, 'se-hall');
    expect((await photosOf(db, mantel.id))[0]!.seasonId).toBe('se-hall');
    await removeSeason(db, 'se-hall');
    const after = (await photosOf(db, mantel.id))[0]!;
    expect(after.seasonId).toBeUndefined();
    await expect(addPhotos(db, 'display', mantel.id, [jpeg()], 61, { seasonId: 'se-gone' })).rejects.toThrow(/season was removed/);
  });
});

describe('season tasks', () => {
  it('add, reorder, edit and remove within a season and phase', async () => {
    const db = await setUp();
    const a = await addTask(db, 'se-xmas', 'setup', 'Test the lights');
    const b = await addTask(db, 'se-xmas', 'setup', ' Get the ladder ');
    const t = await addTask(db, 'se-xmas', 'takedown', 'Recycle the tree');
    expect([a.order, b.order, b.text, t.order]).toEqual([0, 1, 'Get the ladder', 0]);
    await expect(addTask(db, 'se-xmas', 'setup', '  ')).rejects.toThrow(/what needs doing/);
    await expect(addTask(db, 'se-gone', 'setup', 'x')).rejects.toThrow(/season was removed/);
    await moveTask(db, b.id, -1);
    const order = async () => (await loadSnapshot(db)).seasonTasks.filter((x) => x.phase === 'setup').sort((x, y) => x.order - y.order).map((x) => x.text);
    expect(await order()).toEqual(['Get the ladder', 'Test the lights']);
    const r = await startSetup(db, 'se-xmas', 2026);
    await tickTask(db, r.id, a.id, true);
    await removeTask(db, a.id);
    expect(await order()).toEqual(['Get the ladder']);
    expect((await db.seasonRuns.get(r.id))!.doneTaskIds).toEqual([]);
  });
});

describe('season runs (F25)', () => {
  it('Start setup creates this year’s run once; ticking is a set; Finish and Reopen', async () => {
    const db = await setUp();
    const task = await addTask(db, 'se-xmas', 'setup', 'Test the lights');
    const r = await startSetup(db, 'se-xmas', 2026, 100);
    expect(r).toMatchObject({ seasonId: 'se-xmas', year: 2026, phase: 'setting up', doneTaskIds: [], startedAt: 100, finishedAt: null });
    expect((await startSetup(db, 'se-xmas', 2026, 200)).id).toBe(r.id);
    await tickTask(db, r.id, task.id, true);
    await tickTask(db, r.id, task.id, true);
    expect((await db.seasonRuns.get(r.id))!.doneTaskIds).toEqual([task.id]);
    await tickTask(db, r.id, task.id, false);
    expect((await db.seasonRuns.get(r.id))!.doneTaskIds).toEqual([]);
    const other = await addTask(db, 'se-hall', 'setup', 'Carve');
    await expect(tickTask(db, r.id, other.id, true)).rejects.toThrow(/another season/);
    await finishSetup(db, r.id);
    expect((await db.seasonRuns.get(r.id))!.phase).toBe('up');
    await reopenSetup(db, r.id);
    expect((await db.seasonRuns.get(r.id))!.phase).toBe('setting up');
    await startSetup(db, 'se-xmas', 2027, 300);
    expect(await db.seasonRuns.count()).toBe(2);
  });
  it('a run’s own dates: both or neither, typed dates tidied', async () => {
    const db = await setUp();
    const r = await startSetup(db, 'se-xmas', 2026);
    await setRunDates(db, r.id, { setupFrom: 'Nov 28', takedownBy: '1/4' });
    expect((await db.seasonRuns.get(r.id))!).toMatchObject({ setupFrom: '11-28', takedownBy: '01-04' });
    await expect(setRunDates(db, r.id, { setupFrom: '11-28', takedownBy: '' })).rejects.toThrow(/both dates/);
  });
  it('removing a season removes its tasks and runs', async () => {
    const db = await setUp();
    await addTask(db, 'se-xmas', 'setup', 'x');
    await startSetup(db, 'se-xmas', 2026);
    await removeSeason(db, 'se-xmas');
    const s = await loadSnapshot(db);
    expect([s.seasonTasks.length, s.seasonRuns.length]).toEqual([0, 0]);
  });
});

describe('out and back (F25, F5)', () => {
  it('put out on the usual display, a chosen one, or typed text; already-out items keep their time', async () => {
    const db = await setUp();
    const mantel = await addDisplay(db, { name: 'Mantel' });
    const g = (await getItem(db, 'it-garland'))!;
    await updateItem(db, g, { ...g, displayId: mantel.id });
    expect(await putOut(db, [{ id: 'it-garland' }, { id: 'it-lights', to: { where: ' Front yard ' } }], 100)).toBe(2);
    expect(await getItem(db, 'it-garland')).toMatchObject({ status: 'out', outDisplayId: mantel.id, outWhere: 'Mantel', outSince: 100 });
    expect(await getItem(db, 'it-lights')).toMatchObject({ status: 'out', outDisplayId: '', outWhere: 'Front yard', outSince: 100 });
    await putOut(db, [{ id: 'it-lights', to: { displayId: mantel.id } }], 200);
    expect(await getItem(db, 'it-lights')).toMatchObject({ outDisplayId: mantel.id, outWhere: 'Mantel', outSince: 100 });
    await expect(putOut(db, [{ id: 'it-drill' }])).rejects.toThrow(/Household item/);
    await db.items.update('it-garland', { status: 'lent', lentTo: 'Aunt May', lentOn: '2026-11-01' });
    await expect(putOut(db, [{ id: 'it-garland' }])).rejects.toThrow(/lent to Aunt May/);
    expect(await getItem(db, 'it-garland')).toMatchObject({ status: 'lent', lentTo: 'Aunt May' });
    await expect(putOut(db, [{ id: 'it-lights', to: { displayId: 'dp-gone' } }])).rejects.toThrow(/display was removed/);
  });
  it('put back clears where it was out; items not out are left alone', async () => {
    const db = await setUp();
    await putOut(db, [{ id: 'it-garland', to: { where: 'Porch' } }], 100);
    expect(await putBack(db, ['it-garland', 'it-lights'], 200)).toBe(1);
    expect(await getItem(db, 'it-garland')).toMatchObject({ status: 'stored', outWhere: '', outDisplayId: '', outSince: null, binId: 'bn-xmas4' });
  });
  it('bins out and back', async () => {
    const db = await setUp();
    expect(await setBinsState(db, ['bn-xmas4', 'bn-xmas4'], 'out')).toBe(1);
    expect((await db.bins.get('bn-xmas4'))!.state).toBe('out');
    expect(await setBinsState(db, ['bn-xmas4'], 'stored')).toBe(1);
    await expect(setBinsState(db, ['bn-gone'], 'out')).rejects.toThrow(/deleted meanwhile/);
    await db.bins.add(bin({ id: 'bn-house', part: 'household', code: 'G-09', name: 'Cords' }));
    await expect(setBinsState(db, ['bn-house'], 'out')).rejects.toThrow(/Household bin/);
    await expect(unpackBin(db, 'bn-house', [], true)).rejects.toThrow(/Household bin/);
  });
  it('unpack a bin: chosen items out and the bin out, in one step; an item from elsewhere is refused and nothing changes', async () => {
    const db = await setUp();
    await db.bins.add(bin({ id: 'bn-other', code: 'A-07', name: 'Other' }));
    await db.items.update('it-lights', { binId: 'bn-other' });
    await expect(unpackBin(db, 'bn-xmas4', [{ id: 'it-garland' }, { id: 'it-lights' }], true)).rejects.toThrow(/isn't in A-04/);
    expect([(await getItem(db, 'it-garland'))!.status, (await db.bins.get('bn-xmas4'))!.state]).toEqual(['stored', 'stored']);
    expect(await unpackBin(db, 'bn-xmas4', [{ id: 'it-garland', to: { where: 'Stairs' } }], true, 100)).toBe(1);
    expect([(await getItem(db, 'it-garland'))!.outWhere, (await db.bins.get('bn-xmas4'))!.state]).toEqual(['Stairs', 'out']);
  });
});

describe('schema v5 (H4)', () => {
  it('a v4 phone upgrades with every record kept and empty Holiday setup tables', async () => {
    const name = `v4-${Math.random()}`;
    const old = new Dexie(name);
    old.version(1).stores({ items: 'id, category, location, barcode', photos: 'itemId', locations: 'key, order', categories: 'name, order', settings: 'key' });
    old.version(2).stores({ items: 'id, category, binId, spotId, seasonId, barcode', areas: 'id, order', spots: 'id, areaId', bins: 'id, code, spotId, seasonId', seasons: 'id, order', tags: 'key, order', pictures: 'id, ownerId', photos: null, locations: null });
    old.version(3).stores({ items: 'id, part, category, binId, spotId, seasonId, barcode', areas: 'id, part, order', bins: 'id, part, code, spotId, seasonId', categoryList: '[part+name], part', tagList: '[part+key], part', categories: null, tags: null });
    old.version(4).stores({});
    await old.open();
    const h = household();
    await old.table('areas').bulkAdd(h.areas);
    await old.table('spots').bulkAdd(h.spots);
    await old.table('bins').bulkAdd(h.bins);
    await old.table('seasons').bulkAdd(h.seasons);
    await old.table('items').add({ ...item({ id: 'it-old', binId: 'bn-xmas4' }), updatedAt: 1 });
    await old.table('categoryList').bulkAdd(dataset().categories);
    await old.table('pictures').add({ id: 'ph-OLD00001', ownerType: 'item', ownerId: 'it-old', kind: 'photo', caption: '', order: 0, full: new Blob([new Uint8Array([1])]), thumb: null, updatedAt: 1 });
    await old.table('settings').bulkAdd([
      { key: 'schemaVersion', value: 4 },
      { key: 'setupDoneAt', value: 1 },
    ]);
    old.close();

    const db = new InventoryDb(name);
    dbs.push(db);
    await db.open();
    expect(await checkSchema(db)).toBe('ok');
    expect(SCHEMA_VERSION).toBe(6);
    const s = await loadSnapshot(db);
    expect([s.items.length, s.bins.length, s.seasons.length, s.displays, s.seasonTasks, s.seasonRuns]).toEqual([1, 2, 2, [], [], []]);
    expect((await db.pictures.get('ph-OLD00001'))!.seasonId).toBeUndefined();
    expect(checkData({ ...s, photos: [] })).toEqual([]);
  });
});

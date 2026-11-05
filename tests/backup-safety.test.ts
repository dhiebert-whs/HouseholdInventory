import 'fake-indexeddb/auto';
import JSZip from 'jszip';
import { afterEach, describe, expect, it } from 'vitest';
import { applyRestore, buildBackup } from '../src/data/backup';
import { InventoryDb } from '../src/data/db';
import { STORAGE_PERSISTED_EVENT, emptyStart, watchPersistentStorage } from '../src/data/setup';
import { loadSnapshot, replaceAll, type ReplaceAllInput } from '../src/data/inventory';
import { photosOf } from '../src/data/photos';
import { getSettings } from '../src/data/settings';
import { DEFAULT_CATEGORIES } from '../src/domain/parts';
import { readRestoreFile } from '../src/io/restore';
import { exportBackup, exportMessage } from '../src/ui/screens/more/export-backup';
import { area, dataset, item } from './helpers';

// Backup and restore safety cases from the FRC app this was forked from (its Stage 5 review). Each still applies.

const dbs: InventoryDb[] = [];
afterEach(() => {
  for (const d of dbs.splice(0)) d.close();
});
const newDb = () => {
  const d = new InventoryDb(`s5-${Math.random()}`);
  dbs.push(d);
  return d;
};

const jpeg = (...b: number[]) => new Blob([new Uint8Array([0xff, 0xd8, ...b])], { type: 'image/jpeg' });
const blobBytes = async (b: Blob) => [...new Uint8Array(await b.arrayBuffer())];

/** Three items; `photos` are [photo id, item id, image]. */
function data(photos: [string, string, Blob][]): ReplaceAllInput {
  return dataset({
    items: ['a1', 'a2', 'a3'].map((id) => item({ id, name: id, category: 'Motors' })),
    photos: photos.map(([id, ownerId]) => ({ id, ownerType: 'item' as const, ownerId, kind: 'photo' as const, caption: '', order: 0 })),
    images: new Map(photos.map(([id, , b]) => [id, b])),
  });
}

async function zipOf(db: InventoryDb, edit?: (z: JSZip) => void): Promise<Uint8Array> {
  const z = await JSZip.loadAsync(await buildBackup(db, 'full', new Date(2026, 9, 28, 12, 0)));
  edit?.(z);
  return z.generateAsync({ type: 'uint8array' });
}

async function restoreInto(db: InventoryDb, bytes: Uint8Array) {
  const read = await readRestoreFile({ name: 'b.zip', bytes }, await loadSnapshot(db));
  if (!read.ok) throw new Error(JSON.stringify(read.problems));
  await applyRestore(db, read.plan);
  return read.plan;
}

describe('a full backup with no items', () => {
  it('restores, and the lists come back', async () => {
    const src = newDb();
    await replaceAll(src, { ...emptyStart(), areas: [area()] });
    const dst = newDb();
    await replaceAll(dst, data([]));
    await restoreInto(dst, await zipOf(src));
    const s = await loadSnapshot(dst);
    expect(s.items).toEqual([]);
    expect(s.areas.map((a) => a.name)).toEqual(['Attic']);
    // Both parts' default lists (11 Household, 10 Holiday).
    expect(s.categories.length).toBe(DEFAULT_CATEGORIES.household.length + DEFAULT_CATEGORIES.holiday.length);
    expect(s.seasons.length).toBe(10);
  });

  it('is refused when it has no items and no lists either', async () => {
    const z = new JSZip();
    z.file('items.csv', 'id,name,category,quantity\r\n');
    const read = await readRestoreFile({ name: 'b.zip', bytes: await z.generateAsync({ type: 'uint8array' }) }, await loadSnapshot(newDb()));
    expect(read.ok).toBe(false);
  });
});

describe('photos missing from the ZIP', () => {
  it('are counted in the plan, and the phone keeps its own image for them', async () => {
    const db = newDb();
    await replaceAll(db, data([['ph-1', 'a1', jpeg(1)], ['ph-2', 'a2', jpeg(2)]]));
    const plan = await restoreInto(db, await zipOf(db, (z) => z.remove('photos/ph-1.jpg')));
    expect(plan.missingImages).toEqual(['ph-1']);
    expect(plan.warnings).toContain('1 photo file(s) named in the backup aren\'t in the ZIP');
    expect(await blobBytes((await photosOf(db, 'a1'))[0]!.full!)).toEqual([0xff, 0xd8, 1]);
    expect((await db.items.get('a1'))!.hasPhoto).toBe(true);
  });

  it('a missing photo the phone doesn’t have is dropped, and its item has none', async () => {
    const src = newDb();
    await replaceAll(src, data([['ph-1', 'a1', jpeg(1)]]));
    const dst = newDb();
    await replaceAll(dst, data([]));
    await restoreInto(dst, await zipOf(src, (z) => z.remove('photos/ph-1.jpg')));
    expect(await dst.pictures.count()).toBe(0);
    expect((await dst.items.get('a1'))!.hasPhoto).toBe(false);
  });

  it('a backup with every photo replaces the phone’s photos', async () => {
    const src = newDb();
    await replaceAll(src, data([['ph-9', 'a3', jpeg(9)]]));
    const dst = newDb();
    await replaceAll(dst, data([['ph-1', 'a1', jpeg(1)]]));
    await restoreInto(dst, await zipOf(src));
    expect((await dst.pictures.toArray()).map((p) => p.id)).toEqual(['ph-9']);
    expect((await dst.items.get('a1'))!.hasPhoto).toBe(false);
  });
});

describe('a backup saved only to Downloads', () => {
  const shareDeps = (outcome: 'share' | 'cancel' | 'none') => {
    const downloads: string[] = [];
    return {
      downloads,
      deps: {
        canShare: () => outcome !== 'none',
        share: () => (outcome === 'cancel' ? Promise.reject(new DOMException('', 'AbortError')) : Promise.resolve()),
        download: (f: File) => void downloads.push(f.name),
      },
    };
  };

  it('says the file is on this phone only', () => {
    const msg = exportMessage('downloaded', 'inventory-backup-2026-10-28-1200.zip')!;
    expect(msg).toMatch(/on this phone only/);
    expect(msg).toMatch(/lost with the phone/);
    expect(exportMessage('shared', 'x.zip')).toBe('Shared x.zip.');
    expect(exportMessage('cancelled', 'x.zip')).toBeNull();
  });

  it('a share and a download reset the reminder; a cancelled share doesn’t', async () => {
    for (const [outcome, resets] of [
      ['share', true],
      ['none', true],
      ['cancel', false],
    ] as const) {
      const db = newDb();
      await replaceAll(db, data([]));
      const { deps, downloads } = shareDeps(outcome);
      const { result } = await exportBackup(db, 'data', deps);
      expect(result).toBe(outcome === 'share' ? 'shared' : outcome === 'none' ? 'downloaded' : 'cancelled');
      expect(downloads.length).toBe(outcome === 'none' ? 1 : 0);
      expect((await getSettings(db)).lastBackupAt !== null).toBe(resets);
    }
  });
});

describe('persistent storage at boot', () => {
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('asks on launch and again on appinstalled, and announces a grant', async () => {
    const host = new EventTarget();
    const answers = [false, true];
    let asked = 0;
    let announced = 0;
    host.addEventListener(STORAGE_PERSISTED_EVENT, () => announced++);
    const stop = watchPersistentStorage(host, async () => answers[asked++] ?? true);
    await flush();
    expect([asked, announced]).toEqual([1, 0]);
    host.dispatchEvent(new Event('appinstalled'));
    await flush();
    expect([asked, announced]).toEqual([2, 1]);
    stop();
    host.dispatchEvent(new Event('appinstalled'));
    await flush();
    expect(asked).toBe(2);
  });

  it('null (no Storage API) announces nothing', async () => {
    const host = new EventTarget();
    let announced = 0;
    host.addEventListener(STORAGE_PERSISTED_EVENT, () => announced++);
    watchPersistentStorage(host, async () => null);
    await flush();
    expect(announced).toBe(0);
  });
});

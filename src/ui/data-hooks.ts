// Live data for screens: Dexie liveQuery re-runs the query whenever a table it read changes.
import { liveQuery } from 'dexie';
import { createContext } from 'preact';
import { useContext, useEffect, useMemo, useState } from 'preact/hooks';
import type { InventoryDb } from '../data/db';
import { loadSnapshot, type InventorySnapshot } from '../data/inventory';
import { getThumbnail, photosOf } from '../data/photos';
import { STORAGE_PERSISTED_EVENT } from '../data/setup';
import { DEFAULT_SETTINGS, getSettings, type Settings } from '../data/settings';
import { partView } from '../domain/parts';
import type { Part } from '../domain/types';
import { makeThumbnail } from '../io/image';

export const DbContext = createContext<InventoryDb | null>(null);

export function useDb(): InventoryDb {
  const db = useContext(DbContext);
  if (!db) throw new Error('no database');
  return db;
}

export type Live<T> = { state: 'loading' } | { state: 'ready'; value: T } | { state: 'error'; error: unknown };

export function useSnapshot(): Live<InventorySnapshot> {
  const db = useDb();
  const [live, setLive] = useState<Live<InventorySnapshot>>({ state: 'loading' });
  useEffect(() => {
    const sub = liveQuery(() => loadSnapshot(db)).subscribe({
      next: (value) => setLive({ state: 'ready', value }),
      error: (error: unknown) => setLive({ state: 'error', error }),
    });
    return () => sub.unsubscribe();
  }, [db]);
  return live;
}

/** One part's records (F21) and both parts' (`all`, for scanning and the other part's count), live. */
export function usePartSnapshot(part: Part): { live: Live<InventorySnapshot>; snap: InventorySnapshot | null; all: InventorySnapshot | null } {
  const live = useSnapshot();
  const all = live.state === 'ready' ? live.value : null;
  const snap = useMemo(() => (all ? partView(all, part) : null), [all, part]);
  return { live, snap, all };
}

/** Device settings, live; defaults until loaded or if the read fails. */
export function useSettings(): Settings {
  const db = useDb();
  const [settings, setSettings] = useState<Settings>({ ...DEFAULT_SETTINGS });
  useEffect(() => {
    const sub = liveQuery(() => getSettings(db)).subscribe({ next: setSettings, error: () => undefined });
    return () => sub.unsubscribe();
  }, [db]);
  return settings;
}

// Thumbnails: object URLs cached for the session, made one at a time so a fully expanded
// list doesn't decode 128 full-size photos at once.
const thumbUrls = new Map<string, Promise<string | null>>();
let queue: Promise<unknown> = Promise.resolve();

function thumbUrl(db: InventoryDb, ownerId: string): Promise<string | null> {
  let p = thumbUrls.get(ownerId);
  if (!p) {
    p = queue.then(() => getThumbnail(db, ownerId, (full) => makeThumbnail(full))).then((b) => (b ? URL.createObjectURL(b) : null));
    queue = p.catch(() => null);
    // A failure isn't cached, so the next mount tries again.
    p.catch(() => thumbUrls.delete(ownerId));
    thumbUrls.set(ownerId, p);
  }
  return p;
}

// Mounted thumbnails listen here, so a replaced photo shows without leaving the screen.
const thumbListeners = new Set<(ownerId: string | null) => void>();

/** Drops a cached thumbnail after its record's photos change; mounted thumbnails reload. */
export function forgetThumbnail(ownerId: string): void {
  dropThumbnail(ownerId);
  for (const l of thumbListeners) l(ownerId);
}

function dropThumbnail(ownerId: string): void {
  const p = thumbUrls.get(ownerId);
  thumbUrls.delete(ownerId);
  void p?.then((url) => url && URL.revokeObjectURL(url));
}

/** Drops every cached thumbnail (after a restore replaces the photos). */
export function forgetAllThumbnails(): void {
  for (const id of [...thumbUrls.keys()]) dropThumbnail(id);
  for (const l of thumbListeners) l(null);
}

/** The current time, updated every `ms` (banners that depend on the clock). */
export function useNow(ms = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** Persistent-storage status and space used (§2); null fields when the browser can't say. */
export type StorageStatus = { persisted: boolean | null; usage: number | null };

export function useStorageStatus(): StorageStatus | null {
  const [s, setS] = useState<StorageStatus | null>(null);
  useEffect(() => {
    const read = () => {
      const st = navigator.storage;
      void Promise.all([st?.persisted?.().catch(() => null) ?? null, st?.estimate?.().catch(() => null) ?? null]).then(([p, e]) =>
        setS({ persisted: p, usage: e?.usage ?? null }),
      );
    };
    read();
    // A grant during this launch shows without reopening the screen .
    window.addEventListener(STORAGE_PERSISTED_EVENT, read);
    return () => window.removeEventListener(STORAGE_PERSISTED_EVENT, read);
  }, []);
  return s;
}

/** Asks for a photo's full image (sync-runner.ts sets it; nothing without a server). */
let onMissingFull: (photoId: string) => void = () => undefined;
export function setMissingFullHandler(f: (photoId: string) => void): void {
  onMissingFull = f;
}

/** One photo of a record's carousel (§8), with its full-size image while the screen is open. */
export type PhotoView = {
  id: string;
  url: string;
  caption: string;
  /** Taken or chosen on this phone (not a restored backup photo). */
  taken: boolean;
  /** A display's setup photo: the season it shows, or ''. */
  seasonId: string;
};

/** A record's photos in carousel order, live; [] while loading or when it has none. */
export function usePhotos(ownerId: string): PhotoView[] {
  const db = useDb();
  const [views, setViews] = useState<PhotoView[]>([]);
  useEffect(() => {
    let urls: string[] = [];
    const sub = liveQuery(() => photosOf(db, ownerId)).subscribe({
      next: (rows) => {
        for (const u of urls) URL.revokeObjectURL(u);
        // Another phone's photo shows its thumbnail while the image downloads (§12.3), and
        // nothing until either has arrived.
        for (const r of rows) if (!r.full) onMissingFull(r.id);
        const next = rows.flatMap((r) => {
          const image = r.full ?? r.thumb;
          return image ? [{ id: r.id, url: URL.createObjectURL(image), caption: r.caption, taken: r.taken !== undefined, seasonId: r.seasonId ?? '' }] : [];
        });
        urls = next.map((v) => v.url);
        setViews(next);
      },
      error: () => setViews([]),
    });
    return () => {
      sub.unsubscribe();
      for (const u of urls) URL.revokeObjectURL(u);
    };
  }, [db, ownerId]);
  return views;
}

/** The record's list thumbnail (its first photo). `hasPhoto` false skips the lookup (items know). */
export function useThumbnail(ownerId: string, hasPhoto = true): string | null {
  const db = useDb();
  const [url, setUrl] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const l = (id: string | null) => (id === null || id === ownerId) && setVersion((v) => v + 1);
    thumbListeners.add(l);
    return () => void thumbListeners.delete(l);
  }, [ownerId]);
  useEffect(() => {
    if (!hasPhoto) {
      setUrl(null);
      return;
    }
    let alive = true;
    thumbUrl(db, ownerId).then(
      (u) => alive && setUrl(u),
      () => alive && setUrl(null),
    );
    return () => {
      alive = false;
    };
  }, [db, ownerId, hasPhoto, version]);
  return url;
}

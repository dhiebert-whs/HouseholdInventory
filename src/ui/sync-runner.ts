// When sync runs (SPEC v3.0 §12.1): at launch, when the app comes back to the screen, every
// 2 minutes while it's open and online, back online, and soon after a change. One sync at a
// time; a request during one runs another after it. Screens read the status with useSync.
import { liveQuery } from 'dexie';
import { useEffect, useState } from 'preact/hooks';
import type { InventoryDb } from '../data/db';
import { fetchFullImage, lastSyncAt, loadNotices, syncOnce, type SyncNotice, type SyncStatus } from '../data/sync';
import { httpApi, type SyncApi } from '../io/sync-api';
import { forgetThumbnail, setMissingFullHandler } from './data-hooks';

const EVERY = 2 * 60_000;
/** After a change, wait this long for more before pushing (a run of ticks goes as one). */
const SETTLE = 1_500;

let status: SyncStatus = { kind: 'starting' };
const listeners = new Set<() => void>();
let current: { db: InventoryDb; api: SyncApi; request: () => void } | null = null;

function setStatus(s: SyncStatus) {
  status = s;
  for (const l of listeners) l();
}

export function syncStatus(): SyncStatus {
  return status;
}

/** Starts syncing this database; returns the stop function. Off for good on a copy with no server. */
export function startSync(db: InventoryDb, api: SyncApi = httpApi()): () => void {
  let running: Promise<void> | null = null;
  let again = false;
  let stopped = false;
  let settle: ReturnType<typeof setTimeout> | undefined;
  const run = (): Promise<void> => {
    if (stopped || status.kind === 'no-server') return Promise.resolve();
    if (running) {
      again = true;
      return running;
    }
    if (status.kind !== 'choose') setStatus({ kind: 'syncing' });
    running = syncOnce(db, api, { onPhotos: (owners) => owners.forEach(forgetThumbnail) })
      .then(setStatus)
      .finally(() => {
        running = null;
        if (again && !stopped) {
          again = false;
          void run();
        }
      });
    return running;
  };
  const request = () => void run();
  current = { db, api, request };
  setMissingFullHandler(requestFullImage);
  const onVisible = () => document.visibilityState === 'visible' && request();
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('online', request);
  const timer = setInterval(() => document.visibilityState === 'visible' && navigator.onLine !== false && request(), EVERY);
  // Each new outbox change (its rev is new) pushes soon after. The outbox is small.
  let lastRev = -1;
  const sub = liveQuery(async () => (await db.outbox.toArray()).reduce((m, r) => Math.max(m, r.rev), 0)).subscribe({
    next: (rev) => {
      if (lastRev !== -1 && rev > lastRev) {
        clearTimeout(settle);
        settle = setTimeout(request, SETTLE);
      }
      lastRev = rev;
    },
    error: () => undefined,
  });
  request();
  return () => {
    stopped = true;
    current = null;
    clearTimeout(settle);
    clearInterval(timer);
    sub.unsubscribe();
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('online', request);
  };
}

/** Sync now (pull to refresh, after a choice). */
export function syncNow(): void {
  current?.request();
}

const fullWanted = new Map<string, Promise<Blob | null>>();
/** Downloads a photo's full image once (§12.3); the carousel shows it when it's stored. */
export function requestFullImage(id: string): void {
  if (!current || fullWanted.has(id)) return;
  const { db, api } = current;
  const p = fetchFullImage(db, api, id).catch(() => null);
  fullWanted.set(id, p);
  void p.then((b) => !b && fullWanted.delete(id));
}

/** A photo's full image for a backup, from the server when this phone hasn't got it (F18). */
export function fullImageFetcher(): ((id: string) => Promise<Blob | null>) | undefined {
  if (!current || status.kind === 'no-server') return undefined;
  const { db, api } = current;
  return (id) => fetchFullImage(db, api, id);
}

export interface SyncView {
  status: SyncStatus;
  /** Changes waiting to be pushed, and photos waiting to upload. */
  waiting: number;
  photosWaiting: number;
  lastAt: number | null;
  notices: SyncNotice[];
}

/** The sync status and counts, live. */
export function useSync(db: InventoryDb): SyncView {
  const [s, setS] = useState(status);
  const [counts, setCounts] = useState({ waiting: 0, photosWaiting: 0, lastAt: null as number | null, notices: [] as SyncNotice[] });
  useEffect(() => {
    const l = () => setS(status);
    listeners.add(l);
    l();
    const sub = liveQuery(async () => ({ waiting: await db.outbox.count(), photosWaiting: await db.uploads.count(), lastAt: await lastSyncAt(db), notices: await loadNotices(db) })).subscribe({
      next: setCounts,
      error: () => undefined,
    });
    return () => {
      listeners.delete(l);
      sub.unsubscribe();
    };
  }, [db]);
  return { status: s, ...counts };
}

/** "Synced 2 min ago", "Offline · 3 changes waiting", "Syncing…" (F15); null when this copy has no server. */
export function syncLine(v: SyncView, now = Date.now()): string | null {
  const waiting = v.waiting + v.photosWaiting;
  const tail = waiting ? ` · ${waiting} change${waiting === 1 ? '' : 's'} waiting` : '';
  switch (v.status.kind) {
    case 'no-server':
    case 'starting':
      return null;
    case 'syncing':
      return 'Syncing…';
    case 'offline':
      return `Offline${tail}`;
    case 'signed-out':
      return `Signed out${tail}`;
    case 'choose':
      return 'Choose which data to keep';
    case 'error':
      return `Sync failed${tail}`;
    case 'synced': {
      const min = Math.floor((now - v.status.at) / 60_000);
      return `Synced ${min < 1 ? 'just now' : min < 60 ? `${min} min ago` : `${Math.floor(min / 60)} h ago`}${tail}`;
    }
  }
}

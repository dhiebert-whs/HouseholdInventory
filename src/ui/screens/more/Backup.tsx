// Backup & restore (F18): full or data-only backup, the reminder, restore and storage status (§2).
import { liveQuery } from 'dexie';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { InventoryDb } from '../../../data/db';
import { loadSnapshot, replaceAll } from '../../../data/inventory';
import { sampleStart } from '../../../data/sample';
import { formatBytes, formatDateTime } from '../../../domain/dates';
import { daysSinceBackup } from '../../../domain/backup-reminder';
import { buildDataCsv, type BackupKind } from '../../../io/backup';
import type { FileProblem } from '../../../io/csv';
import { readRestoreFile, type RestorePlan } from '../../../io/restore';
import { BackButton, TopBar, plural } from '../../components/common';
import { Dialog, DialogActions } from '../../components/Dialog';
import { forgetAllThumbnails, useDb, useNow, useSettings, useSnapshot, useStorageStatus, type StorageStatus } from '../../data-hooks';
import { Icon } from '../../icons';
import { BackupBanner } from '../../shell/BackupBanner';
import { href } from '../../shell/router';
import { syncStatus } from '../../sync-runner';
import { getPart } from '../../part';
import { showToast } from '../../shell/toast';
import { StorageError } from '../StorageError';
import { exportBackup, exportMessage } from './export-backup';
import { RestoreDialog, type PhoneNow } from './RestoreDialog';

const BACKUP_ACCEPT = '.zip,application/zip,application/x-zip-compressed';

interface PhotoStats {
  count: number;
  bytes: number;
  ids: Set<string>;
}

function usePhotoStats(db: InventoryDb): PhotoStats | null {
  const [stats, setStats] = useState<PhotoStats | null>(null);
  useEffect(() => {
    const sub = liveQuery(async () => {
      const rows = await db.pictures.toArray();
      return { count: rows.length, bytes: rows.reduce((n, r) => n + (r.full?.size ?? r.bytes ?? 0), 0), ids: new Set(rows.map((r) => r.id)) };
    }).subscribe({ next: setStats, error: () => setStats(null) });
    return () => sub.unsubscribe();
  }, [db]);
  return stats;
}

/** Opens the system file picker and resolves with the chosen file's name and bytes. */
function usePicker(accept: string, onFile: (f: { name: string; bytes: Uint8Array }) => void) {
  const input = useRef<HTMLInputElement>(null);
  const el = (
    <input
      ref={input}
      type="file"
      accept={accept}
      hidden
      onChange={async (e) => {
        const el = e.currentTarget as HTMLInputElement;
        const file = el.files?.[0];
        el.value = '';
        if (file) onFile({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
      }}
    />
  );
  return { el, open: () => input.current?.click() };
}

type Dlg = { kind: 'sample' } | { kind: 'restore'; plan: RestorePlan } | { kind: 'problems'; title: string; fileName: string; problems: FileProblem[]; warnings: string[]; footer: string };

export function BackupScreen() {
  const db = useDb();
  const live = useSnapshot();
  const settings = useSettings();
  const now = useNow();
  const photos = usePhotoStats(db);
  const storage = useStorageStatus();
  const [busy, setBusy] = useState<string | null>(null);
  const [dlg, setDlg] = useState<Dlg | null>(null);
  const snap = live.state === 'ready' ? live.value : null;
  const csvBytes = useMemo(() => (snap ? new TextEncoder().encode(buildDataCsv(snap)).length : null), [snap]);

  const doExport = async (kind: BackupKind) => {
    setBusy(kind === 'full' ? 'Building the full backup…' : 'Building the data-only backup…');
    try {
      const { result, name } = await exportBackup(db, kind);
      const msg = exportMessage(result, name);
      if (msg) showToast(msg);
    } catch (e) {
      showToast(`Couldn’t make the backup: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const restorePicker = usePicker(BACKUP_ACCEPT, async (f) => {
    setBusy(`Checking ${f.name}…`);
    try {
      const read = await readRestoreFile(f, await loadSnapshot(db));
      if (read.ok) setDlg({ kind: 'restore', plan: read.plan });
      else
        setDlg({
          kind: 'problems',
          title: 'Can’t restore this file — nothing was changed',
          fileName: f.name,
          problems: read.problems,
          warnings: read.warnings,
          footer: 'Choose a backup made by this app: a full backup (ZIP) or a data-only backup (CSV). The whole file is checked before anything is replaced.',
        });
    } catch (e) {
      showToast(`Couldn’t read ${f.name}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  });

  const top = <TopBar title="Backup & restore" back={<BackButton label="More" fallback={href.tab(getPart(), 'more')} />} />;
  if (live.state === 'error') {
    return (
      <>
        {top}
        <StorageError error={live.error} />
      </>
    );
  }

  const days = daysSinceBackup(settings.lastBackupAt, now);
  const lastBackup = settings.lastBackupAt === null ? 'Never' : days === 0 ? formatDateTime(new Date(settings.lastBackupAt), new Date(now)) : `${plural(days!, 'day')} ago`;
  const fullSize = csvBytes !== null && photos ? formatBytes(csvBytes + photos.bytes) : '…';
  const phone: PhoneNow | null =
    snap && photos ? { items: snap.items.length, photos: photos.count, photoIds: photos.ids, areas: snap.areas.length, spots: snap.spots.length, bins: snap.bins.length, lastChangeAt: settings.lastChangeAt } : null;

  return (
    <>
      {top}
      <BackupBanner onBackupScreen />
      <div class="bk">
        <section class="card bkcard" aria-labelledby="bk-h">
          <h2 class="h2" id="bk-h">
            Back up
          </h2>
          <div class="bk-last">
            Last backup: <strong>{lastBackup}</strong>
            {settings.lastBackupAt !== null && days !== 0 && <span class="small muted"> ({formatDateTime(new Date(settings.lastBackupAt), new Date(now))})</span>}
          </div>
          <button type="button" class="bkopt" disabled={!!busy || !snap} onClick={() => void doExport('full')}>
            <span class="mi">
              <Icon name="photo" />
            </span>
            <span class="grow">
              <span class="mt block">Full backup (ZIP)</span>
              <span class="small muted block">
                Everything: items, areas, spots, bins, seasons, tags, categories and {photos ? plural(photos.count, 'photo') : '… photos'} · about {fullSize}
              </span>
            </span>
            <Icon name="upload" />
          </button>
          <button type="button" class="bkopt" disabled={!!busy || !snap} onClick={() => void doExport('data')}>
            <span class="mi">
              <Icon name="note" />
            </span>
            <span class="grow">
              <span class="mt block">Data only (CSV)</span>
              <span class="small muted block">
                items.csv with each item’s place · about {csvBytes === null ? '…' : formatBytes(csvBytes)} · opens in Excel or Sheets; can’t be restored
              </span>
            </span>
            <Icon name="upload" />
          </button>
          <p class="small muted bk-p">
            Both open the share sheet: save to Files or iCloud Drive, or send by email or AirDrop. Settings are never included.
          </p>
          <StorageNote storage={storage} />
        </section>

        <div class="mcol">
          <section class="card bkcard" aria-labelledby="rs-h">
            <div class="bk-h">
              <h2 class="h2 grow" id="rs-h">
                Restore
              </h2>
            </div>
            <p class="bk-p">
              Replaces <strong>all</strong> inventory on this phone, both parts, with a full backup (ZIP). A backup from version 0.1.2 also works: everything in it goes
              to Household and its seasons to Holiday. Backups from 0.1.1 can no longer be read.
              {syncStatus().kind !== 'no-server' && <> With sync on, the server and every family phone get the backup’s data too (F18).</>}
            </p>
            <button type="button" class="btn lg" disabled={!!busy || !phone} onClick={restorePicker.open}>
              <Icon name="upload" class="ic flip" />
              Choose a backup file (ZIP)…
            </button>
            {restorePicker.el}
          </section>

          <section class="card bkcard" aria-labelledby="sm-h">
            <h2 class="h2" id="sm-h">
              Sample data (for testing)
            </h2>
            <p class="bk-p">
              Replaces <strong>all</strong> inventory on this phone, both parts, with a made-up house: areas, spots, bins, items, displays and setup lists. Only while the app
              is being built.
              {syncStatus().kind !== 'no-server' && <> With sync on, it replaces the family’s data on every phone too.</>}
            </p>
            <button type="button" class="btn lg" disabled={!!busy || !phone} onClick={() => setDlg({ kind: 'sample' })}>
              Load sample data…
            </button>
          </section>

        </div>
      </div>

      {busy && (
        <div class="scrim center" aria-busy="true">
          <div class="dlg busy" role="status">
            <strong>{busy}</strong>
          </div>
        </div>
      )}
      {dlg?.kind === 'sample' && phone && <SampleDialog db={db} phone={phone} onClose={() => setDlg(null)} />}
      {dlg?.kind === 'restore' && phone && <RestoreDialog plan={dlg.plan} phone={phone} onClose={() => setDlg(null)} />}
      {dlg?.kind === 'problems' && (
        <ProblemsDialog title={dlg.title} fileName={dlg.fileName} problems={dlg.problems} warnings={dlg.warnings} footer={dlg.footer} onClose={() => setDlg(null)} />
      )}
    </>
  );
}

/** Replacing everything with the sample data: what goes, then a confirm. */
function SampleDialog({ db, phone, onClose }: { db: InventoryDb; phone: PhoneNow; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      const data = sampleStart();
      await replaceAll(db, data);
      forgetAllThumbnails();
      showToast(`Sample data loaded: ${plural(data.items.length, 'item')} across both parts.`);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };
  return (
    <Dialog label="Load sample data" role="alertdialog" onClose={() => !busy && onClose()}>
      <h2 class="h2">Replace everything with sample data?</h2>
      <p class="dlg-p">
        This deletes the {plural(phone.items, 'item')}, {plural(phone.photos, 'photo')} and {plural(phone.areas, 'area')} on this phone, in both parts. Make a full backup first if
        you want them back.
      </p>
      {error && (
        <div class="err" role="alert">
          {error}
        </div>
      )}
      <DialogActions>
        <button type="button" class="btn lg" data-autofocus disabled={busy} onClick={onClose}>
          Cancel
        </button>
        <button type="button" class="btn danger lg" disabled={busy} onClick={() => void go()}>
          Replace with sample data
        </button>
      </DialogActions>
    </Dialog>
  );
}

function StorageNote({ storage }: { storage: StorageStatus | null }) {
  if (!storage) return null;
  const used = storage.usage === null ? '' : ` Using ${formatBytes(storage.usage)} on this phone.`;
  if (storage.persisted)
    return (
      <div class="bk-store">
        <Icon name="check" />
        <span>
          <strong>Persistent storage granted.</strong> The browser won’t clear the app’s data on its own.{used} Backups still matter if the phone is lost, reset or broken.
        </span>
      </div>
    );
  return (
    <div class="bk-store warn">
      <Icon name="info" />
      <span>
        <strong>Persistent storage {storage.persisted === false ? 'not granted' : 'unknown'}.</strong> The browser may clear the app’s data if the phone runs low on space or
        the app goes unused for weeks.{used} Add the app to the home screen (Share › Add to Home Screen) and keep backups current.
      </span>
    </div>
  );
}

/** A file that can't be restored: what's wrong, row by row. Nothing was changed. */
function ProblemsDialog(props: { title: string; fileName: string; problems: FileProblem[]; warnings: string[]; footer: string; onClose: () => void }) {
  return (
    <Dialog label={props.title} role="alertdialog" onClose={props.onClose}>
      <h2 class="h2">{props.title}</h2>
      <div class="mono small">{props.fileName}</div>
      <ul class="small notes-list">
        {props.problems.slice(0, 20).map((p, i) => (
          <li key={i}>{p.row === null ? `${p.file}: ${p.message}` : `${p.file} row ${p.row}: ${p.message}`}</li>
        ))}
        {props.problems.length > 20 && <li>…and {props.problems.length - 20} more</li>}
        {props.warnings.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
      <p class="dlg-p">{props.footer}</p>
      <DialogActions>
        <button type="button" class="btn pri lg" data-autofocus onClick={props.onClose}>
          OK
        </button>
      </DialogActions>
    </Dialog>
  );
}

// Restore confirmation (F18): "on this phone now" vs "in the backup", an optional backup first,
// and Replace everything only after the "I understand" tick.
import { useState } from 'preact/hooks';
import { applyRestore } from '../../../data/backup';
import { formatBytes, formatDateTime, formatIsoDate, localIsoDate } from '../../../domain/dates';
import type { RestorePlan } from '../../../io/restore';
import { Dialog, DialogActions } from '../../components/Dialog';
import { plural } from '../../components/common';
import { forgetAllThumbnails, useDb } from '../../data-hooks';
import { Icon } from '../../icons';
import { showToast } from '../../shell/toast';
import { syncStatus } from '../../sync-runner';
import { exportBackup, exportMessage } from './export-backup';

export interface PhoneNow {
  items: number;
  photos: number;
  /** Photo ids on this phone (a photo the backup lacks is kept from here). */
  photoIds: ReadonlySet<string>;
  areas: number;
  spots: number;
  bins: number;
  lastChangeAt: number | null;
}

export function RestoreDialog({ plan, phone, onClose }: { plan: RestorePlan; phone: PhoneNow; onClose: () => void }) {
  const db = useDb();
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [backedUp, setBackedUp] = useState<string | null>(null);
  const now = new Date();

  const d = plan.data;
  // Photos the ZIP names but doesn't have: the phone keeps its own.
  const missing = plan.missingImages.length;
  const keptMissing = plan.missingImages.filter((id) => phone.photoIds.has(id)).length;
  const backupPhotos = missing === 0 ? String(plan.images.size) : `${plan.images.size}, ${missing} missing${keptMissing > 0 ? ` (${keptMissing} kept from this phone)` : ''}`;
  const empty = d.items.length === 0;
  const added = [...plan.addedCategories.map((c) => `category ${c}`), ...plan.addedTags.map((t) => `tag ${t}`)];
  const saved = plan.savedAt ? formatDateTime(plan.savedAt, now) + (plan.savedAtSource === 'file name' ? ' (from the file name)' : '') : 'unknown';
  const changed = phone.lastChangeAt === null ? 'unknown' : `changed ${formatDateTime(new Date(phone.lastChangeAt), now)}`;
  const since = plan.savedAt ? ` since ${formatIsoDate(localIsoDate(plan.savedAt))}` : ' since the backup was made';

  const backUpFirst = async () => {
    setBusy('Building the full backup…');
    try {
      const { result, name } = await exportBackup(db, 'full');
      const msg = exportMessage(result, name);
      if (msg) {
        setBackedUp(name);
        showToast(msg);
      }
    } catch (e) {
      showToast(`Couldn’t make the backup: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const replace = async () => {
    setBusy('Replacing everything…');
    try {
      const withPhotos = await applyRestore(db, plan);
      forgetAllThumbnails();
      showToast(`Restored ${plural(d.items.length, 'item')} and ${plural(withPhotos, 'photo')} from ${plan.fileName}.`);
      onClose();
    } catch (e) {
      setBusy(null);
      showToast(`Restore failed, nothing was changed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const rows: [string, string, string][] = [
    ['Items', String(phone.items), String(d.items.length)],
    ['Photos', String(phone.photos), backupPhotos],
    ['Areas', String(phone.areas), String(d.areas.length)],
    ['Spots', String(phone.spots), String(d.spots.length)],
    ['Bins', String(phone.bins), String(d.bins.length)],
    ['Saved', changed, saved],
  ];

  return (
    <Dialog label="Replace all inventory with this backup?" role="alertdialog" onClose={() => !busy && onClose()}>
      <h2 class="h2">Replace all inventory with this backup?</h2>
      <div class="mono small">
        {plan.fileName} · {formatBytes(plan.fileSize)} · {plan.format === 'v2' ? 'full backup from version 0.1.2' : 'full backup'}
      </div>
      <table class="cmp">
        <thead>
          <tr>
            <th />
            <th>On this phone now</th>
            <th>In the backup</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([k, a, b]) => (
            <tr key={k}>
              <th scope="row">{k}</th>
              <td>{a}</td>
              <td class={(k === 'Photos' && missing > 0) || (k === 'Items' && empty) ? 'attn' : undefined}>{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {(empty || missing > 0) && (
        <div class="bk-store warn" role="status">
          <Icon name="low" />
          <div>
            {empty && <p>This backup has no items. Restoring it leaves the inventory empty; only its lists come back.</p>}
            {missing > 0 && (
              <p>
                {plural(missing, 'photo')} named in the backup {missing === 1 ? 'is' : 'are'} missing from the ZIP.
                {keptMissing === 0 ? '' : missing === 1 ? ' This phone keeps its own photo for that item.' : ` This phone keeps its own photo for ${keptMissing} of them.`}
              </p>
            )}
          </div>
        </div>
      )}
      {(added.length > 0 || plan.warnings.length > 0) && (
        <ul class="small notes-list">
          {added.length > 0 && <li>Added to the lists because the items use them: {added.join(', ')}</li>}
          {plan.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      <p class="dlg-p">
        Everything on the phone is replaced. Changes and items added{since} will be lost unless you back up first.
      </p>
      <label class="tick">
        <input type="checkbox" checked={understood} disabled={!!busy} onChange={(e) => setUnderstood((e.currentTarget as HTMLInputElement).checked)} />
        <span>I understand this replaces everything{syncStatus().kind !== 'no-server' ? ', on every family phone' : ''}</span>
      </label>
      {backedUp && (
        <p class="dlg-p small">
          <Icon name="check" /> Backed up first: <span class="mono">{backedUp}</span>
        </p>
      )}
      <DialogActions>
        <button type="button" class="btn lg" disabled={!!busy} onClick={() => void backUpFirst()}>
          Back up this phone first
        </button>
        <button type="button" class="btn lg" data-autofocus disabled={!!busy} onClick={onClose}>
          Cancel
        </button>
      </DialogActions>
      <DialogActions>
        <button type="button" class="btn danger lg" disabled={!understood || !!busy} onClick={() => void replace()}>
          <Icon name="trash" />
          {busy ?? 'Replace everything'}
        </button>
      </DialogActions>
    </Dialog>
  );
}

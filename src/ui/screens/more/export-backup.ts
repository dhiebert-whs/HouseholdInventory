// Sending a backup off the phone (F18) from the Backup screen or the restore dialog.
import { buildBackup, recordBackup } from '../../../data/backup';
import type { InventoryDb } from '../../../data/db';
import { backupFileName, type BackupKind } from '../../../io/backup';
import { shareOrDownload, type ShareDeps, type ShareResult } from '../../../io/share';
import { fullImageFetcher } from '../../sync-runner';

/** Builds a backup and sends it off the phone; any export but a cancelled share resets the clock (F18). */
export async function exportBackup(db: InventoryDb, kind: BackupKind, deps?: ShareDeps): Promise<{ result: ShareResult; name: string }> {
  const now = new Date();
  const name = backupFileName(kind, now);
  const blob = await buildBackup(db, kind, now, fullImageFetcher());
  const file = new File([blob], name, { type: kind === 'full' ? 'application/zip' : 'text/csv' });
  const result = await shareOrDownload(file, 'Inventory backup', deps);
  if (result !== 'cancelled') await recordBackup(db, Date.now());
  return { result, name };
}

export function exportMessage(result: ShareResult, name: string): string | null {
  if (result === 'shared') return `Shared ${name}.`;
  // The reminder still resets, so say plainly that the file isn't safe yet.
  if (result === 'downloaded')
    return `Saved ${name} on this phone only. Send it to iCloud Drive or another device (Files › Share): a backup on the phone is lost with the phone.`;
  return null;
}

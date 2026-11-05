// Sync state on every screen (SPEC v3.0 F15, §12): a thin line ("Synced 2 min ago", "Offline ·
// 3 changes waiting", "Syncing…"), and banners when something needs the person: a refused
// change or a renumbered bin, a sign-in, or the first sync's choice (§12.1). Nothing on a copy
// with no server.
import { useContext, useState } from 'preact/hooks';
import type { InventoryDb } from '../../data/db';
import { dismissNotices, useServerData } from '../../data/sync';
import { goSignIn } from '../../io/signin';
import { DbContext, useNow } from '../data-hooks';
import { Icon } from '../icons';
import { exportBackup, exportMessage } from '../screens/more/export-backup';
import { syncLine, syncNow, useSync } from '../sync-runner';
import { showToast } from './toast';

export function SyncBanner() {
  const db = useContext(DbContext);
  return db ? <SyncState db={db} /> : null;
}

function SyncState({ db }: { db: InventoryDb }) {
  const v = useSync(db);
  const now = useNow(30_000);
  const [busy, setBusy] = useState(false);
  const line = syncLine(v, now);
  if (line === null) return null;

  const useServer = async () => {
    setBusy(true);
    try {
      // The phone's records are kept in a backup file first (§12.1).
      const { result, name } = await exportBackup(db, 'full');
      if (result === 'cancelled') return;
      const msg = exportMessage(result, name);
      if (msg) showToast(msg);
      await useServerData(db);
      syncNow();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {v.status.kind === 'choose' && (
        <div class="banner warm" role="alert">
          <Icon name="database" />
          <span class="grow">
            The family’s inventory is already on the server, and this phone has records of its own. Use the server’s data? This phone’s records are saved to a backup file first.
          </span>
          <button type="button" class="btn sm" disabled={busy} onClick={() => void useServer()}>
            Back up, then use the server’s
          </button>
        </div>
      )}
      {v.status.kind === 'signed-out' && (
        <div class="banner warm" role="status">
          <Icon name="lock" />
          <span class="grow">Signed out. The app keeps working, and changes wait on this phone until you sign in.</span>
          <button type="button" class="btn sm" onClick={goSignIn}>
            Sign in
          </button>
        </div>
      )}
      {v.notices.length > 0 && (
        <div class="banner warm" role="alert">
          <Icon name="info" />
          <span class="grow">
            {v.notices.map((n, i) => (
              <span key={i} class="block">
                {n.text}
              </span>
            ))}
          </span>
          <button type="button" class="btn sm" onClick={() => void dismissNotices(db)}>
            OK
          </button>
        </div>
      )}
      <button type="button" class="syncline" onClick={syncNow} aria-live="polite" title="Sync now">
        {line}
      </button>
    </>
  );
}

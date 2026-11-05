// Settings (F18): the backup reminder period; during the H5 spike, the sign-in check (§12.4).
// Sign-out and devices come with sync.
import { useEffect, useState } from 'preact/hooks';
import { isStandalone, loadSignInChecks, recordSignInCheck, type SignInCheck } from '../../../data/signin-log';
import { formatDateTime } from '../../../domain/dates';
import { checkSignIn, goSignIn, type SignIn } from '../../../io/signin';
import { plural } from '../../components/common';
import { REMINDER_DAYS_MAX, setSettings } from '../../../data/settings';
import { BackButton, TopBar } from '../../components/common';
import { useDb, useSettings } from '../../data-hooks';
import { href } from '../../shell/router';
import { getPart } from '../../part';
import { showToast } from '../../shell/toast';

export function SettingsScreen() {
  const db = useDb();
  const settings = useSettings();
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const value = draft ?? String(settings.reminderDays);
  const dirty = draft !== null && draft.trim() !== String(settings.reminderDays);

  const save = async () => {
    const t = value.trim();
    const n = Number(t);
    if (!/^\d+$/.test(t) || n > REMINDER_DAYS_MAX) {
      setError(`Backup reminder must be a whole number of days from 0 to ${REMINDER_DAYS_MAX} (0 turns it off)`);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await setSettings(db, { reminderDays: n });
      setDraft(null);
      showToast('Settings saved.');
    } catch (e) {
      showToast(`Couldn’t save the settings: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <TopBar
        title="Settings"
        back={<BackButton label="More" fallback={href.tab(getPart(), 'more')} />}
        actions={
          <button type="button" class="btn pri" disabled={!dirty || busy} onClick={() => void save()}>
            Save
          </button>
        }
      />
      <div class="fbody">
        <div class="setform card">
          <div class="setrow">
            <label class="lbl" for="set-reminder">
              Backup reminder
            </label>
            <div class="setin">
              <input
                id="set-reminder"
                class={error ? 'field setnum bad' : 'field setnum'}
                inputMode="numeric"
                value={value}
                disabled={busy}
                aria-invalid={error ? 'true' : undefined}
                aria-describedby="set-reminder-help"
                onInput={(e) => setDraft((e.currentTarget as HTMLInputElement).value)}
              />
              <span class="setunit">
                days <span class="small muted">(0–{REMINDER_DAYS_MAX})</span>
              </span>
            </div>
            <p class="small muted" id="set-reminder-help">
              The Inventory and Backup screens show a reminder when no backup has been made for this long. 0 turns the reminder off.
            </p>
            {error && (
              <p class="set-err" role="alert">
                {error}
              </p>
            )}
          </div>
        </div>
        <SignInCheckCard />
      </div>
    </>
  );
}

const DAY = 86_400_000;

function describe(r: SignIn, now: number): string {
  switch (r.kind) {
    case 'signed-in': {
      const left = r.expiresAt === null ? '' : ` · session ends ${formatDateTime(new Date(r.expiresAt), new Date(now))}`;
      const age = r.issuedAt === null ? '' : ` · signed in ${plural(Math.floor((now - r.issuedAt) / DAY), 'day')} ago`;
      return `Signed in as ${r.email}${age}${left}`;
    }
    case 'signed-out':
      return 'Signed out';
    case 'offline':
      return `Couldn’t reach the server (${r.message})`;
    case 'no-server':
      return 'This copy has no server (GitHub Pages). The sign-in check works on the workers.dev address.';
  }
}

/** H5 spike (§12.4): who this phone is signed in as, and every check so far. */
function SignInCheckCard() {
  const db = useDb();
  const [checks, setChecks] = useState<SignInCheck[]>([]);
  const [now, setNow] = useState<{ at: number; result: SignIn } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void loadSignInChecks(db).then(setChecks);
  }, [db]);
  const run = async () => {
    setBusy(true);
    const result = await checkSignIn();
    const at = Date.now();
    setNow({ at, result });
    if (result.kind !== 'no-server') setChecks(await recordSignInCheck(db, { at, result, standalone: isStandalone() }));
    setBusy(false);
  };
  useEffect(() => void run(), []);
  return (
    <div class="setform card">
      <div class="setrow">
        <span class="lbl">Sign-in check (H5 test)</span>
        <p class="small m0" role="status">
          {now ? describe(now.result, now.at) : 'Checking…'}
        </p>
        <p class="small muted m0">Opened {isStandalone() ? 'from the home screen' : 'in the browser'}.</p>
        <div class="inline-add">
          <button type="button" class="btn" disabled={busy} onClick={() => void run()}>
            Check now
          </button>
          {now?.result.kind === 'signed-out' && (
            <button type="button" class="btn pri" onClick={goSignIn}>
              Sign in
            </button>
          )}
        </div>
        {checks.length > 0 && (
          <details>
            <summary class="small">
              {plural(checks.length, 'check')} on this phone, first {formatDateTime(new Date(checks[checks.length - 1]!.at))}
            </summary>
            <ul class="small notes-list">
              {checks.map((c) => (
                <li key={c.at}>
                  {formatDateTime(new Date(c.at))} · {c.standalone ? 'home screen' : 'browser'} · {describe(c.result, c.at)}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}

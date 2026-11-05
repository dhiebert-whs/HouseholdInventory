// The H5 spike's record of sign-in checks on this phone (SPEC v3.0 §12.4): when each check ran and
// what it found, so a session lasting 30 days, or ending early, shows up. A device setting, never
// in a backup. Goes away with the spike.
import type { SignIn } from '../io/signin';
import type { InventoryDb } from './db';

const KEY = 'signinChecks';
export const SIGNIN_LOG_MAX = 60;

export interface SignInCheck {
  at: number;
  result: SignIn;
  /** The app was opened from the home screen, not in Safari. */
  standalone: boolean;
}

export async function loadSignInChecks(db: InventoryDb): Promise<SignInCheck[]> {
  const v = (await db.settings.get(KEY))?.value;
  return Array.isArray(v) ? (v as SignInCheck[]) : [];
}

/** Adds a check, newest first, keeping the last SIGNIN_LOG_MAX. */
export async function recordSignInCheck(db: InventoryDb, check: SignInCheck): Promise<SignInCheck[]> {
  const list = [check, ...(await loadSignInChecks(db))].slice(0, SIGNIN_LOG_MAX);
  await db.settings.put({ key: KEY, value: list });
  return list;
}

/** Opened from the home screen (iOS sets navigator.standalone; others match the display mode). */
export function isStandalone(): boolean {
  const nav = globalThis.navigator as Navigator & { standalone?: boolean };
  return nav?.standalone === true || globalThis.matchMedia?.('(display-mode: standalone)').matches === true;
}

const HOUR = 3_600_000;

/**
 * Records a check at launch and whenever the app comes back to the screen, at most once an hour,
 * so the log shows how long a session lasts without anyone remembering to tap. Not on a copy with
 * no server (GitHub Pages). Returns a stop function.
 */
export function watchSignIn(db: InventoryDb, check: () => Promise<SignIn>, host: Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'> = document): () => void {
  let last = 0;
  const run = async () => {
    if (host.visibilityState !== 'visible' || Date.now() - last < HOUR) return;
    last = Date.now();
    const result = await check();
    if (result.kind !== 'no-server') await recordSignInCheck(db, { at: Date.now(), result, standalone: isStandalone() });
  };
  const onShow = () => void run().catch(() => {});
  onShow();
  host.addEventListener('visibilitychange', onShow);
  return () => host.removeEventListener('visibilitychange', onShow);
}

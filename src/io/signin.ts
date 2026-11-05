// The sign-in check (SPEC v3.0 §12.4, H5 spike): asks the Worker who this phone is signed in as.
// Cloudflare Access answers for the Worker: with no session it redirects to its login page, which
// a fetch sees as an opaque redirect. GitHub Pages has no /api, so the check says so there.

export type SignIn =
  | { kind: 'signed-in'; email: string; issuedAt: number | null; expiresAt: number | null }
  | { kind: 'signed-out' }
  | { kind: 'offline'; message: string }
  | { kind: 'no-server' };

/** Reads a /api/whoami response. Pure, so it is unit-tested. */
export async function readWhoami(res: Pick<Response, 'type' | 'status' | 'ok' | 'headers' | 'json'>): Promise<SignIn> {
  if (res.type === 'opaqueredirect' || res.status === 401 || res.status === 403) return { kind: 'signed-out' };
  if (!res.ok || !(res.headers.get('content-type') ?? '').includes('application/json')) return { kind: 'no-server' };
  const body = (await res.json()) as { signedIn?: unknown; email?: unknown; issuedAt?: unknown; expiresAt?: unknown };
  if (body.signedIn !== true || typeof body.email !== 'string') return { kind: 'signed-out' };
  const time = (v: unknown) => (typeof v === 'number' ? v : null);
  return { kind: 'signed-in', email: body.email, issuedAt: time(body.issuedAt), expiresAt: time(body.expiresAt) };
}

export async function checkSignIn(fetcher: typeof fetch = fetch): Promise<SignIn> {
  try {
    return await readWhoami(await fetcher('api/whoami', { redirect: 'manual', cache: 'no-store', credentials: 'same-origin' }));
  } catch (e) {
    return { kind: 'offline', message: e instanceof Error ? e.message : String(e) };
  }
}

/** Signing in is a page load: Access shows its login, then the Worker sends the phone back to the app. */
export function goSignIn(): void {
  location.href = 'api/signin';
}

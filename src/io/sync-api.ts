// The phone's side of the sync API (SPEC v3.0 §12). Every call is same-origin, so Cloudflare
// Access's cookie goes with it; a signed-out phone gets Access's login redirect, which a fetch
// with redirect: 'manual' sees as an opaque redirect. GitHub Pages has no /api at all.
import type { Change, Person, PullResponse, PushResponse } from '../domain/sync';

/** No Access session: the person must sign in (a page load) before syncing again. */
export class SignedOutError extends Error {}
/** No network, or the server didn't answer. */
export class OfflineError extends Error {}
/** This copy of the app has no server (GitHub Pages, `npm run dev`). */
export class NoServerError extends Error {}

export interface SyncApi {
  pull(since: number): Promise<PullResponse>;
  push(changes: Change[]): Promise<PushResponse>;
  /** 'later': the photo's record isn't on the server yet. */
  upload(photoId: string, image: Blob, thumb: boolean): Promise<'ok' | 'later'>;
  /** null: not uploaded yet. */
  download(photoId: string, thumb: boolean): Promise<Blob | null>;
  rename(name: string): Promise<Person>;
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/** Throws the error a failed response stands for. */
function check(res: Response): Response {
  if (res.type === 'opaqueredirect' || res.status === 401 || res.status === 403) throw new SignedOutError('signed out');
  return res;
}

async function readJson<T>(res: Response): Promise<T> {
  check(res);
  if (!(res.headers.get('content-type') ?? '').includes('application/json')) throw new NoServerError('this copy has no server');
  const body = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body;
}

export function httpApi(fetcher: Fetch = (i, init) => fetch(i, init), base = 'api/'): SyncApi {
  const go = async (path: string, init: RequestInit = {}) => {
    try {
      return await fetcher(base + path, { redirect: 'manual', cache: 'no-store', credentials: 'same-origin', ...init });
    } catch (e) {
      throw new OfflineError(e instanceof Error ? e.message : String(e));
    }
  };
  const post = (path: string, body: unknown) => go(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return {
    pull: async (since) => readJson<PullResponse>(await go(`sync?since=${since}`)),
    // In pushRank order (pushOnce), which lets the server clear what links to a delete.
    push: async (changes) => readJson<PushResponse>(await post('push', { changes, ordered: true })),
    rename: async (name) => readJson<Person>(await post('me', { name })),
    async upload(photoId, image, thumb) {
      const res = check(await go(`files/${encodeURIComponent(photoId)}${thumb ? '?thumb=1' : ''}`, { method: 'PUT', headers: { 'content-type': image.type || 'image/jpeg' }, body: image }));
      if (res.status === 409) return 'later';
      await readJson(res);
      return 'ok';
    },
    async download(photoId, thumb) {
      const res = check(await go(`files/${encodeURIComponent(photoId)}${thumb ? '?thumb=1' : ''}`));
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.blob();
    },
  };
}

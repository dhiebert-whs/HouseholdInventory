// Stand-ins for the Worker's bindings in tests: D1 over Node's built-in SQLite (the same SQL
// engine D1 runs), R2 as a Map, and Access tokens signed with a key made for the test.
import { DatabaseSync } from 'node:sqlite';
import type { D1Database, R2Bucket } from '../worker/bindings';
import type { Env } from '../worker/index';

type Value = string | number | null;

class Stmt {
  constructor(
    private readonly sql: DatabaseSync,
    readonly q: string,
    readonly args: Value[] = [],
  ) {}
  bind(...args: Value[]) {
    return new Stmt(this.sql, this.q, args);
  }
  private reads() {
    return /^\s*select/i.test(this.q);
  }
  exec() {
    const st = this.sql.prepare(this.q);
    if (this.reads()) return { results: st.all(...this.args).map((r) => ({ ...r })), success: true };
    st.run(...this.args);
    return { results: [], success: true };
  }
  async first(col?: string) {
    const r = this.sql.prepare(this.q).get(...this.args) as Record<string, unknown> | undefined;
    if (!r) return null;
    return col ? (r[col] ?? null) : { ...r };
  }
  async all() {
    return this.exec();
  }
  async run() {
    return this.exec();
  }
}

export function fakeD1(): D1Database {
  const sql = new DatabaseSync(':memory:');
  return {
    prepare: (q: string) => new Stmt(sql, q),
    batch: async (stmts: Stmt[]) => {
      sql.exec('BEGIN');
      try {
        const out = stmts.map((s) => s.exec());
        sql.exec('COMMIT');
        return out;
      } catch (e) {
        sql.exec('ROLLBACK');
        throw e;
      }
    },
  } as unknown as D1Database;
}

export function fakeR2(): R2Bucket & { objects: Map<string, { bytes: Uint8Array<ArrayBuffer>; type: string }> } {
  const objects = new Map<string, { bytes: Uint8Array<ArrayBuffer>; type: string }>();
  return {
    objects,
    async put(key: string, value: ArrayBuffer, opts?: { httpMetadata?: { contentType?: string } }) {
      objects.set(key, { bytes: new Uint8Array(value), type: opts?.httpMetadata?.contentType ?? '' });
      return {};
    },
    async get(key: string) {
      const o = objects.get(key);
      return o ? { body: new Blob([o.bytes]).stream(), httpMetadata: { contentType: o.type } } : null;
    },
    async delete(keys: string | string[]) {
      for (const k of Array.isArray(keys) ? keys : [keys]) objects.delete(k);
    },
  } as unknown as R2Bucket & { objects: Map<string, { bytes: Uint8Array<ArrayBuffer>; type: string }> };
}

export const TEAM = 'test-team';
export const AUD = 'test-aud';

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64json = (o: object) => b64url(new TextEncoder().encode(JSON.stringify(o)));

/** A signing key, its public JWK (as Access publishes it), and a token maker. */
export async function accessKeys() {
  const pair = (await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid: 'k1' };
  const sign = async (payload: object, key: CryptoKey = pair.privateKey) => {
    const head = `${b64json({ alg: 'RS256', kid: 'k1' })}.${b64json(payload)}`;
    const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(head)));
    return `${head}.${b64url(sig)}`;
  };
  /** A valid token for this email, unless `over` changes it. */
  const token = (email: string, over: object = {}) => sign({ email, aud: [AUD], iss: `https://${TEAM}.cloudflareaccess.com`, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600, ...over });
  return { jwk, sign, token };
}

export function testEnv(): Env & { FILES: ReturnType<typeof fakeR2> } {
  return {
    ASSETS: { fetch: async (r: Request) => new Response(`asset ${new URL(r.url).pathname}`) },
    DB: fakeD1(),
    FILES: fakeR2(),
    ACCESS_TEAM: TEAM,
    ACCESS_AUD: AUD,
  };
}

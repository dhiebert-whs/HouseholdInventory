// The parts of the D1 and R2 bindings the Worker uses. The real bindings fit these; declaring
// them here keeps worker code importable by the app's tests, whose DOM types clash with
// @cloudflare/workers-types' globals.

export interface D1Stmt {
  bind(...values: (string | number | null)[]): D1Stmt;
  first<T = Record<string, unknown>>(column?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
}

export interface D1Database {
  prepare(query: string): D1Stmt;
  batch(statements: D1Stmt[]): Promise<unknown[]>;
}

export interface R2Object {
  body: ReadableStream;
  httpMetadata?: { contentType?: string };
}

export interface R2Bucket {
  get(key: string): Promise<R2Object | null>;
  put(key: string, value: ArrayBuffer, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  delete(keys: string | string[]): Promise<void>;
}

// Test doubles — minimal in-memory stand-ins for Workers bindings.
// Shared by endpoint tests so we can exercise worker.fetch without wrangler.

export interface RecordedStatement {
  sql: string;
  bindings: unknown[];
}

export interface CannedResponse {
  match: RegExp;
  rows: Record<string, unknown>[];
}

export class FakeD1 {
  statements: RecordedStatement[] = [];
  rows: Record<string, unknown>[] = [];
  failNext = false;
  /** Pattern-scoped canned rows — first match against the SQL wins. */
  canned: CannedResponse[] = [];
  /** Pattern-scoped errors, e.g. "no such column: status". Checked before canned. */
  failures: { match: RegExp; message: string }[] = [];
  private idSeq = 0;

  prepare(sql: string): FakeD1Statement {
    return new FakeD1Statement(this, sql);
  }

  record(sql: string, bindings: unknown[]): void {
    this.statements.push({ sql, bindings });
  }

  nextId(): number {
    return ++this.idSeq;
  }

  /** Stub a response for every statement whose SQL matches `match`. */
  on(match: RegExp, rows: Record<string, unknown>[]): this {
    this.canned.push({ match, rows });
    return this;
  }

  /** Fail every statement whose SQL matches `match` with a D1-style error. */
  failOn(match: RegExp, message: string): this {
    this.failures.push({ match, message });
    return this;
  }
}

class FakeD1Statement {
  private bindings: unknown[] = [];

  constructor(private db: FakeD1, private sql: string) {}

  bind(...args: unknown[]): this {
    this.bindings.push(...args);
    return this;
  }

  private resolveRows(): Record<string, unknown>[] {
    if (this.db.failNext) throw new Error("d1 unavailable (test)");
    const failure = this.db.failures.find((f) => f.match.test(this.sql));
    if (failure) throw new Error(failure.message);
    const canned = this.db.canned.find((c) => c.match.test(this.sql));
    if (canned) return canned.rows;
    return this.db.rows;
  }

  async first<T = unknown>(): Promise<T | null> {
    this.flush();
    return (this.resolveRows()[0] as T) ?? null;
  }

  async all<T = unknown>(): Promise<{ results: T[] }> {
    this.flush();
    return { results: this.resolveRows() as T[] };
  }

  async run(): Promise<{ success: boolean; meta: { last_row_id: number } }> {
    this.flush();
    if (this.db.failNext) throw new Error("d1 unavailable (test)");
    return { success: true, meta: { last_row_id: this.db.nextId() } };
  }

  private flush(): void {
    this.db.record(this.sql, this.bindings);
  }
}

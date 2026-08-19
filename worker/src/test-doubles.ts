// Test doubles — minimal in-memory stand-ins for Workers bindings.
// Shared by endpoint tests so we can exercise worker.fetch without wrangler.

export interface RecordedStatement {
  sql: string;
  bindings: unknown[];
}

export class FakeD1 {
  statements: RecordedStatement[] = [];
  rows: Record<string, unknown>[] = [];
  failNext = false;
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
}

class FakeD1Statement {
  private bindings: unknown[] = [];

  constructor(private db: FakeD1, private sql: string) {}

  bind(...args: unknown[]): this {
    this.bindings.push(...args);
    return this;
  }

  async first<T = unknown>(): Promise<T | null> {
    this.flush();
    if (this.db.failNext) throw new Error("d1 unavailable (test)");
    return (this.db.rows[0] as T) ?? null;
  }

  async all<T = unknown>(): Promise<{ results: T[] }> {
    this.flush();
    if (this.db.failNext) throw new Error("d1 unavailable (test)");
    return { results: this.db.rows as T[] };
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

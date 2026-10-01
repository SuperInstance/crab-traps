// Test doubles — minimal in-memory stand-ins for Workers bindings.
// Shared by endpoint tests so we can exercise worker.fetch without wrangler.

export interface RecordedStatement {
  sql: string;
  bindings: unknown[];
}

export interface CannedResponse {
  match: RegExp;
  /** Static rows, or a function of the statement's bindings (binding-aware). */
  rows: Record<string, unknown>[] | ((bindings: unknown[]) => Record<string, unknown>[]);
}

export class FakeD1 {
  statements: RecordedStatement[] = [];
  rows: Record<string, unknown>[] = [];
  failNext = false;
  /** Pattern-scoped canned rows — first match against the SQL wins. */
  canned: CannedResponse[] = [];
  /** Pattern-scoped errors, e.g. "no such column: status". Checked before canned. */
  failures: { match: RegExp; message: string }[] = [];
  /** Pattern-scoped run() meta.changes — how the breeding cron claims its hour. */
  runChanges: { match: RegExp; changes: number }[] = [];
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

  /** Stub a response for every statement whose SQL matches `match`.
   *  Later stubs win over earlier ones (same pattern = override). */
  on(
    match: RegExp,
    rows: Record<string, unknown>[] | ((bindings: unknown[]) => Record<string, unknown>[])
  ): this {
    this.canned.unshift({ match, rows });
    return this;
  }

  /** Fail every statement whose SQL matches `match` with a D1-style error. */
  failOn(match: RegExp, message: string): this {
    this.failures.push({ match, message });
    return this;
  }

  /** Stub the run() meta.changes for statements whose SQL matches `match`. */
  onRun(match: RegExp, changes: number): this {
    this.runChanges.unshift({ match, changes });
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
    if (canned) return typeof canned.rows === "function" ? canned.rows(this.bindings) : canned.rows;
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

  async run(): Promise<{ success: boolean; meta: { last_row_id: number; changes: number } }> {
    this.flush();
    if (this.db.failNext) throw new Error("d1 unavailable (test)");
    // Pattern failures apply to writes too — real D1 throws on constraint
    // violations (e.g. UNIQUE) from run(), not just from reads.
    const failure = this.db.failures.find((f) => f.match.test(this.sql));
    if (failure) throw new Error(failure.message);
    const rc = this.db.runChanges.find((r) => r.match.test(this.sql));
    return { success: true, meta: { last_row_id: this.db.nextId(), changes: rc?.changes ?? 1 } };
  }

  private flush(): void {
    this.db.record(this.sql, this.bindings);
  }
}

// --- Vectorize double: stores vectors, answers queries by real cosine ---

export interface FakeVectorRecord {
  id: string;
  values: number[];
  metadata?: Record<string, unknown>;
}

export interface FakeVectorMatch {
  id: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export class FakeVectorize {
  vectors: FakeVectorRecord[] = [];
  upserts: FakeVectorRecord[][] = [];
  queries: { values: number[]; options?: Record<string, unknown> }[] = [];

  async upsert(vectors: FakeVectorRecord[]): Promise<{ ids: string[]; count: number }> {
    this.upserts.push(vectors);
    for (const v of vectors) {
      const existing = this.vectors.findIndex((x) => x.id === v.id);
      if (existing >= 0) this.vectors[existing] = v;
      else this.vectors.push(v);
    }
    return { ids: vectors.map((v) => v.id), count: vectors.length };
  }

  async query(
    values: number[],
    options: { topK?: number } = {}
  ): Promise<{ matches: FakeVectorMatch[]; count: number }> {
    this.queries.push({ values, options });
    const mag = (v: number[]) => Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    const qmag = mag(values) || 1;
    const matches = this.vectors
      .map((v) => {
        const vmag = mag(v.values) || 1;
        let dot = 0;
        for (let i = 0; i < values.length; i++) dot += values[i] * v.values[i];
        return { id: v.id, score: dot / (qmag * vmag), metadata: v.metadata };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, options.topK ?? 5);
    return { matches, count: matches.length };
  }
}

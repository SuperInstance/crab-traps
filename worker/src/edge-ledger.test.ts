// Edge-ledger relay tests — the always-on synapse.
// Canonical JSON and the seal are pure; endpoints run through worker.fetch
// with the FakeD1 double, the same posture as endpoints.test.ts.
// FakeD1 returns canned rows for the prior-edge SELECT; the INSERT is only
// recorded, so chain semantics are tested against stubbed heads.

import { describe, it, expect, beforeEach } from "vitest";
import worker from "./index";
import { FakeD1 } from "./test-doubles";
import { canonicalJson, sha256Hex, edgeHash, validateEdgeInput, MAX_EDGE_BODY_BYTES } from "./edge-ledger";
import type { Env } from "./index-helpers";

let db: FakeD1;
let env: Env;

function makeEnv(): Env {
  return { DB: db as unknown as D1Database };
}

function call(path: string, init: RequestInit = {}): Promise<Response> {
  return worker.fetch(new Request(`http://localhost:8787${path}`, init), env, {} as ExecutionContext);
}

async function json(res: Response): Promise<any> {
  return JSON.parse(await res.text());
}

function edgeBody(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    v: 1,
    cell: "bilge.level",
    ts: 1_000,
    before: 40,
    after: 85,
    delta: { before: 40, after: 85, changed: true, magnitude: 45 },
    imbalance: 45,
    provenance: { origin: "push", caller: "bilge.adapter", trace: ["pump.should_run"] },
    chain: null,
    ...over,
  };
}

beforeEach(() => {
  db = new FakeD1();
  env = makeEnv();
});

// ── Canonical JSON (cell-ledger.md §4) ──────────────────────────────────────

describe("canonicalJson", () => {
  it("is compact and sorts keys recursively", () => {
    expect(canonicalJson({ b: 1, a: { z: [3, { y: null, x: "s" }] } })).toBe(
      `{"a":{"z":[3,{"x":"s","y":null}]},"b":1}`
    );
  });

  it("ignores insertion order — same object, same bytes", () => {
    const a = canonicalJson({ cell: "c", ts: 1, delta: { after: 2, before: 1 } });
    const b = canonicalJson({ delta: { before: 1, after: 2 }, ts: 1, cell: "c" });
    expect(a).toBe(b);
  });

  it("escapes strings via standard JSON escaping", () => {
    expect(canonicalJson({ s: 'a"b\nc' })).toBe(`{"s":"a\\"b\\nc"}`);
  });

  it("rejects non-finite numbers", () => {
    expect(() => canonicalJson({ x: Infinity })).toThrow();
  });
});

// ── The seal ────────────────────────────────────────────────────────────────

describe("edgeHash", () => {
  it("seals all fields except the chain link", async () => {
    const base = {
      v: 1,
      cell: "c",
      ts: 1_726_243_200_000,
      before: 40,
      after: 85,
      delta: { before: 40, after: 85, changed: true, magnitude: 45 },
      imbalance: 45,
      provenance: { origin: "push", caller: "x", trace: [] },
    };
    const h1 = await edgeHash(base);
    // 64 lowercase hex
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    // key order does not matter (canonical)
    expect(await edgeHash({ provenance: base.provenance, ts: base.ts, cell: base.cell, v: 1, before: base.before, delta: base.delta, after: base.after, imbalance: base.imbalance })).toBe(h1);
    // any sealed-field change changes the seal
    expect(await edgeHash({ ...base, after: 86 })).not.toBe(h1);
  });

  it("matches a known sha256 of the canonical form", async () => {
    const canonical = canonicalJson({ v: 1, cell: "c", ts: 1, before: null, after: null, delta: null, imbalance: null, provenance: null });
    expect(await edgeHash({ v: 1, cell: "c", ts: 1, before: null, after: null, delta: null, imbalance: null, provenance: null })).toBe(await sha256Hex(canonical));
  });
});

// ── Validation ──────────────────────────────────────────────────────────────

describe("validateEdgeInput", () => {
  it("accepts a well-formed edge", () => {
    const r = validateEdgeInput(edgeBody());
    expect(r.ok).toBe(true);
  });

  it("rejects wrong version, missing cell, bad ts", () => {
    expect(validateEdgeInput(edgeBody({ v: 2 })).ok).toBe(false);
    expect(validateEdgeInput(edgeBody({ cell: " " })).ok).toBe(false);
    expect(validateEdgeInput(edgeBody({ ts: "not-a-number" })).ok).toBe(false);
  });

  it("requires the four record fields but allows null values", () => {
    const noBefore = edgeBody();
    delete (noBefore as Record<string, unknown>).before;
    expect(validateEdgeInput(noBefore).ok).toBe(false);
    expect(validateEdgeInput(edgeBody({ before: null, after: null, delta: null, provenance: null })).ok).toBe(true);
  });

  it("allows imbalance null (unscored) but rejects non-numbers", () => {
    expect(validateEdgeInput(edgeBody({ imbalance: null })).ok).toBe(true);
    expect(validateEdgeInput(edgeBody({ imbalance: "big" })).ok).toBe(false);
  });

  it("requires chain to be 64-hex or null", () => {
    expect(validateEdgeInput(edgeBody({ chain: "abc" })).ok).toBe(false);
    expect(validateEdgeInput(edgeBody({ chain: "9F2C".repeat(16) })).ok).toBe(true); // normalized to lowercase
  });
});

// ── POST /edge ──────────────────────────────────────────────────────────────

describe("POST /edge", () => {
  it("records a genesis edge and returns the new chain head", async () => {
    db.on(/SELECT ts, edge_hash FROM ledger_edges/, []); // no prior edge
    const res = await call("/edge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(edgeBody()),
    });
    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.success).toBe(true);
    expect(body.chain_head).toMatch(/^[0-9a-f]{64}$/);
    // The INSERT carries the seal computed from the canonical form.
    const insert = db.statements.find((s) => s.sql.startsWith("INSERT INTO ledger_edges"));
    expect(insert).toBeTruthy();
    expect(insert!.bindings[insert!.bindings.length - 1]).toBe(body.chain_head);
  });

  it("appends when the incoming chain seals to the prior edge", async () => {
    const priorHash = await sha256Hex("prior");
    db.on(/SELECT ts, edge_hash FROM ledger_edges/, [{ ts: 999, edge_hash: priorHash }]);
    const res = await call("/edge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(edgeBody({ ts: 1_001, chain: priorHash })),
    });
    expect(res.status).toBe(201);
  });

  it("409s when the chain link does not seal to the prior edge", async () => {
    const priorHash = await sha256Hex("prior");
    db.on(/SELECT ts, edge_hash FROM ledger_edges/, [{ ts: 999, edge_hash: priorHash }]);
    const res = await call("/edge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(edgeBody({ ts: 1_001, chain: await sha256Hex("something-else") })),
    });
    expect(res.status).toBe(409);
    const body = await json(res);
    expect(body.error).toBe("chain broken");
    expect(body.expected_head).toBe(priorHash);
  });

  it("409s when a prior edge exists but no chain link is sent", async () => {
    db.on(/SELECT ts, edge_hash FROM ledger_edges/, [{ ts: 999, edge_hash: await sha256Hex("prior") }]);
    const res = await call("/edge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(edgeBody({ ts: 1_001, chain: null })),
    });
    expect(res.status).toBe(409);
  });

  it("409s on duplicate (cell, ts) via the PK violation", async () => {
    db.on(/SELECT ts, edge_hash FROM ledger_edges/, []);
    db.failOn(/INSERT INTO ledger_edges/, "UNIQUE constraint failed: ledger_edges.cell, ledger_edges.ts");
    const res = await call("/edge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(edgeBody()),
    });
    expect(res.status).toBe(409);
    expect((await json(res)).error).toBe("duplicate edge");
  });

  it("400s on invalid bodies and 413s on oversized ones", async () => {
    const bad = await call("/edge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(edgeBody({ v: 7 })),
    });
    expect(bad.status).toBe(400);
    const big = await call("/edge", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": String(MAX_EDGE_BODY_BYTES + 1) },
      body: "x",
    });
    expect(big.status).toBe(413);
  });

  it("503s honestly when D1 is down", async () => {
    db.failNext = true;
    const res = await call("/edge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(edgeBody()),
    });
    expect(res.status).toBe(503);
  });

  it("rejects non-POST methods", async () => {
    expect((await call("/edge")).status).toBe(405);
  });
});

// ── GET /edges — ledger + reconcile ─────────────────────────────────────────

function storedRow(over: Record<string, unknown> = {}) {
  return {
    v: 1,
    cell: "bilge.level",
    ts: 1_000,
    before: "40",
    after: "85",
    delta: `{"after":85,"before":40,"changed":true,"magnitude":45}`,
    imbalance: 45,
    provenance: `{"caller":"bilge.adapter","origin":"push","trace":["pump.should_run"]}`,
    chain: null,
    edge_hash: "a".repeat(64),
    received_at: "2026-08-20T00:00:00.000Z",
    ...over,
  };
}

describe("GET /edges", () => {
  it("requires the cell param", async () => {
    expect((await call("/edges")).status).toBe(400);
  });

  it("returns newest-first edges with the double-entry reconcile", async () => {
    db.on(/FROM ledger_edges WHERE cell = \? ORDER BY ts DESC/, [
      storedRow({ ts: 2_000, imbalance: 5, edge_hash: "b".repeat(64) }),
      storedRow({ ts: 1_000, imbalance: 45, edge_hash: "a".repeat(64) }),
    ]);
    const res = await call("/edges?cell=bilge.level");
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.count).toBe(2);
    expect(body.edges[0].ts).toBe(2_000); // newest first
    expect(body.edges[1].before).toBe(40); // canonical text parsed back to JSON
    expect(body.reconcile.total_imbalance).toBe(50); // accumulated prediction-error
    expect(body.reconcile.mean_imbalance).toBe(25);
    expect(body.reconcile.head).toBe("b".repeat(64));
  });

  it("counts unscored (null imbalance) entries without faking a number", async () => {
    db.on(/ORDER BY ts DESC/, [
      storedRow({ ts: 2_000, imbalance: null }),
      storedRow({ ts: 1_000, imbalance: 45 }),
    ]);
    const body = await json(await call("/edges?cell=bilge.level"));
    expect(body.reconcile.unscored).toBe(1);
    expect(body.reconcile.scored).toBe(1);
    expect(body.reconcile.total_imbalance).toBe(45);
  });

  it("verifies seals and chain links on ?verify=1", async () => {
    const older = { v: 1, cell: "bilge.level", ts: 1_000, before: 40, after: 85, delta: { after: 85, before: 40, changed: true, magnitude: 45 }, imbalance: 45, provenance: { origin: "push", caller: "bilge.adapter", trace: [] } };
    const olderHash = await edgeHash(older);
    const newer = { ...older, ts: 2_000, before: 85, after: 90, delta: { after: 90, before: 85, changed: true, magnitude: 5 }, imbalance: 5 };
    const newerHash = await edgeHash(newer);

    // Rows exactly as the relay stores them: canonical JSON text columns.
    const rowFromEdge = (e: Record<string, unknown>, chain: string | null, hash: string) => ({
      v: e.v,
      cell: e.cell,
      ts: e.ts,
      before: canonicalJson(e.before),
      after: canonicalJson(e.after),
      delta: canonicalJson(e.delta),
      imbalance: e.imbalance as number | null,
      provenance: canonicalJson(e.provenance),
      chain,
      edge_hash: hash,
      received_at: "2026-08-20T00:00:00.000Z",
    });

    db.on(/ORDER BY ts DESC/, [
      rowFromEdge(newer, olderHash, newerHash),
      rowFromEdge(older, null, olderHash),
    ]);
    const body = await json(await call("/edges?cell=bilge.level&verify=1"));
    expect(body.reconcile.chain_intact).toBe(true);
    expect(body.reconcile.first_break).toBeNull();

    // Tamper with one stored field and the walk catches it.
    db.on(/ORDER BY ts DESC/, [
      rowFromEdge(newer, olderHash, newerHash),
      rowFromEdge({ ...older, before: 41 }, null, olderHash), // 40 → 41, edited after the fact
    ]);
    const broken = await json(await call("/edges?cell=bilge.level&verify=1"));
    expect(broken.reconcile.chain_intact).toBe(false);
    expect(broken.reconcile.first_break).toContain("seal mismatch");
  });
});

// ── GET /queue — the wake-and-poll contract ─────────────────────────────────

describe("GET /queue", () => {
  it("drains edges strictly newer than the watermark, oldest-first", async () => {
    db.on(/WHERE ts > \? ORDER BY ts ASC/, [
      storedRow({ ts: 1_001, imbalance: 1 }),
      storedRow({ ts: 1_002, imbalance: 2 }),
    ]);
    const body = await json(await call("/queue?since=1000"));
    expect(body.count).toBe(2);
    expect(body.edges[0].ts).toBe(1_001);
    expect(body.edges[1].ts).toBe(1_002);
    expect(body.watermark).toBe(1_002);
    expect(body.has_more).toBe(false);
  });

  it("reports has_more when the page is full — keep draining, cortex", async () => {
    db.on(/WHERE ts > \? ORDER BY ts ASC/, [
      storedRow({ ts: 1_001 }),
      storedRow({ ts: 1_002 }),
    ]);
    const body = await json(await call("/queue?since=1000&limit=2"));
    expect(body.has_more).toBe(true);
  });

  it("returns the untouched watermark when the synapse is empty", async () => {
    db.on(/WHERE ts > \? ORDER BY ts ASC/, []);
    const body = await json(await call("/queue?since=12345"));
    expect(body.count).toBe(0);
    expect(body.watermark).toBe(12345);
  });

  it("defaults to draining from the beginning and validates since", async () => {
    const ok = await call("/queue");
    expect(ok.status).toBe(200);
    const bad = await call("/queue?since=bananas");
    expect(bad.status).toBe(400);
  });

  it("filters by cell when asked", async () => {
    db.on(/WHERE ts > \? AND cell = \?/, [storedRow({ ts: 1_001 })]);
    const body = await json(await call("/queue?since=1000&cell=bilge.level"));
    expect(body.count).toBe(1);
    const filter = db.statements.find((s) => s.sql.includes("AND cell = ?"));
    expect(filter?.bindings).toContain("bilge.level");
  });

  it("rejects non-GET methods", async () => {
    expect((await call("/queue", { method: "POST" })).status).toBe(405);
    expect((await call("/edges", { method: "POST" })).status).toBe(405);
  });
});

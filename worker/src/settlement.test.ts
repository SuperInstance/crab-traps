// Crab-credits settlement tests — the quilt-port's cell-scale writer.
// Pure validators, settleCredits, and the v0.2 verifyWalk are unit-tested; the
// route runs through worker.fetch with the FakeD1 double, same posture as
// edge-ledger.test.ts. The invariants under test:
//   1. a balanced settlement seals the credits cell (genesis head returned AND stored)
//   2. tampered input (sign-flip, unknown kind, empty batch) → 400, nothing written
//   3. over-spend → 400 — the balance never goes negative, nothing written
//   4. a second settlement carries the cell's WALKED prior seal (chain continuity)
//   5. v0.2 verify-walk: tampered middle edge → 409 zero writes; balance
//      discontinuity → 409; clean cell passes and settles; genesis passes
//   6. D1 down → 503, honest
//   7. the 201 response carries the settled batch as a public edge stream
//      slice — a stranger recomputes balance + head from it alone

import { describe, it, expect, beforeEach } from "vitest";
import worker from "./index";
import { FakeD1 } from "./test-doubles";
import { canonicalJson, edgeHash, sha256Hex, EdgeInput } from "./edge-ledger";
import {
  validateSettlementInput,
  settleCredits,
  verifyWalk,
  LedgerEdgeRow,
  MAX_SETTLE_BODY_BYTES,
} from "./settlement";
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

function entry(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { kind: "catch-submitted", amount: 1, ts: 1_000, ref: "catch#1", ...over };
}

function settleBody(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { player: "hermit-1", entries: [entry()], ...over };
}

const CELL_STREAM = /FROM ledger_edges WHERE cell = \? ORDER BY ts ASC/;
const EDGE_INSERT = /INSERT INTO ledger_edges/;

// Shape a settled batch exactly as the settlement route persists it (canonical
// JSON text columns, seal in edge_hash) — the public stream's stored form.
function rowize(cell: string, edges: { edge: EdgeInput; hash: string }[]): LedgerEdgeRow[] {
  return edges.map(({ edge, hash }) => ({
    v: edge.v,
    cell: edge.cell,
    ts: edge.ts,
    before: canonicalJson(edge.before),
    after: canonicalJson(edge.after),
    delta: canonicalJson(edge.delta),
    imbalance: edge.imbalance,
    provenance: canonicalJson(edge.provenance),
    chain: edge.chain,
    edge_hash: hash,
  }));
}

// A real genesis settlement batch to walk or can into the fake — the honest
// way to simulate a prior cell (hand-faked prior rows are exactly the defect
// v0.2 exists to refuse).
async function genesisBatch(player: string, entries: Record<string, unknown>[]) {
  const r = await settleCredits(
    player,
    entries as { kind: string; amount: number; ts: number; ref: string }[],
    { head: null, balance: 0 }
  );
  if (!r.ok) throw new Error("expected genesis batch to settle");
  return r.value;
}

beforeEach(() => {
  db = new FakeD1();
  env = makeEnv();
});

// ── validateSettlementInput: refuse tampered input before arithmetic ────────

describe("validateSettlementInput", () => {
  it("accepts a well-formed settlement", () => {
    const r = validateSettlementInput(settleBody());
    expect(r.ok).toBe(true);
  });

  it("rejects empty and non-array entries", () => {
    expect(validateSettlementInput(settleBody({ entries: [] })).ok).toBe(false);
    expect(validateSettlementInput(settleBody({ entries: "free credits" })).ok).toBe(false);
  });

  it("rejects a missing or empty player tag", () => {
    expect(validateSettlementInput({ entries: [entry()] }).ok).toBe(false);
    expect(validateSettlementInput(settleBody({ player: "///" })).ok).toBe(false);
  });

  it("rejects negative and zero amounts — no sign-flip mints", () => {
    expect(validateSettlementInput(settleBody({ entries: [entry({ amount: -1 })] })).ok).toBe(false);
    expect(validateSettlementInput(settleBody({ entries: [entry({ amount: 0 })] })).ok).toBe(false);
  });

  it("rejects kinds not registered in CREDIT_RATES", () => {
    const r = validateSettlementInput(settleBody({ entries: [entry({ kind: "god-mode" })] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("unknown kind 'god-mode'");
  });

  it("rejects bad ts, missing ref, and duplicate stamps (one edge per (cell, ts))", () => {
    expect(validateSettlementInput(settleBody({ entries: [entry({ ts: "soon" })] })).ok).toBe(false);
    expect(validateSettlementInput(settleBody({ entries: [entry({ ref: "" })] })).ok).toBe(false);
    expect(
      validateSettlementInput(
        settleBody({ entries: [entry(), entry({ ref: "catch#2" })] }) // same ts twice
      ).ok
    ).toBe(false);
  });

  it("rejects oversized batches", () => {
    const flood = Array.from({ length: 101 }, (_, i) => ({
      kind: "catch-submitted",
      amount: 1,
      ts: i,
      ref: `r${i}`,
    }));
    expect(validateSettlementInput(settleBody({ entries: flood })).ok).toBe(false);
  });
});

// ── settleCredits: entries → sealed double-entry edges ──────────────────────

describe("settleCredits", () => {
  const twoEntries = [
    { kind: "lure-forged", amount: 5, ts: 1_000, ref: "forge#9" },
    { kind: "quilt-compute-minute", amount: 2, ts: 2_000, ref: "compute#1" },
  ];

  it("computes running balances from the entries, with balanced edges (imbalance 0)", async () => {
    const r = await settleCredits("hermit-1", twoEntries);
    if (!r.ok) throw new Error("expected settlement to settle");
    const { edges, head, balance } = r.value;
    // earn 5 then spend 2: 0 → 5 → 3
    expect(edges[0].edge.before).toBe(0);
    expect(edges[0].edge.after).toBe(5);
    expect(edges[1].edge.before).toBe(5);
    expect(edges[1].edge.after).toBe(3);
    expect(balance).toBe(3);
    for (const { edge } of edges) {
      expect(edge.v).toBe(1);
      expect(edge.cell).toBe("arena.credits.hermit-1");
      expect(edge.imbalance).toBe(0); // before + signed === after, exactly
      expect(edge.provenance).toMatchObject({ origin: "arena-settlement", player: "hermit-1" });
    }
    expect(edges[0].edge.delta).toMatchObject({
      kind: "lure-forged",
      direction: "earn",
      amount: 5,
      signed: 5,
    });
    expect(edges[1].edge.delta).toMatchObject({ direction: "spend", signed: -2 });
  });

  it("seals the chain: null for genesis, every link the prior seal, every seal recomputable", async () => {
    const r = await settleCredits("hermit-1", twoEntries);
    if (!r.ok) throw new Error("expected settlement to settle");
    const { edges, head } = r.value;
    expect(edges[0].edge.chain).toBeNull();
    expect(edges[1].edge.chain).toBe(edges[0].hash);
    expect(head).toBe(edges[1].hash);
    for (const { edge, hash } of edges) {
      expect(hash).toBe(await edgeHash(edge)); // the EXACT relay seal
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("sorts out-of-order entries oldest-first before sealing", async () => {
    const r = await settleCredits("hermit-1", [twoEntries[1], twoEntries[0]]);
    if (!r.ok) throw new Error("expected settlement to settle");
    expect(r.value.edges.map((e) => e.edge.ts)).toEqual([1_000, 2_000]);
  });

  it("carries a prior cell state: the first new edge links the prior head and balance", async () => {
    const priorHead = "a".repeat(64);
    const r = await settleCredits("hermit-1", twoEntries, { head: priorHead, balance: 5 });
    if (!r.ok) throw new Error("expected settlement to settle");
    expect(r.value.edges[0].edge.chain).toBe(priorHead);
    expect(r.value.edges[0].edge.before).toBe(5);
    expect(r.value.balance).toBe(8);
  });

  it("refuses over-spend — credits never go negative", async () => {
    const r = await settleCredits("hermit-1", [
      { kind: "scenario-breed", amount: 4, ts: 1_000, ref: "breed#1" },
    ]);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected over-spend refusal");
    expect(r.error).toContain("over-spend");
  });
});

// ── verifyWalk (v0.2): the full chain walk before carry-in ──────────────────

describe("verifyWalk", () => {
  const twoEntries = [
    { kind: "lure-forged", amount: 5, ts: 1_000, ref: "forge#9" },
    { kind: "quilt-compute-minute", amount: 2, ts: 2_000, ref: "compute#1" },
  ];

  function rowsOf(batch: { edges: { edge: EdgeInput; hash: string }[] }): LedgerEdgeRow[] {
    return rowize("arena.credits.hermit-1", batch.edges);
  }

  async function handRow(
    cell: string,
    over: Partial<EdgeInput> & { ts: number }
  ): Promise<LedgerEdgeRow> {
    const edge: EdgeInput = {
      v: 1,
      cell,
      before: 0,
      after: 0,
      delta: { kind: "catch-submitted", ref: "r", direction: "earn", amount: 1, signed: 1 },
      imbalance: 0,
      provenance: { origin: "arena-settlement", player: "hermit-1" },
      chain: null,
      ...over,
    } as EdgeInput;
    return {
      v: edge.v,
      cell: edge.cell,
      ts: edge.ts,
      before: canonicalJson(edge.before),
      after: canonicalJson(edge.after),
      delta: canonicalJson(edge.delta),
      imbalance: edge.imbalance,
      provenance: canonicalJson(edge.provenance),
      chain: edge.chain,
      edge_hash: await edgeHash(edge),
    };
  }

  it("passes an empty stream as genesis (head null, balance 0)", async () => {
    const w = await verifyWalk([]);
    expect(w).toEqual({ ok: true, head: null, balance: 0, edges: 0 });
  });

  it("passes a clean batch and returns its head + final balance", async () => {
    const batch = await genesisBatch("hermit-1", twoEntries);
    const w = await verifyWalk(rowsOf(batch));
    expect(w.ok).toBe(true);
    if (w.ok) {
      expect(w.head).toBe(batch.head);
      expect(w.balance).toBe(3);
      expect(w.edges).toBe(2);
    }
  });

  it("catches a tampered middle edge by its seal (row index + ts + reason)", async () => {
    const batch = await genesisBatch("hermit-1", [
      { kind: "catch-submitted", amount: 1, ts: 100, ref: "c1" },
      { kind: "lure-forged", amount: 5, ts: 200, ref: "f1" },
      { kind: "gan-round", amount: 1, ts: 300, ref: "g1" },
    ]);
    const rows = rowsOf(batch);
    rows[1] = { ...rows[1], after: canonicalJson(99) }; // plausible wrong number
    const w = await verifyWalk(rows);
    expect(w.ok).toBe(false);
    if (!w.ok) {
      expect(w.row).toBe(1);
      expect(w.ts).toBe(200);
      expect(w.reason).toContain("seal mismatch");
    }
  });

  it("catches a balance discontinuity even when seals and links are intact", async () => {
    const cell = "arena.credits.hermit-1";
    const r1 = await handRow(cell, { ts: 100, before: 0, after: 3, delta: { kind: "catch-submitted", ref: "c1", direction: "earn", amount: 3, signed: 3 } });
    const r2 = await handRow(cell, { ts: 200, before: 5, after: 6, delta: { kind: "gan-round", ref: "g1", direction: "earn", amount: 1, signed: 1 }, chain: r1.edge_hash });
    const w = await verifyWalk([r1, r2]);
    expect(w.ok).toBe(false);
    if (!w.ok) {
      expect(w.row).toBe(1);
      expect(w.reason).toContain("opens at 5, prior edge closed at 3");
    }
  });

  it("refuses a genesis edge that opens at a nonzero balance — a stranger replays from zero", async () => {
    const r = await handRow("arena.credits.hermit-1", { ts: 100, before: 5, after: 6, delta: { kind: "gan-round", ref: "g1", direction: "earn", amount: 1, signed: 1 } });
    const w = await verifyWalk([r]);
    expect(w.ok).toBe(false);
    if (!w.ok) {
      expect(w.row).toBe(0);
      expect(w.reason).toContain("genesis balance");
    }
  });

  it("refuses a genesis edge that carries a chain link — a credits stream opens on null", async () => {
    const r = await handRow("arena.credits.hermit-1", { ts: 100, chain: "a".repeat(64) });
    const w = await verifyWalk([r]);
    expect(w.ok).toBe(false);
    if (!w.ok) {
      expect(w.row).toBe(0);
      expect(w.reason).toContain("genesis link");
    }
  });

  it("refuses a broken chain link mid-stream (row index + reason)", async () => {
    const cell = "arena.credits.hermit-1";
    const r1 = await handRow(cell, { ts: 100, after: 1 });
    const r2 = await handRow(cell, { ts: 200, before: 1, after: 2, chain: "f".repeat(64) });
    const w = await verifyWalk([r1, r2]);
    expect(w.ok).toBe(false);
    if (!w.ok) {
      expect(w.row).toBe(1);
      expect(w.reason).toContain("chain link mismatch");
    }
  });

  it("refuses a head that is not a balance (non-numeric after)", async () => {
    const cell = "arena.credits.hermit-1";
    const edge: EdgeInput = {
      v: 1,
      cell,
      ts: 100,
      before: 0,
      after: "rich" as unknown as number,
      delta: { kind: "gan-round", ref: "g1", direction: "earn", amount: 1, signed: 1 },
      imbalance: 0,
      provenance: { origin: "arena-settlement", player: "hermit-1" },
      chain: null,
    };
    const w = await verifyWalk([
      {
        v: 1,
        cell,
        ts: 100,
        before: "0",
        after: JSON.stringify("rich"),
        delta: canonicalJson(edge.delta),
        imbalance: 0,
        provenance: canonicalJson(edge.provenance),
        chain: null,
        edge_hash: await edgeHash(edge),
      },
    ]);
    expect(w.ok).toBe(false);
    if (!w.ok) expect(w.reason).toContain("not a number");
  });

  it("refuses an edge whose delta carries no signed amount", async () => {
    const r = await handRow("arena.credits.hermit-1", {
      ts: 100,
      delta: { note: "unscored", changed: ["mood"] },
    });
    const w = await verifyWalk([r]);
    expect(w.ok).toBe(false);
    if (!w.ok) expect(w.reason).toContain("delta.signed is not a number");
  });
});

// ── POST /arena/settle ───────────────────────────────────────────────────────

describe("POST /arena/settle", () => {
  it("405 on GET", async () => {
    expect((await call("/arena/settle")).status).toBe(405);
  });

  it("400 on invalid JSON", async () => {
    const res = await call("/arena/settle", { method: "POST", body: "not json" });
    expect(res.status).toBe(400);
  });

  it("413 on an oversized body", async () => {
    const res = await call("/arena/settle", {
      method: "POST",
      headers: { "content-length": String(MAX_SETTLE_BODY_BYTES + 1) },
      body: "x",
    });
    expect(res.status).toBe(413);
  });

  it("400s tampered input and writes nothing", async () => {
    for (const bad of [
      settleBody({ entries: [entry({ amount: -3 })] }), // sign-flip mint
      settleBody({ entries: [entry({ kind: "unregistered" })] }), // off-ledger kind
      settleBody({ entries: [] }), // empty batch
    ]) {
      const res = await call("/arena/settle", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(bad),
      });
      expect(res.status).toBe(400);
    }
    expect(db.statements.filter((s) => EDGE_INSERT.test(s.sql))).toHaveLength(0);
  });

  it("seals a balanced genesis settlement and returns the new chain head", async () => {
    const entries = [
      { kind: "catch-submitted", amount: 1, ts: 1_000, ref: "catch#1" },
      { kind: "lure-forged", amount: 5, ts: 2_000, ref: "forge#9" },
    ];
    const res = await call("/arena/settle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ player: "hermit-1", entries }),
    });
    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.success).toBe(true);
    expect(body.cell).toBe("arena.credits.hermit-1");
    expect(body.settled).toBe(2);
    expect(body.balance).toBe(6);
    expect(body.chain_head).toMatch(/^[0-9a-f]{64}$/);
    expect(body.note).toContain("genesis");

    // Stranger recompute: the house head is exactly what the public function
    // derives from the entries alone — no trust in the arena required.
    const replay = await settleCredits("hermit-1", entries, { head: null, balance: 0 });
    if (!replay.ok) throw new Error("expected replay to settle");
    expect(body.chain_head).toBe(replay.value.head);

    // Stored through the SAME D1 pattern the relay uses: canonical JSON text
    // columns, seal in edge_hash, genesis chain null.
    const inserts = db.statements.filter((s) => EDGE_INSERT.test(s.sql));
    expect(inserts).toHaveLength(2);
    const first = inserts[0].bindings;
    expect(first[0]).toBe(1); // v
    expect(first[1]).toBe("arena.credits.hermit-1"); // cell
    expect(first[3]).toBe(canonicalJson(0)); // before
    expect(first[4]).toBe(canonicalJson(1)); // after
    expect(first[5]).toBe(canonicalJson(replay.value.edges[0].edge.delta));
    expect(first[6]).toBe(0); // imbalance — balanced
    expect(first[8]).toBeNull(); // genesis chain
    expect(first[9]).toBe(replay.value.edges[0].hash); // seal stored in edge_hash
  });

  it("carries the cell's WALKED prior state on the second settlement (chain continuity)", async () => {
    // The prior cell is a REAL settlement batch, stored exactly as the relay
    // stores it — the walk must carry its head + balance in, not a canned
    // "plausible" number (that trust was the v0.1 defect).
    const prior = await genesisBatch("hermit-1", [
      { kind: "lure-forged", amount: 5, ts: 500, ref: "forge#1" },
      { kind: "gan-round", amount: 1, ts: 900, ref: "gan#1" },
    ]);
    db.on(CELL_STREAM, rowize("arena.credits.hermit-1", prior.edges) as unknown as Record<string, unknown>[]);
    const res = await call("/arena/settle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        player: "hermit-1",
        entries: [{ kind: "gan-round", amount: 1, ts: 1_000, ref: "gan#3" }],
      }),
    });
    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.balance).toBe(7); // walked in 6 (5 + 1), earned 1
    expect(body.note).toContain("prior seal");

    const insert = db.statements.find((s) => EDGE_INSERT.test(s.sql))!;
    expect(insert.bindings[8]).toBe(prior.head); // chain link = the walked prior seal
    expect(insert.bindings[3]).toBe(canonicalJson(6)); // before = walked balance
    expect(insert.bindings[4]).toBe(canonicalJson(7)); // after
  });

  it("409s a tampered middle edge and writes nothing — a tampered head is refused, never trusted", async () => {
    const batch = await genesisBatch("hermit-1", [
      { kind: "catch-submitted", amount: 1, ts: 100, ref: "catch#1" },
      { kind: "lure-forged", amount: 5, ts: 200, ref: "forge#9" },
      { kind: "gan-round", amount: 1, ts: 300, ref: "gan#1" },
    ]);
    const rows = rowize("arena.credits.hermit-1", batch.edges);
    // Tamper the middle row's stored `after` (6 → 9): the seal no longer
    // recomputes — exactly the "plausible wrong number" the v0.1 carry-in
    // trusted.
    rows[1] = { ...rows[1], after: canonicalJson(9) };
    db.on(CELL_STREAM, rows as unknown as Record<string, unknown>[]);

    const res = await call("/arena/settle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        player: "hermit-1",
        entries: [{ kind: "gan-round", amount: 1, ts: 1_000, ref: "gan#3" }],
      }),
    });
    expect(res.status).toBe(409);
    const body = await json(res);
    expect(body.error).toBe("cell verify-walk failed");
    expect(body.row).toBe(1);
    expect(body.ts).toBe(200);
    expect(body.detail).toContain("seal mismatch");
    expect(db.statements.filter((s) => EDGE_INSERT.test(s.sql))).toHaveLength(0);
  });

  it("409s a balance discontinuity even when every seal and link is intact", async () => {
    // Hand-sealed rows whose seals are honest over their own (wrong) numbers:
    // edge 1 closes at 3, edge 2 opens at 5. The seal recomputes, the chain
    // links — only the walk's balance continuity catches it. This is the
    // v0.1 hole, priced and closed.
    const cell = "arena.credits.hermit-1";
    const e1: EdgeInput = {
      v: 1,
      cell,
      ts: 100,
      before: 0,
      after: 3,
      delta: { kind: "catch-submitted", ref: "catch#1", direction: "earn", amount: 3, signed: 3 },
      imbalance: 0,
      provenance: { origin: "arena-settlement", player: "hermit-1", kind: "catch-submitted", ref: "catch#1" },
      chain: null,
    };
    const h1 = await edgeHash(e1);
    const e2: EdgeInput = {
      v: 1,
      cell,
      ts: 200,
      before: 5,
      after: 6,
      delta: { kind: "gan-round", ref: "gan#1", direction: "earn", amount: 1, signed: 1 },
      imbalance: 0,
      provenance: { origin: "arena-settlement", player: "hermit-1", kind: "gan-round", ref: "gan#1" },
      chain: h1,
    };
    const h2 = await edgeHash(e2);
    db.on(CELL_STREAM, [
      { v: 1, cell, ts: 100, before: "0", after: "3", delta: canonicalJson(e1.delta), imbalance: 0, provenance: canonicalJson(e1.provenance), chain: null, edge_hash: h1 },
      { v: 1, cell, ts: 200, before: "5", after: "6", delta: canonicalJson(e2.delta), imbalance: 0, provenance: canonicalJson(e2.provenance), chain: h1, edge_hash: h2 },
    ]);

    const res = await call("/arena/settle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        player: "hermit-1",
        entries: [{ kind: "gan-round", amount: 1, ts: 1_000, ref: "gan#3" }],
      }),
    });
    expect(res.status).toBe(409);
    const body = await json(res);
    expect(body.error).toBe("cell verify-walk failed");
    expect(body.row).toBe(1);
    expect(body.detail).toContain("balance discontinuity");
    expect(body.detail).toContain("opens at 5");
    expect(db.statements.filter((s) => EDGE_INSERT.test(s.sql))).toHaveLength(0);
  });

  it("201 response carries the settled batch as a public edge stream — a stranger recomputes head + balance from it alone", async () => {
    const entries = [
      { kind: "catch-submitted", amount: 1, ts: 1_000, ref: "catch#1" },
      { kind: "lure-forged", amount: 5, ts: 2_000, ref: "forge#9" },
      { kind: "quilt-compute-minute", amount: 2, ts: 3_000, ref: "compute#1" },
    ];
    const res = await call("/arena/settle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ player: "hermit-1", entries }),
    });
    expect(res.status).toBe(201);
    const body = await json(res);

    // Stranger recompute, in the driver's own idiom: from the RETURNED public
    // edge stream alone (canonical JSON + the published seal), no D1 state,
    // no house internals — recompute every seal, walk every link, replay
    // every balance step.
    let balance = 0;
    let prior: string | null = null;
    for (const e of body.edges) {
      const sealed = {
        v: e.v,
        cell: e.cell,
        ts: e.ts,
        before: e.before,
        after: e.after,
        delta: e.delta,
        imbalance: e.imbalance,
        provenance: e.provenance,
      };
      const seal = await sha256Hex(canonicalJson(sealed));
      expect(seal).toBe(e.edge_hash); // every seal recomputes
      expect(e.chain).toBe(prior); // every link continuous, genesis null
      balance += e.delta.signed;
      expect(e.after).toBe(balance); // every balance step verifies
      prior = e.edge_hash;
    }
    expect(balance).toBe(body.balance); // 1 earned, 5 earned, 2 spent → 4
    expect(prior).toBe(body.chain_head);
  });

  it("400s over-spend and writes nothing — the ledger never records an unwind", async () => {
    const res = await call("/arena/settle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        player: "hermit-1",
        entries: [{ kind: "scenario-breed", amount: 4, ts: 1_000, ref: "breed#1" }],
      }),
    });
    expect(res.status).toBe(400);
    expect((await json(res)).error).toContain("over-spend");
    expect(db.statements.filter((s) => EDGE_INSERT.test(s.sql))).toHaveLength(0);
  });

  it("503s honestly when D1 is down", async () => {
    db.failNext = true;
    const res = await call("/arena/settle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(settleBody()),
    });
    expect(res.status).toBe(503);
    expect((await json(res)).error).toBe("settlement storage unavailable");
  });

  it("409s when a stamp collides on the relay's (cell, ts) primary key", async () => {
    db.failOn(EDGE_INSERT, "UNIQUE constraint failed: ledger_edges.cell, ledger_edges.ts");
    const res = await call("/arena/settle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(settleBody()),
    });
    expect(res.status).toBe(409);
    expect((await json(res)).error).toBe("duplicate edge");
  });
});

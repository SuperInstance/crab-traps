// Crab-credits settlement tests — the quilt-port's cell-scale writer.
// Pure validators and settleCredits are unit-tested; the route runs through
// worker.fetch with the FakeD1 double, same posture as edge-ledger.test.ts.
// The invariants under test:
//   1. a balanced settlement seals the credits cell (genesis head returned AND stored)
//   2. tampered input (sign-flip, unknown kind, empty batch) → 400, nothing written
//   3. over-spend → 400 — the balance never goes negative, nothing written
//   4. a second settlement carries the cell's prior seal (chain continuity)
//   5. D1 down → 503, honest

import { describe, it, expect, beforeEach } from "vitest";
import worker from "./index";
import { FakeD1 } from "./test-doubles";
import { canonicalJson, edgeHash } from "./edge-ledger";
import { validateSettlementInput, settleCredits, MAX_SETTLE_BODY_BYTES } from "./settlement";
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

const PRIOR_SELECT = /SELECT ts, edge_hash, "after" AS prior_after FROM ledger_edges WHERE cell/;
const EDGE_INSERT = /INSERT INTO ledger_edges/;

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

  it("carries the cell's prior seal on the second settlement (chain continuity)", async () => {
    const priorHash = "b".repeat(64);
    db.on(PRIOR_SELECT, [{ ts: 900, edge_hash: priorHash, prior_after: "5" }]);
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
    expect(body.balance).toBe(6); // carried 5, earned 1
    expect(body.note).toContain("prior seal");

    const insert = db.statements.find((s) => EDGE_INSERT.test(s.sql))!;
    expect(insert.bindings[8]).toBe(priorHash); // chain link = the cell's prior seal
    expect(insert.bindings[3]).toBe(canonicalJson(5)); // before = carried balance
    expect(insert.bindings[4]).toBe(canonicalJson(6)); // after
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

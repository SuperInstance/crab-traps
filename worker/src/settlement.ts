// Crab-credits settlement — the quilt-port's first cell-scale writer
// (docs/ARENA-V0.md §L3). The arena needs no new plumbing: a settled credit is
// a double-entry edge on `arena.credits.<player>`, sealed with the SAME relay
// contract as POST /edge (cell-ledger.md §4 — one canonicalization, one chain
// rule, one reef). The route is the sealing authority for the settlement the
// way the relay is the sealing authority for the limb: the client names only
// player + entries; balances, cell, delta, imbalance, chain and seal are
// computed server-side and returned as the new chain head, so a producer only
// ever echoes back what the house handed it.
//
// Honest-economy rules, priced here so they cannot be argued later:
//   - amounts are strictly positive — a negative "earn" is a sign-flip mint
//     and is refused (validateSettlementInput)
//   - kinds must be registered in CREDIT_RATES (arena.ts) — the tavern rule:
//     nothing is earnable or spendable that was not priced before the fact
//   - the running balance never goes negative — compute is bought with earned
//     credits, never on credit (settleCredits over-spend check)
//   - every edge is balanced by construction (before + signed === after, so
//     imbalance = 0) — a stranger recomputes the balance from the stream alone,
//     which is exactly the claim SCN-001 exists to attack

import { Env, jsonResponse } from "./index-helpers";
import { CREDIT_RATES, sanitizePlayer } from "./arena";
import { EdgeInput, canonicalJson, edgeHash } from "./edge-ledger";

// Same DoS posture as /edge: bodies are tiny by contract; gate before parse.
export const MAX_SETTLE_BODY_BYTES = 100_000;
// Bounded batch: one settlement is one player's session reconcile, not a dump.
export const MAX_SETTLE_ENTRIES = 100;

export interface SettleEntry {
  kind: string;
  amount: number;
  ts: number;
  ref: string;
}

export interface SettlementInput {
  player: string;
  entries: SettleEntry[];
}

export interface CellPrior {
  /** The cell's current chain head seal — null when the cell is untouched (genesis). */
  head: string | null;
  /** The carried-in balance: the prior edge's `after` (0 for genesis). */
  balance: number;
}

export interface SettledEdge {
  edge: EdgeInput;
  hash: string;
}

export interface SettledResult {
  cell: string;
  edges: SettledEdge[];
  head: string;
  balance: number;
}

type ValidationResult =
  | { ok: true; value: SettlementInput }
  | { ok: false; error: string };

const REGISTERED_KINDS = [...Object.keys(CREDIT_RATES.earn), ...Object.keys(CREDIT_RATES.spend)];

// --- Validation: refuse tampered input before any arithmetic happens ---------

export function validateSettlementInput(body: unknown): ValidationResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "body must be a JSON object" };
  }
  const b = body as Record<string, unknown>;
  const player = sanitizePlayer(b.player);
  if (!player) {
    return { ok: false, error: "field 'player' is required: [a-zA-Z0-9_-]{1,40}" };
  }
  if (!Array.isArray(b.entries) || b.entries.length === 0) {
    return {
      ok: false,
      error: "field 'entries' must be a non-empty array of {kind, amount, ts, ref} entries",
    };
  }
  if (b.entries.length > MAX_SETTLE_ENTRIES) {
    return {
      ok: false,
      error: `too many entries (max ${MAX_SETTLE_ENTRIES} per settlement)`,
    };
  }

  const entries: SettleEntry[] = [];
  const seenTs = new Set<number>();
  for (let i = 0; i < b.entries.length; i++) {
    const raw = b.entries[i];
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      return { ok: false, error: `entries[${i}] must be an object {kind, amount, ts, ref}` };
    }
    const e = raw as Record<string, unknown>;

    if (
      typeof e.kind !== "string" ||
      (!(e.kind in CREDIT_RATES.earn) && !(e.kind in CREDIT_RATES.spend))
    ) {
      return {
        ok: false,
        error: `entries[${i}]: unknown kind '${String(e.kind)}' — kinds are registered at /arena/credits before they can settle (${REGISTERED_KINDS.join(", ")})`,
      };
    }

    if (typeof e.amount !== "number" || !Number.isFinite(e.amount) || e.amount <= 0) {
      return {
        ok: false,
        error: `entries[${i}]: 'amount' must be a positive finite number (negative amounts are refused — a credit is earned or spent, never minted from a sign flip)`,
      };
    }

    if (typeof e.ts !== "number" || !Number.isFinite(e.ts)) {
      return { ok: false, error: `entries[${i}]: 'ts' must be a finite number (epoch millis)` };
    }
    // One edge per (cell, ts) is the relay's primary key — duplicate stamps in
    // one batch would collide mid-write. Refuse up front, write nothing.
    if (seenTs.has(e.ts)) {
      return {
        ok: false,
        error: `entries[${i}]: duplicate ts ${e.ts} — one edge per (cell, ts) on the relay; stamps must be distinct`,
      };
    }
    seenTs.add(e.ts);

    if (typeof e.ref !== "string" || !e.ref.trim()) {
      return { ok: false, error: `entries[${i}]: 'ref' is required (what earned or spent this)` };
    }
    if (e.ref.length > 256) {
      return { ok: false, error: `entries[${i}]: 'ref' too long (max 256 chars)` };
    }

    entries.push({ kind: e.kind, amount: e.amount, ts: e.ts, ref: e.ref });
  }

  return { ok: true, value: { player, entries } };
}

// --- settleCredits: entries → sealed double-entry edges ----------------------
//
// Earn/spend entries become one edge each on `arena.credits.<player>`:
//   before/after — the running balance (carried in from the cell's prior edge)
//   delta        — {kind, ref, direction, amount, signed}
//   imbalance    — 0: every pair balances by construction
//   provenance   — {origin: "arena-settlement", player, kind, ref}
//   chain        — the prior seal (null for the first edge ever on the cell)
// Edges are sealed oldest-first, each link pointing at the prior seal, so a
// batch and a stranger's replay agree byte for byte.

export async function settleCredits(
  player: string,
  entries: SettleEntry[],
  prior: CellPrior = { head: null, balance: 0 }
): Promise<{ ok: true; value: SettledResult } | { ok: false; error: string }> {
  const cell = `arena.credits.${player}`;
  const ordered = [...entries].sort((a, b) => a.ts - b.ts);

  const edges: SettledEdge[] = [];
  let running = prior.balance;
  let chain = prior.head;

  for (const e of ordered) {
    const direction = e.kind in CREDIT_RATES.earn ? "earn" : "spend";
    const signed = direction === "earn" ? e.amount : -e.amount;
    const before = running;
    const after = before + signed;
    if (after < 0) {
      return {
        ok: false,
        error: `over-spend: entry at ts ${e.ts} ('${e.kind}', ref '${e.ref}') would take the balance to ${after} — crab-credits never go negative; spend less or earn more`,
      };
    }
    running = after;

    const edge: EdgeInput = {
      v: 1,
      cell,
      ts: e.ts,
      before,
      after,
      delta: { kind: e.kind, ref: e.ref, direction, amount: e.amount, signed },
      // Balanced by construction: before + signed === after, exactly.
      imbalance: 0,
      provenance: { origin: "arena-settlement", player, kind: e.kind, ref: e.ref },
      chain,
    };
    const hash = await edgeHash(edge);
    edges.push({ edge, hash });
    chain = hash;
  }

  return {
    ok: true,
    value: {
      cell,
      edges,
      head: edges[edges.length - 1].hash,
      balance: running,
    },
  };
}

// --- POST /arena/settle -------------------------------------------------------
//
// Body: { player, entries: [{kind, amount, ts, ref}, ...] } →
// 201 { success, cell, settled, balance, chain_head, ... } with every edge
// persisted through the SAME D1 pattern the relay uses (canonical JSON text
// columns, seal in edge_hash, chain link pointing at the cell's prior head).

export async function handleSettlementPost(
  request: Request,
  env: Env,
  cors: Record<string, string>
): Promise<Response> {
  const declaredLength = parseInt(request.headers.get("content-length") || "0", 10);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_SETTLE_BODY_BYTES) {
    return jsonResponse(
      { success: false, error: `body too large (max ${MAX_SETTLE_BODY_BYTES} bytes)` },
      413,
      cors
    );
  }
  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > MAX_SETTLE_BODY_BYTES) {
      return jsonResponse(
        { success: false, error: `body too large (max ${MAX_SETTLE_BODY_BYTES} bytes)` },
        413,
        cors
      );
    }
    body = JSON.parse(raw);
  } catch {
    return jsonResponse({ success: false, error: "invalid JSON body" }, 400, cors);
  }

  const v = validateSettlementInput(body);
  if (!v.ok) return jsonResponse({ success: false, error: v.error }, 400, cors);
  const { player, entries } = v.value;
  const cell = `arena.credits.${player}`;

  try {
    // The carried-in state comes from the cell itself, never from the client:
    // the prior edge's seal is the chain link, its `after` is the opening
    // balance. A client-declared balance is exactly the tamper the seal
    // exists to catch.
    const prior = await env.DB.prepare(
      `SELECT ts, edge_hash, "after" AS prior_after FROM ledger_edges WHERE cell = ? ORDER BY ts DESC LIMIT 1`
    )
      .bind(cell)
      .first<{ ts: number; edge_hash: string; prior_after: string }>();

    let priorState: CellPrior = { head: null, balance: 0 };
    if (prior) {
      const carried = JSON.parse(prior.prior_after);
      if (typeof carried !== "number" || !Number.isFinite(carried)) {
        return jsonResponse(
          {
            success: false,
            error: "cell head is not a balance",
            detail: `the cell's latest edge at ts ${prior.ts} does not carry a numeric 'after' — the credits cell is compromised; settle nothing until it is verified`,
          },
          503,
          cors
        );
      }
      priorState = { head: prior.edge_hash, balance: carried };
    }

    const settled = await settleCredits(player, entries, priorState);
    if (!settled.ok) {
      // Over-spend: refused before anything is written — the ledger never
      // records an edge it would have to unwind.
      return jsonResponse({ success: false, error: settled.error }, 400, cors);
    }
    const { edges, head, balance } = settled.value;

    for (const { edge, hash } of edges) {
      await env.DB.prepare(
        `INSERT INTO ledger_edges (v, cell, ts, "before", "after", delta, imbalance, provenance, chain, edge_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          edge.v,
          edge.cell,
          edge.ts,
          canonicalJson(edge.before),
          canonicalJson(edge.after),
          canonicalJson(edge.delta),
          edge.imbalance,
          canonicalJson(edge.provenance),
          edge.chain,
          hash
        )
        .run();
    }

    return jsonResponse(
      {
        success: true,
        recorded: true,
        cell,
        player,
        settled: edges.length,
        balance,
        ts: edges[edges.length - 1].edge.ts,
        chain_head: head,
        note: prior
          ? "settlement appended — the chain carries the cell's prior seal"
          : "genesis settlement — credits cell opened at the relay",
      },
      201,
      cors
    );
  } catch (err: any) {
    const msg = err?.message || String(err);
    if (msg.includes("UNIQUE") || msg.includes("PRIMARY KEY")) {
      return jsonResponse(
        {
          success: false,
          error: "duplicate edge",
          detail: `cell '${cell}' already has an edge at one of the entry timestamps — one edge per (cell, ts)`,
        },
        409,
        cors
      );
    }
    return jsonResponse(
      { success: false, error: "settlement storage unavailable", detail: msg },
      503,
      cors
    );
  }
}

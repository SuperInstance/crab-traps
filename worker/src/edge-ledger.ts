// Edge-ledger relay — the always-on synapse (docs: fleet-as-fractal-jepa.md,
// cell-ledger.md). The ESP32 reflex arc pushes double-entry edges; D1 buffers
// them; the codespace cortex polls when it wakes. The limb never blocks, the
// brain never listens. Routes:
//   POST /edge          — append one edge for a cell, chain-validated
//   GET  /edges?cell=   — a cell's ledger, newest-first, with the reconcile
//   GET  /queue?since=  — edges since a watermark (the wake-and-poll contract)
//
// Chain rule (cell-ledger.md §4): each edge's seal is
//   sha256_hex(canonical_json(edge minus its chain field))
// and the next edge for that cell must carry the prior seal in `chain`.
// The relay is the sealing authority: every POST response returns the new
// head (`chain_head`), so a producer only ever echoes back what the relay
// handed it — no cross-language canonicalization guesswork on the limb.

import { Env, jsonResponse } from "./index-helpers";

// Same DoS posture as /catches: bodies are tiny by contract; gate before parse.
export const MAX_EDGE_BODY_BYTES = 100_000;

export interface EdgeInput {
  v: number;
  cell: string;
  ts: number;
  before: unknown;
  after: unknown;
  delta: unknown;
  imbalance: number | null;
  provenance: unknown;
  chain: string | null;
}

// The fields sealed into edge_hash. `chain` is excluded — it points AT a
// seal, it is not part of one (same rule as hash(e) over e minus its hash).
const SEALED_FIELDS = ["v", "cell", "ts", "before", "after", "delta", "imbalance", "provenance"] as const;

// --- Canonical JSON (cell-ledger.md §4) ---
// compact, no whitespace; object keys sorted by code-point order (identical
// to UTF-8 byte order for valid Unicode); integers rendered as integers;
// strings via standard JSON escaping. Known hazard (same doc): JS cannot
// distinguish 40 from 40.0 after parsing, so integral numbers render bare.
// The relay stays self-consistent — it seals and re-verifies with this one
// function, and hands producers the head hash — so the hazard never bites
// the loop.

function compareKeys(a: string, b: string): number {
  const A = Array.from(a);
  const B = Array.from(b);
  const n = Math.min(A.length, B.length);
  for (let i = 0; i < n; i++) {
    const d = A[i].codePointAt(0)! - B[i].codePointAt(0)!;
    if (d !== 0) return d;
  }
  return A.length - B.length;
}

export function canonicalJson(value: unknown): string {
  return serializeCanonical(value);
}

function serializeCanonical(v: unknown): string {
  if (v === null) return "null";
  switch (typeof v) {
    case "boolean":
      return v ? "true" : "false";
    case "number":
      if (!Number.isFinite(v)) throw new Error("non-finite number is not canonicalizable");
      return String(v);
    case "string":
      return JSON.stringify(v);
    case "object":
      if (Array.isArray(v)) return `[${v.map(serializeCanonical).join(",")}]`;
      return `{${Object.keys(v as Record<string, unknown>)
        .sort(compareKeys)
        .map((k) => `${JSON.stringify(k)}:${serializeCanonical((v as Record<string, unknown>)[k])}`)
        .join(",")}}`;
    default:
      throw new Error(`value of type ${typeof v} is not canonicalizable`);
  }
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function sealedEdgeObject(e: Omit<EdgeInput, "chain">): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const f of SEALED_FIELDS) obj[f] = (e as Record<string, unknown>)[f];
  return obj;
}

export async function edgeHash(e: Omit<EdgeInput, "chain">): Promise<string> {
  return sha256Hex(canonicalJson(sealedEdgeObject(e)));
}

// --- Validation ---

const HEX64 = /^[0-9a-f]{64}$/;

export function validateEdgeInput(
  body: unknown
): { ok: true; value: EdgeInput } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "body must be a JSON object" };
  }
  const b = body as Record<string, unknown>;
  if (b.v !== 1) return { ok: false, error: "field 'v' must be 1" };

  const cell = typeof b.cell === "string" ? b.cell.trim() : "";
  if (!cell) return { ok: false, error: "field 'cell' is required (non-empty string)" };
  if (cell.length > 256) return { ok: false, error: "field 'cell' too long (max 256 chars)" };

  if (typeof b.ts !== "number" || !Number.isFinite(b.ts)) {
    return { ok: false, error: "field 'ts' must be a finite number (epoch millis recommended)" };
  }

  for (const f of ["before", "after", "delta", "provenance"] as const) {
    if (!(f in b)) return { ok: false, error: `field '${f}' is required` };
  }

  let imbalance: number | null = null;
  if (b.imbalance !== null) {
    if (typeof b.imbalance !== "number" || !Number.isFinite(b.imbalance)) {
      return { ok: false, error: "field 'imbalance' must be a finite number or null (null = unscored)" };
    }
    imbalance = b.imbalance;
  }

  let chain: string | null = null;
  if (b.chain !== null && b.chain !== undefined) {
    if (typeof b.chain !== "string" || !HEX64.test(b.chain.trim().toLowerCase())) {
      return { ok: false, error: "field 'chain' must be a 64-char sha256 hex string or null (null = genesis edge)" };
    }
    chain = b.chain.trim().toLowerCase();
  }

  const value: EdgeInput = {
    v: 1,
    cell,
    ts: b.ts,
    before: b.before,
    after: b.after,
    delta: b.delta,
    imbalance,
    provenance: b.provenance,
    chain,
  };
  try {
    canonicalJson(sealedEdgeObject(value));
  } catch (err: any) {
    return { ok: false, error: `edge is not canonically serializable: ${err?.message || err}` };
  }
  return { ok: true, value };
}

// --- Row shaping (stored canonical text → served JSON) ---

interface EdgeRow {
  v: number;
  cell: string;
  ts: number;
  before: string;
  after: string;
  delta: string;
  imbalance: number | null;
  provenance: string;
  chain: string | null;
  edge_hash: string;
  received_at: string;
}

const EDGE_COLUMNS = `v, cell, ts, "before", "after", delta, imbalance, provenance, chain, edge_hash, received_at`;

function rowToEdge(row: EdgeRow) {
  return {
    v: row.v,
    cell: row.cell,
    ts: row.ts,
    before: JSON.parse(row.before),
    after: JSON.parse(row.after),
    delta: JSON.parse(row.delta),
    imbalance: row.imbalance,
    provenance: JSON.parse(row.provenance),
    chain: row.chain,
    edge_hash: row.edge_hash,
    received_at: row.received_at,
  };
}

// Re-derive an edge's seal from its stored columns — parse of canonical text
// is a fixed point of canonicalJson, so this reproduces the INSERT-time hash
// exactly unless the row was tampered with.
async function verifyRow(row: EdgeRow): Promise<string> {
  return edgeHash({
    v: row.v,
    cell: row.cell,
    ts: row.ts,
    before: JSON.parse(row.before),
    after: JSON.parse(row.after),
    delta: JSON.parse(row.delta),
    imbalance: row.imbalance,
    provenance: JSON.parse(row.provenance),
  });
}

// --- POST /edge — the limb pushes, the synapse holds ---

export async function handleEdgePost(
  request: Request,
  env: Env,
  cors: Record<string, string>
): Promise<Response> {
  const declaredLength = parseInt(request.headers.get("content-length") || "0", 10);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_EDGE_BODY_BYTES) {
    return jsonResponse(
      { success: false, error: `body too large (max ${MAX_EDGE_BODY_BYTES} bytes)` },
      413,
      cors
    );
  }
  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > MAX_EDGE_BODY_BYTES) {
      return jsonResponse(
        { success: false, error: `body too large (max ${MAX_EDGE_BODY_BYTES} bytes)` },
        413,
        cors
      );
    }
    body = JSON.parse(raw);
  } catch {
    return jsonResponse({ success: false, error: "invalid JSON body" }, 400, cors);
  }

  const v = validateEdgeInput(body);
  if (!v.ok) return jsonResponse({ success: false, error: v.error }, 400, cors);
  const e = v.value;

  const hash = await edgeHash(e);

  try {
    const prior = await env.DB.prepare(
      `SELECT ts, edge_hash FROM ledger_edges WHERE cell = ? ORDER BY ts DESC LIMIT 1`
    )
      .bind(e.cell)
      .first<{ ts: number; edge_hash: string }>();

    if (prior) {
      if (e.chain === null) {
        return jsonResponse(
          {
            success: false,
            error: "chain broken",
            detail: "cell has a prior edge but the incoming edge carries no chain link",
            cell: e.cell,
            expected_head: prior.edge_hash,
            prior_ts: prior.ts,
          },
          409,
          cors
        );
      }
      if (e.chain !== prior.edge_hash) {
        return jsonResponse(
          {
            success: false,
            error: "chain broken",
            detail: "incoming chain link does not seal to the cell's prior edge",
            cell: e.cell,
            expected_head: prior.edge_hash,
            prior_ts: prior.ts,
          },
          409,
          cors
        );
      }
    }
    // No prior edge: genesis append — any chain value is recorded as sent.

    await env.DB.prepare(
      `INSERT INTO ledger_edges (v, cell, ts, "before", "after", delta, imbalance, provenance, chain, edge_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        e.v,
        e.cell,
        e.ts,
        canonicalJson(e.before),
        canonicalJson(e.after),
        canonicalJson(e.delta),
        e.imbalance,
        canonicalJson(e.provenance),
        e.chain,
        hash
      )
      .run();

    return jsonResponse(
      {
        success: true,
        recorded: true,
        cell: e.cell,
        ts: e.ts,
        chain_head: hash,
        note: prior
          ? "edge appended — the synapse holds it for the cortex"
          : "genesis edge — cell ledger opened at the relay",
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
          detail: `cell '${e.cell}' already has an edge at ts ${e.ts} — one edge per (cell, ts)`,
        },
        409,
        cors
      );
    }
    return jsonResponse(
      { success: false, error: "edge storage unavailable", detail: msg },
      503,
      cors
    );
  }
}

// --- GET /edges — a cell's ledger, newest-first, with the reconcile ---

export async function handleEdgeList(
  url: URL,
  env: Env,
  cors: Record<string, string>
): Promise<Response> {
  const cell = (url.searchParams.get("cell") || "").trim();
  if (!cell) {
    return jsonResponse(
      { success: false, error: "query param 'cell' is required (the ledger is per-cell)" },
      400,
      cors
    );
  }
  const limitRaw = parseInt(url.searchParams.get("limit") || "50", 10);
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 50, 1), 500);
  const verify = ["1", "true", "yes"].includes((url.searchParams.get("verify") || "").toLowerCase());

  try {
    const { results } = await env.DB.prepare(
      `SELECT ${EDGE_COLUMNS} FROM ledger_edges WHERE cell = ? ORDER BY ts DESC LIMIT ?`
    )
      .bind(cell, limit)
      .all<EdgeRow>();
    const rows = (results ?? []).slice().sort((a, b) => b.ts - a.ts);

    // Double-entry reconcile: the imbalance series is the cell's P/L —
    // accumulated prediction-error (surprise). NULL imbalances are unscored
    // entries (genesis edges); they never fake a number.
    const scored = rows.filter((r) => r.imbalance !== null);
    const totalImbalance = scored.reduce((s, r) => s + (r.imbalance ?? 0), 0);
    const reconcile: Record<string, unknown> = {
      entries: rows.length,
      scored: scored.length,
      unscored: rows.length - scored.length,
      total_imbalance: totalImbalance,
      mean_imbalance: scored.length ? totalImbalance / scored.length : null,
      head: rows[0]?.edge_hash ?? null,
    };

    if (verify) {
      // Walk oldest-first: recompute every seal, check every link between
      // consecutive rows in the window. The window's oldest chain link
      // points outside the slice and is reported, not checked.
      let chainIntact = true;
      let firstBreak: string | null = null;
      const oldestFirst = [...rows].reverse();
      for (let i = 0; i < oldestFirst.length; i++) {
        const row = oldestFirst[i];
        const recomputed = await verifyRow(row);
        if (recomputed !== row.edge_hash) {
          chainIntact = false;
          firstBreak = `seal mismatch at ts ${row.ts}: stored ${row.edge_hash}, recomputed ${recomputed}`;
          break;
        }
        if (i > 0 && row.chain !== oldestFirst[i - 1].edge_hash) {
          chainIntact = false;
          firstBreak = `chain link mismatch at ts ${row.ts}: links ${row.chain}, prior seal ${oldestFirst[i - 1].edge_hash}`;
          break;
        }
      }
      reconcile.chain_intact = chainIntact;
      reconcile.first_break = firstBreak;
    }

    return jsonResponse(
      {
        success: true,
        cell,
        count: rows.length,
        edges: rows.map(rowToEdge),
        reconcile,
      },
      200,
      cors
    );
  } catch (err: any) {
    return jsonResponse(
      { success: false, error: "edge storage unavailable", detail: err?.message || String(err) },
      503,
      cors
    );
  }
}

// --- GET /queue — the cortex wakes and polls ---

export async function handleQueuePoll(
  url: URL,
  env: Env,
  cors: Record<string, string>
): Promise<Response> {
  const sinceRaw = url.searchParams.get("since");
  let since = 0;
  if (sinceRaw !== null && sinceRaw.trim() !== "") {
    const parsed = Number(sinceRaw);
    if (!Number.isFinite(parsed)) {
      return jsonResponse(
        { success: false, error: "query param 'since' must be a timestamp (epoch millis)" },
        400,
        cors
      );
    }
    since = parsed;
  }
  const limitRaw = parseInt(url.searchParams.get("limit") || "100", 10);
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 100, 1), 500);
  const cell = (url.searchParams.get("cell") || "").trim();

  try {
    // Oldest-first: the cortex replays in ledger (chain) order.
    const stmt = cell
      ? env.DB.prepare(
          `SELECT ${EDGE_COLUMNS} FROM ledger_edges WHERE ts > ? AND cell = ? ORDER BY ts ASC LIMIT ?`
        ).bind(since, cell, limit)
      : env.DB.prepare(
          `SELECT ${EDGE_COLUMNS} FROM ledger_edges WHERE ts > ? ORDER BY ts ASC LIMIT ?`
        ).bind(since, limit);
    const { results } = await stmt.all<EdgeRow>();
    const rows = results ?? [];

    // The watermark: what to pass as ?since= next wake. has_more tells the
    // cortex to keep draining until the synapse is empty.
    const watermark = rows.length ? rows[rows.length - 1].ts : since;
    return jsonResponse(
      {
        success: true,
        since,
        watermark,
        count: rows.length,
        has_more: rows.length === limit,
        edges: rows.map(rowToEdge),
      },
      200,
      cors
    );
  } catch (err: any) {
    return jsonResponse(
      { success: false, error: "edge storage unavailable", detail: err?.message || String(err) },
      503,
      cors
    );
  }
}

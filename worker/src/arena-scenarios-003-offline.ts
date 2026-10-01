// SCN-003 · OFFLINE ARMS — the economy-of-honesty chamber's deterministic half
// (wave 40-d, lane arena-smith-r4; adopted + completed from the dead lane
// 39-d's untracked partial driver, exactly as pre-registered).
//
// The registration is worker/src/arena-scenarios-003-run.json (commit c2696e4,
// "pricing-first", committed BEFORE any attack was measured). It fixes the
// arms, the cost model, the naive verifiers, the budget, and the kill rule:
//
//   one attempt  = a fixed attacker op-budget W = 10000 ops against ONE honest cell
//   T_arm        = forged entries per attempt that PASS the arm's naive verifier
//   D            = (T_unsigned − T_signed) / T_unsigned, T_signed = the attacker's
//                  BEST strategy across the registered signed attacks
//   SURVIVE      iff D >= 0.20 in BOTH registered hash weightings (h=1, h=100)
//   KILL         iff D < 0.20 in either
//
// The offline arms are llm:"NONE" — deterministic scripts vs naive verifiers;
// the ratio is arithmetic, not opinion. Op counters are counted in code AS THE
// ATTACKS RUN (measured, not asserted by fiat). Nothing in this module imports
// a test runner; the tests (arena-scenarios-003-offline.test.ts) assert that
// the arithmetic REPRODUCES the sealed verdict rows — the verdict itself is
// whatever the arithmetic says, and is not hardcoded anywhere.
//
// Registered cost model, implemented verbatim:
//   write_op  = setting one JSON field value (an entry/edge is built field by
//               field; identical rule both arms)
//   hash_op   = one sha256Hex over the house sealed-field grammar
//   h1        = 1 hash-op = 1 write-op (the attacker-favorable absurd extreme)
//   h100      = 1 hash-op = 100 write-ops (the hardware-honest weighting)
//   A1_append      4 write-ops per fake entry (kind, amount, ts, ref)
//   A2_mutate      1 write-op per mutated entry (amount)
//   B1_lazy        2 write-ops (delta.amount, delta.signed), rehash NOTHING
//   B2_extend_head 16 field writes + 1 hash-op per fake edge. The registration
//                  fixes the count at 16 and lists "cell, ts, before, after,
//                  delta{5}, imbalance, provenance{4}, chain" (= 15); the
//                  missing one is `v` — an edge IS built field by field
//                  including v=1, and the honest builder sets it too. Resolved
//                  as the registered NUMBER (16, v included).
//   B3_midchain    per forged entry: 2 own delta writes + 2 own balance writes
//                  + own hash, plus per downstream edge 3 writes (before, after,
//                  chain) + 1 hash. The two own balance writes are implemented
//                  as the mutated edge's (before, after) pair — `before` is
//                  re-set to the unchanged running balance (the attacker
//                  rewrites the row field by field; identical rule both arms).
//                  Either reading of the registration's second balance write
//                  costs identically, and B2 dominates B3 at both weightings
//                  either way, so T_signed is unaffected by the reading.
//   The registration names edge j=20 for B3's shape; the kill rule's
//   operationalization gives the attacker its BEST strategy, so B3 iterates
//   the mutation point from the tail backward (suffix repairs are cheapest
//   there) — the honest best, not the strawman.

import * as fs from "node:fs";
import { edgeHash } from "./edge-ledger";
import { validateSettlementInput, MAX_SETTLE_ENTRIES } from "./settlement";

// --- the pre-registration, read back (drift-proof) ----------------------------

export function loadRegistration(): any {
  const candidates = [
    "src/arena-scenarios-003-run.json", // vitest run from worker/
    "/home/z/my-project/download/crab-traps/worker/src/arena-scenarios-003-run.json",
  ];
  for (const p of candidates) {
    try {
      return JSON.parse(fs.readFileSync(p, "utf-8"));
    } catch {
      /* try next */
    }
  }
  throw new Error("pre-registration file not found — the run refuses to proceed unregistered");
}

export const REG: any = loadRegistration();
export const W_OPS: number = REG.pre_registered_kill.cost_model.W_ops; // 10000
export const H_WEIGHTS: [number, number] = [1, 100]; // h1 attacker-favorable, h100 hardware-honest
export const KILL_RULE_VERBATIM: string = REG.pre_registered_kill.rule_verbatim;
export const KILL_RULE_OPERATIONALIZATION: string = REG.pre_registered_kill.operationalization;

// --- the honest cell: the house's own edge-ledger grammar ---------------------

export interface PlainEntry {
  kind: string;
  amount: number;
  ts: number;
  ref: string;
}
export interface EdgeDelta {
  kind: string;
  ref: string;
  direction: string;
  amount: number;
  signed: number;
}
export interface EdgeProvenance {
  origin: string;
  player: string;
  kind: string;
  ref: string;
}
export interface SealedEdge {
  v: number;
  cell: string;
  ts: number;
  before: number;
  after: number;
  delta: EdgeDelta;
  imbalance: number;
  provenance: EdgeProvenance;
  chain: string | null;
  edge_hash: string;
}

export const CELL_PLAYER = "honest-cell-r9";
export const CELL = `arena.credits.${CELL_PLAYER}`;
export const E_EDGES = 40;
export const LURE_ID = "scn-003-first-run"; // receipt trail — NOT a claim filing
const T0 = 1_700_000_000_000;

// seal = sha256 over canonical JSON of exactly the SEALED_FIELDS (v, cell, ts,
// before, after, delta, imbalance, provenance) — the house's own published
// primitive (edge-ledger.edgeHash, the same function settlement seals with).
// `chain` is excluded: it points AT a seal, it is not part of one.
export async function sealEdge(e: Omit<SealedEdge, "edge_hash">): Promise<string> {
  return edgeHash({
    v: e.v,
    cell: e.cell,
    ts: e.ts,
    before: e.before,
    after: e.after,
    delta: e.delta,
    imbalance: e.imbalance,
    provenance: e.provenance,
  });
}

export async function buildHonestCell(): Promise<{ edges: SealedEdge[]; entries: PlainEntry[] }> {
  const edges: SealedEdge[] = [];
  const entries: PlainEntry[] = [];
  let chain: string | null = null;
  let balance = 0;
  for (let i = 0; i < E_EDGES; i++) {
    const ts = T0 + i * 1000;
    const ref = `${LURE_ID}#E${i + 1}`;
    const base: Omit<SealedEdge, "edge_hash"> = {
      v: 1,
      cell: CELL,
      ts,
      before: balance,
      after: balance + 1,
      delta: { kind: "gan-round", ref, direction: "earn", amount: 1, signed: 1 },
      imbalance: 0,
      provenance: { origin: "arena-settlement", player: CELL_PLAYER, kind: "gan-round", ref },
      chain,
    };
    const edge_hash = await sealEdge(base);
    edges.push({ ...base, edge_hash });
    entries.push({ kind: "gan-round", amount: 1, ts, ref });
    chain = edge_hash;
    balance += 1;
  }
  return { edges, entries };
}

// --- the naive verifiers (exactly as registered) ------------------------------

// Arm A's naive verifier: the house's OWN pre-chain check — schema-level only
// (known kinds, positive finite amounts, finite ts, distinct ts, non-empty
// refs), exactly what settlement validated before the v0.2 chain walk. Batches
// cap at the route's own MAX_SETTLE_ENTRIES (100): the attacker batches like
// anyone else would.
export function verifyUnsigned(forged: PlainEntry[]): {
  ok: boolean;
  passed: number;
  batches: number;
  first_error: string | null;
} {
  let passed = 0;
  const batches = Math.max(1, Math.ceil(forged.length / MAX_SETTLE_ENTRIES));
  for (let off = 0; off < forged.length; off += MAX_SETTLE_ENTRIES) {
    const batch = forged.slice(off, off + MAX_SETTLE_ENTRIES);
    const r = validateSettlementInput({ player: CELL_PLAYER, entries: batch });
    if (!r.ok) return { ok: false, passed, batches, first_error: r.error };
    passed += batch.length;
  }
  return { ok: true, passed, batches, first_error: null };
}

// Arm B's naive verifier: the documented stranger walk (arena-gan-live.test.ts
// pattern) — recompute every edge_hash from the SEALED_FIELDS via
// canonicalJson + sha256Hex, check chain-link continuity (genesis null), check
// balance continuity (before = running balance, after = before + delta.signed).
export interface WalkResult {
  ok: boolean;
  edges_checked: number;
  first_failure: { index: number; why: string } | null;
}
export async function walkChain(edges: SealedEdge[]): Promise<WalkResult> {
  let prior: string | null = null;
  let balance = 0;
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    const resealed = await sealEdge(e);
    if (resealed !== e.edge_hash)
      return {
        ok: false,
        edges_checked: i + 1,
        first_failure: { index: i, why: "seal: recomputed edge_hash ≠ filed edge_hash" },
      };
    if (e.chain !== prior)
      return {
        ok: false,
        edges_checked: i + 1,
        first_failure: { index: i, why: "link: chain does not point at the prior seal" },
      };
    if (e.before !== balance)
      return {
        ok: false,
        edges_checked: i + 1,
        first_failure: { index: i, why: "balance: before ≠ running balance" },
      };
    if (e.after !== e.before + e.delta.signed)
      return {
        ok: false,
        edges_checked: i + 1,
        first_failure: { index: i, why: "continuity: after ≠ before + delta.signed" },
      };
    prior = e.edge_hash;
    balance = e.after;
  }
  return { ok: true, edges_checked: edges.length, first_failure: null };
}

// --- the attacks (deterministic scripts; ops counted AS SPENT, not by fiat) --

export interface AttackResult {
  strategy: string;
  ops_spent_writeops: number; // write-op equivalents (1 hash-op = h write-ops)
  hash_calls: number;
  forged: number;
  passed: number;
  detail: string;
}

// A1: append schema-valid fake earns. 4 field-writes each (kind, amount, ts, ref).
export async function attackA1(W: number): Promise<AttackResult> {
  const fakes: PlainEntry[] = [];
  let ops = 0;
  let n = 0;
  while (ops + 4 <= W) {
    fakes.push({
      kind: "gan-round",
      amount: 500,
      ts: T0 + 50_000 + n,
      ref: `${LURE_ID}#FAKE-${n + 1}`,
    });
    ops += 4;
    n++;
  }
  const v = verifyUnsigned(fakes);
  return {
    strategy: "A1_append",
    ops_spent_writeops: ops,
    hash_calls: 0,
    forged: n,
    passed: v.ok ? v.passed : 0,
    detail: v.ok
      ? "every batch validated — the schema-level verifier is blind to forgery by construction"
      : `refused: ${v.first_error}`,
  };
}

// A2: mutate existing entries' amounts. 1 field-write each; bounded by cell size.
export async function attackA2(entries: PlainEntry[], W: number): Promise<AttackResult> {
  let ops = 0;
  let forged = 0;
  const mutated = entries.map((e) => {
    if (ops + 1 <= W) {
      ops += 1;
      forged += 1;
      return { ...e, amount: 9999 };
    }
    return e;
  });
  const v = verifyUnsigned(mutated);
  return {
    strategy: "A2_mutate",
    ops_spent_writeops: ops,
    hash_calls: 0,
    forged,
    passed: v.ok ? v.passed : 0,
    detail: v.ok
      ? "mutated amounts re-validate — nothing but schema exists to catch them"
      : `refused: ${v.first_error}`,
  };
}

// B1: lazy mutate — no rehash. The walk's first seal check catches it.
export async function attackB1(edges: SealedEdge[]): Promise<AttackResult> {
  const copy: SealedEdge[] = structuredClone(edges);
  copy[19].delta.amount = 500; // mid-chain edge (the registration's j=20, 1-based)
  copy[19].delta.signed = 500;
  const walk = await walkChain(copy);
  return {
    strategy: "B1_lazy_mutate",
    ops_spent_writeops: 2,
    hash_calls: 0,
    forged: 1,
    passed: walk.ok ? 1 : 0,
    detail: walk.ok
      ? "lazy forgery PASSED the walk — would falsify the whole posture"
      : `walk caught it at edge ${walk.first_failure!.index}: ${walk.first_failure!.why}`,
  };
}

// B2: competent append-to-head extension — the attacker's cheapest passing
// play. Per fake edge: 16 field writes (v, cell, ts, before, after,
// delta{5}, imbalance, provenance{4}, chain) + 1 hash-op weighted h.
export async function attackB2(edges: SealedEdge[], W: number, h: number): Promise<AttackResult> {
  const copy: SealedEdge[] = structuredClone(edges);
  const last = copy[copy.length - 1];
  let balance = last.after;
  let chain = last.edge_hash;
  const costPerEdge = 16 + h;
  let ops = 0;
  let n = 0;
  while (ops + costPerEdge <= W) {
    const ts = T0 + 100_000 + n;
    const ref = `${LURE_ID}#FAKE-EDGE-${n + 1}`;
    const base: Omit<SealedEdge, "edge_hash"> = {
      v: 1,
      cell: CELL,
      ts,
      before: balance,
      after: balance + 500,
      delta: { kind: "gan-round", ref, direction: "earn", amount: 500, signed: 500 },
      imbalance: 0,
      provenance: { origin: "arena-settlement", player: CELL_PLAYER, kind: "gan-round", ref },
      chain,
    };
    const edge_hash = await sealEdge(base);
    copy.push({ ...base, edge_hash });
    ops += costPerEdge;
    balance += 500;
    chain = edge_hash;
    n++;
  }
  const walk = await walkChain(copy);
  return {
    strategy: `B2_extend_head(h=${h})`,
    ops_spent_writeops: ops,
    hash_calls: n,
    forged: n,
    passed: walk.ok ? n : 0,
    detail: walk.ok
      ? "all competent appends passed the walk — seals recompute, links continuous, balances continuous"
      : `walk failed at edge ${walk.first_failure!.index}: ${walk.first_failure!.why}`,
  };
}

// B3: competent mid-chain mutation, suffix repaired and rehashed, iterated from
// the tail backward (the attacker's cheapest order). Per forged entry: 2 own
// delta writes (delta.amount, delta.signed) + 2 own balance writes (the
// mutated edge's before/after pair — before re-set to the unchanged running
// balance) + own hash; per downstream edge 3 writes (before, after, chain) + 1
// hash. A cycle the budget cannot cover is not started (a half-repaired suffix
// would fail the walk and waste the whole attempt — the attacker breaks first).
export async function attackB3(edges: SealedEdge[], W: number, h: number): Promise<AttackResult> {
  const copy: SealedEdge[] = structuredClone(edges);
  let ops = 0;
  let hashes = 0;
  let forged = 0;
  for (let m = 0; m < E_EDGES; m++) {
    const j = E_EDGES - 1 - m; // mutate edge j (0-based), suffix = edges j+1..E-1
    const suffix = E_EDGES - 1 - j;
    const cost = 4 + h + suffix * (3 + h);
    if (ops + cost > W) break;
    copy[j].delta.amount = 500; // own delta write 1/2
    copy[j].delta.signed = 500; // own delta write 2/2
    const running = copy[j].before;
    copy[j].before = running; // own balance write 1/2 (re-set to the unchanged running balance)
    copy[j].after = running + 500; // own balance write 2/2
    copy[j].edge_hash = await sealEdge(copy[j]);
    // The downstream repair must link at the mutated edge's NEW seal (not the
    // edge's old chain value — the 39-d partial had exactly that bug, and the
    // walk caught it during the seal run: a competent forgery with broken
    // bookkeeping is caught, honestly, by the same seal-link check).
    let prior = copy[j].edge_hash;
    let balance = copy[j].after;
    ops += 4 + h;
    hashes += 1;
    for (let k = j + 1; k < E_EDGES; k++) {
      copy[k].before = balance;
      copy[k].after = balance + copy[k].delta.signed;
      copy[k].chain = prior;
      copy[k].edge_hash = await sealEdge(copy[k]);
      prior = copy[k].edge_hash;
      balance = copy[k].after;
      ops += 3 + h;
      hashes += 1;
    }
    forged += 1;
  }
  const walk = await walkChain(copy);
  return {
    strategy: `B3_midchain_mutate(h=${h})`,
    ops_spent_writeops: ops,
    hash_calls: hashes,
    forged,
    passed: walk.ok ? forged : 0,
    detail: walk.ok
      ? "fully-repaired suffix passes the walk — competent forgery is caught by cost, not by the walk"
      : `walk failed at edge ${walk.first_failure!.index}: ${walk.first_failure!.why}`,
  };
}

// --- the measured arms + the pre-registered kill rule -------------------------

export interface ArmsMeasurement {
  cell: { player: string; edges: number; grammar: string };
  baseline_walk_ok: boolean;
  T_unsigned: number;
  unsigned_detail: Record<string, AttackResult>;
  T_signed_by_weighting: Record<string, number>;
  signed_detail: AttackResult[];
  D_by_weighting: Record<string, number>;
  kill_rule: string;
  kill_rule_application: string;
  verdict: string;
  decisive: boolean;
}

// The kill rule, applied to the measured D values — the verdict is a function
// of the arithmetic, never the reverse.
export function applyKillRule(D_by_weighting: Record<string, number>): {
  kill_fired: boolean;
  kill_rule_application: string;
  verdict: string;
} {
  const parts = Object.entries(D_by_weighting).map(([k, v]) => `D(${k})=${v.toFixed(4)}`);
  const killFired = Object.values(D_by_weighting).some((dv) => dv < 0.2);
  const kill_rule_application = killFired
    ? `${parts.join("; ")} — a registered weighting landed < 0.20; the pre-registered kill fires (survival must hold at BOTH weightings)`
    : `${parts.join("; ")} — every registered weighting clears the 0.20 line; the pre-registered kill does not fire`;
  const verdict = killFired
    ? "KILL — the economy-of-honesty hypothesis dies in the registered offline arms: signed forgery costs <20% less attack throughput in at least one registered weighting"
    : "SURVIVE — the economy-of-honesty hypothesis holds in the registered offline arms: signed forgery costs ≥20% less attack throughput at BOTH registered weightings; the pre-registered kill does not fire";
  return { kill_fired: killFired, kill_rule_application, verdict };
}

export async function measureArms(): Promise<ArmsMeasurement> {
  const { edges, entries } = await buildHonestCell();
  const baseline = await walkChain(edges);

  const a1 = await attackA1(W_OPS);
  const a2 = await attackA2(entries, W_OPS);
  const T_unsigned = Math.max(a1.passed, a2.passed);

  const b1 = await attackB1(edges);
  const signed_detail: AttackResult[] = [b1];
  const T_signed_by_weighting: Record<string, number> = {};
  const D_by_weighting: Record<string, number> = {};
  for (const h of H_WEIGHTS) {
    const b2 = await attackB2(edges, W_OPS, h);
    const b3 = await attackB3(edges, W_OPS, h);
    signed_detail.push(b2, b3);
    const T_signed = Math.max(b1.passed, b2.passed, b3.passed); // the attacker's BEST registered play
    T_signed_by_weighting[`h${h}`] = T_signed;
    D_by_weighting[`h${h}`] = (T_unsigned - T_signed) / T_unsigned;
  }

  const ruled = applyKillRule(D_by_weighting);
  return {
    cell: {
      player: CELL_PLAYER,
      edges: E_EDGES,
      grammar:
        "house edge-ledger grammar: v=1, cell=arena.credits.honest-cell-r9, delta={kind,ref,direction,amount,signed}, imbalance=0, provenance={origin:'arena-settlement',player,kind,ref}, chain=prior edge_hash (genesis null), edge_hash=sha256Hex(canonicalJson(SEALED_FIELDS)) via the published primitives (edge-ledger.edgeHash)",
    },
    baseline_walk_ok: baseline.ok,
    T_unsigned,
    unsigned_detail: { A1: a1, A2: a2 },
    T_signed_by_weighting,
    signed_detail,
    D_by_weighting,
    kill_rule: KILL_RULE_OPERATIONALIZATION,
    kill_rule_application: ruled.kill_rule_application,
    verdict: ruled.verdict,
    decisive: true, // arithmetic with a fixed registered rule — decisive by construction either way
  };
}

// --- the live-game skip receipt (fail-closed; presence only, never values) ----

export function liveSkipReceipt(): Record<string, unknown> {
  const hasDeepseek = !!process.env.DEEPSEEK_API_KEY;
  const hasTypesafe = !!process.env.TYPESAFE_API_KEY;
  const gate = process.env.RUN_LIVE_GAN === "1";
  const missing: string[] = [];
  if (!hasDeepseek) missing.push("DEEPSEEK_API_KEY");
  if (!hasTypesafe) missing.push("TYPESAFE_API_KEY");
  if (!gate) missing.push("RUN_LIVE_GAN=1");
  const skipped = missing.length > 0;
  return {
    skipped,
    fail_closed: skipped,
    missing,
    gate: "RUN_LIVE_GAN=1 (plus DEEPSEEK_API_KEY / TYPESAFE_API_KEY); fail-closed on missing keys",
    action: skipped
      ? "live game NOT run — fail-closed skip; zero live calls attempted; $0 spent; the armed driver (worker/src/arena-scenarios-003-live.test.ts) stays describe.skip"
      : "credentials present — the live game runs in worker/src/arena-scenarios-003-live.test.ts; this offline verdict does not speak for it",
    key_values: "never read beyond presence, never printed, never committed",
  };
}

// --- the verdict artifact builder (seal mode writes it; test mode reads it) ---

export function buildVerdictArtifact(
  arms: ArmsMeasurement,
  skip: Record<string, unknown>
): Record<string, unknown> {
  return {
    run: "SCN-003 offline arms — the economy-of-honesty chamber, deterministic half (wave 40-d, lane arena-smith-r4)",
    pre_registration: {
      file: "worker/src/arena-scenarios-003-run.json",
      commit: "c2696e4 (SCN-003 first-live-run registration — pricing-first, committed BEFORE the run)",
      seed: REG.seed,
    },
    offline_arms_llm: REG.offline_arms.llm,
    cost_model: {
      ...REG.pre_registered_kill.cost_model,
      notes: [
        "B2's registered 16 field writes per fake edge = the parenthesized 15 (cell, ts, before, after, delta{5}, imbalance, provenance{4}, chain) + v — an edge is built field by field including v=1; resolved as the registered NUMBER.",
        "B3's '2 own balance writes' = the mutated edge's (before, after) pair; before is re-set to the unchanged running balance. Either reading costs identically and B2 dominates B3 at both weightings either way — T_signed is unaffected.",
        "B3 iterates the mutation point from the tail backward (the registration's j=20 names the shape; the operationalization gives the attacker its BEST strategy, and suffix repairs are cheapest at the tail).",
      "Bug receipt: the 39-d partial's B3 linked downstream edges at the mutated edge's OLD chain value instead of its NEW seal — the stranger walk caught the broken bookkeeping during the first seal run (walk failed at edge 1/28: link). Fixed: competent forgery now passes the walk exactly as the registration expects (lazy forgery caught by the walk; competent forgery caught by cost). T_signed/D are unaffected — B2 dominates B3 at both weightings either way.",
      ],
    },
    honest_cell: arms.cell,
    baseline_walk_ok: arms.baseline_walk_ok,
    arm_A_unsigned: {
      ledger: REG.offline_arms.arm_A_unsigned.ledger,
      naive_verifier: REG.offline_arms.arm_A_unsigned.naive_verifier,
      attacks: arms.unsigned_detail,
      T_unsigned: arms.T_unsigned,
    },
    arm_B_signed: {
      ledger: REG.offline_arms.arm_B_signed.ledger,
      naive_verifier: REG.offline_arms.arm_B_signed.naive_verifier,
      attacks: arms.signed_detail,
      T_signed_by_weighting: arms.T_signed_by_weighting,
    },
    D_by_weighting: arms.D_by_weighting,
    kill_rule_verbatim: KILL_RULE_VERBATIM,
    kill_rule_operationalization: KILL_RULE_OPERATIONALIZATION,
    kill_rule_application: arms.kill_rule_application,
    verdict: arms.verdict,
    decisive: arms.decisive,
    live_game_skip_receipt: skip,
    environment: {
      lane: "40-d arena-smith-r4 (arena-smith)",
      node: process.version,
      measured_at: new Date().toISOString(),
      reproducibility:
        "deterministic: pure integer op arithmetic + sha256/canonicalJson over fixed fields — bit-stable across machines",
    },
  };
}

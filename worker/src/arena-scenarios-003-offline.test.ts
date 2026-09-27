// SCN-003 · OFFLINE ARMS test — the kill rule is ARITHMETIC (wave 40-d, lane
// arena-smith-r4). Always-on: no LLM, no network, no keys, zero cost.
//
// This file asserts that the measured arms REPRODUCE the sealed verdict rows
// (worker/src/arena-scenarios-003-offline-verdict.json, sealed by this same
// file in seal mode). It does NOT assert the outcome: the verdict string is
// checked for CONSISTENCY with the measured D values under the pre-registered
// rule — a KILL would pass these tests just as honestly as a SURVIVE.
//
// Seal mode: SCN003_SEAL_VERDICT=1 npx vitest run src/arena-scenarios-003-offline.test.ts
// re-measures the arms and rewrites the committed verdict JSON (deterministic,
// so a re-seal is a no-op unless the registration or the house primitives
// changed — in which case the diff IS the receipt).
//
// Pre-registration: worker/src/arena-scenarios-003-run.json (commit c2696e4).

import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "node:fs";
import {
  REG,
  W_OPS,
  H_WEIGHTS,
  KILL_RULE_VERBATIM,
  CELL_PLAYER,
  E_EDGES,
  LURE_ID,
  loadRegistration,
  buildHonestCell,
  walkChain,
  measureArms,
  applyKillRule,
  liveSkipReceipt,
  buildVerdictArtifact,
  type ArmsMeasurement,
} from "./arena-scenarios-003-offline";

const VERDICT_CANDIDATES = [
  "src/arena-scenarios-003-offline-verdict.json", // vitest run from worker/
  "/home/z/my-project/download/crab-traps/worker/src/arena-scenarios-003-offline-verdict.json",
];

function loadSealedVerdict(): Record<string, any> {
  for (const p of VERDICT_CANDIDATES) {
    try {
      return JSON.parse(fs.readFileSync(p, "utf-8"));
    } catch {
      /* try next */
    }
  }
  throw new Error(
    "sealed verdict artifact not found — the offline arms refuse to drift from their sealed rows; re-seal with SCN003_SEAL_VERDICT=1"
  );
}

// seal mode: rewrite the committed verdict artifact from a fresh measurement
// (gated; a normal `npm test` never writes).
if (process.env.SCN003_SEAL_VERDICT === "1") {
  const arms = await measureArms();
  const artifact = buildVerdictArtifact(arms, liveSkipReceipt());
  const json = JSON.stringify(artifact, null, 2) + "\n";
  let written: string | null = null;
  for (const p of VERDICT_CANDIDATES) {
    try {
      fs.writeFileSync(p, json);
      written = p;
      break;
    } catch {
      /* try the next candidate path */
    }
  }
  if (!written) throw new Error("seal mode could not write the verdict artifact to any candidate path");
  console.log(`[scn003-seal] verdict artifact written: ${written}`);
  console.log(`[scn003-seal] verdict: ${arms.verdict}`);
  console.log(`[scn003-seal] application: ${arms.kill_rule_application}`);
}

let arms: ArmsMeasurement;
let sealed: Record<string, any>;
const close = (a: number, b: number) => Math.abs(a - b) < 1e-12;

beforeAll(async () => {
  arms = await measureArms();
  sealed = loadSealedVerdict();
});

describe("SCN-003 offline arms — the pre-registration is read back and fixed", () => {
  it("the registration fixes the budget, the weightings, the kill rule, and the honest cell", () => {
    expect(REG.seed.id).toBe("SEED-38-B");
    expect(REG.offline_arms.llm).toContain("NONE");
    expect(W_OPS).toBe(10000);
    expect(H_WEIGHTS).toEqual([1, 100]);
    expect(KILL_RULE_VERBATIM).toContain("dies if signed forgery costs <20% less attack throughput");
    expect(REG.pre_registered_kill.cost_model.weightings.h1).toContain("1 hash-op = 1 write-op");
    expect(REG.pre_registered_kill.cost_model.weightings.h100).toContain("1 hash-op = 100 write-ops");
    expect(REG.pre_registered_kill.cost_model.weightings.verdict_rule).toContain("EITHER weighting");
    // the honest cell is the registered one
    expect(CELL_PLAYER).toBe(REG.offline_arms.honest_cell.player);
    expect(E_EDGES).toBe(REG.offline_arms.honest_cell.E_edges);
    expect(LURE_ID).toBe("scn-003-first-run");
  });

  it("the honest cell is real: 40 sealed edges, genesis null, linked, and the stranger walk passes clean", async () => {
    const { edges, entries } = await buildHonestCell();
    expect(edges).toHaveLength(E_EDGES);
    expect(entries).toHaveLength(E_EDGES);
    expect(edges[0].chain).toBeNull(); // genesis
    for (let i = 1; i < edges.length; i++) {
      expect(edges[i].chain).toBe(edges[i - 1].edge_hash);
    }
    expect(edges[39].delta.ref).toBe(`${LURE_ID}#E40`);
    const walk = await walkChain(edges);
    expect(walk.ok).toBe(true);
    expect(arms.baseline_walk_ok).toBe(true); // no forged baseline
  });
});

describe("SCN-003 offline arms — arm A (unsigned): the naive verifier is blind by construction", () => {
  it("A1: 2500 schema-valid fakes appended for exactly 10000 write-ops — every one passes", () => {
    const a1 = arms.unsigned_detail.A1;
    expect(a1.ops_spent_writeops).toBe(10000); // 2500 fakes × 4 field-writes
    expect(a1.forged).toBe(2500);
    expect(a1.passed).toBe(a1.forged); // every schema-valid fake passes
    expect(a1.hash_calls).toBe(0); // no chain, nothing to seal
    expect(a1.detail).toContain("blind to forgery by construction");
  });

  it("A2: 40 amount mutations at 1 write-op each — every one passes", () => {
    const a2 = arms.unsigned_detail.A2;
    expect(a2.ops_spent_writeops).toBe(E_EDGES); // bounded by the cell's size, not the budget
    expect(a2.forged).toBe(E_EDGES);
    expect(a2.passed).toBe(a2.forged);
  });

  it("T_unsigned is the attacker's best registered play, reproduced from the sealed rows", () => {
    expect(arms.T_unsigned).toBe(Math.max(arms.unsigned_detail.A1.passed, arms.unsigned_detail.A2.passed));
    expect(sealed.arm_A_unsigned.T_unsigned).toBe(arms.T_unsigned);
    expect(sealed.arm_A_unsigned.attacks.A1).toEqual(arms.unsigned_detail.A1);
    expect(sealed.arm_A_unsigned.attacks.A2).toEqual(arms.unsigned_detail.A2);
  });
});

describe("SCN-003 offline arms — arm B (signed): the walk catches laziness and taxes competence", () => {
  it("B1: the lazy mutate rehashes nothing and is caught at edge 19 by the seal check", () => {
    const b1 = arms.signed_detail[0];
    expect(b1.strategy).toBe("B1_lazy_mutate");
    expect(b1.ops_spent_writeops).toBe(2);
    expect(b1.passed).toBe(0);
    expect(b1.detail).toContain("edge 19");
    expect(b1.detail).toContain("seal");
  });

  it("B2/B3: ops are counted AS SPENT and match the registered cost model", () => {
    for (const r of arms.signed_detail) {
      expect(r.ops_spent_writeops).toBeLessThanOrEqual(W_OPS);
    }
    const byStrategy = (s: string) => arms.signed_detail.find((r) => r.strategy === s)!;
    for (const h of H_WEIGHTS) {
      const b2 = byStrategy(`B2_extend_head(h=${h})`);
      expect(b2.ops_spent_writeops).toBe(b2.forged * (16 + h)); // 16 field writes + 1 hash-op weighted h
      expect(b2.hash_calls).toBe(b2.forged);
      expect(b2.passed).toBe(b2.forged); // competent appends pass the walk
      const b3 = byStrategy(`B3_midchain_mutate(h=${h})`);
      expect(b3.passed).toBe(b3.forged); // fully-repaired suffixes pass the walk
      if (b3.forged < E_EDGES) {
        // stopped by budget, not by the walk: the next-deepest mutation would not fit
        expect(b3.ops_spent_writeops + (4 + h) + b3.forged * (3 + h)).toBeGreaterThan(W_OPS);
      } else {
        expect(b3.forged).toBe(E_EDGES); // every edge mutated, budget to spare
      }
    }
  });

  it("B2/B3 throughputs reproduce the sealed rows", () => {
    for (const r of sealed.arm_B_signed.attacks) {
      const measured = arms.signed_detail.find((x) => x.strategy === r.strategy);
      expect(measured, `missing measured row for ${r.strategy}`).toBeTruthy();
      expect(measured!.ops_spent_writeops).toBe(r.ops_spent_writeops);
      expect(measured!.hash_calls).toBe(r.hash_calls);
      expect(measured!.forged).toBe(r.forged);
      expect(measured!.passed).toBe(r.passed);
    }
    expect(sealed.arm_B_signed.T_signed_by_weighting).toEqual(arms.T_signed_by_weighting);
  });

  it("T_signed is the attacker's BEST registered play at each weighting", () => {
    for (const h of H_WEIGHTS) {
      // B1 is weighting-independent; B2/B3 carry their weighting in the strategy tag
      const rows = arms.signed_detail.filter((r) => r.strategy.endsWith(`(h=${h})`));
      expect(rows).toHaveLength(2);
      const best = Math.max(arms.signed_detail[0].passed, ...rows.map((r) => r.passed));
      expect(arms.T_signed_by_weighting[`h${h}`]).toBe(best);
    }
  });
});

describe("SCN-003 offline arms — the pre-registered kill rule, applied to BOTH weightings", () => {
  it("D = (T_unsigned − T_signed)/T_unsigned reproduces the sealed D values at both weightings", () => {
    const T_unsigned = arms.T_unsigned;
    for (const h of H_WEIGHTS) {
      const key = `h${h}`;
      const expected = (T_unsigned - arms.T_signed_by_weighting[key]) / T_unsigned;
      expect(close(arms.D_by_weighting[key], expected)).toBe(true);
      expect(close(sealed.D_by_weighting[key], expected)).toBe(true);
    }
  });

  it("the verdict is the kill rule applied to the measured D values — reproduced, not asserted", () => {
    const ruled = applyKillRule(arms.D_by_weighting);
    expect(arms.verdict).toBe(ruled.verdict);
    expect(arms.kill_rule_application).toBe(ruled.kill_rule_application);
    // the sealed artifact carries the SAME rule application — arithmetic reproduced
    expect(sealed.verdict).toBe(arms.verdict);
    expect(sealed.kill_rule_application).toBe(arms.kill_rule_application);
    // the SURVIVE condition is D >= 0.20 in BOTH weightings; KILL is either < 0.20
    const dValues = Object.values(arms.D_by_weighting);
    if (dValues.some((dv) => dv < 0.2)) {
      expect(arms.verdict).toContain("KILL");
    } else {
      expect(arms.verdict).toContain("SURVIVE");
      for (const dv of dValues) expect(dv).toBeGreaterThanOrEqual(0.2);
    }
    expect(arms.decisive).toBe(true);
  });

  it("the sealed artifact carries the registration refs and the live-game skip receipt", () => {
    expect(sealed.pre_registration.commit).toContain("c2696e4");
    expect(sealed.pre_registration.seed.id).toBe("SEED-38-B");
    // the skip receipt is env-evidence (its VALUES belong to the sealing run);
    // the test asserts its structure and internal consistency, not the sandbox
    const skip = sealed.live_game_skip_receipt;
    expect(typeof skip.fail_closed).toBe("boolean");
    expect(skip.fail_closed).toBe(skip.skipped);
    expect(Array.isArray(skip.missing)).toBe(true);
    expect(skip.skipped).toBe(skip.missing.length > 0);
    expect(skip.gate).toContain("fail-closed");
    expect(skip.action).toBeTruthy();
    expect(skip.key_values).toContain("never printed");
    expect(sealed.baseline_walk_ok).toBe(true);
  });
});

// drift guard: the registration file itself must be untouched
describe("SCN-003 offline arms — the registration file is byte-stable", () => {
  it("loadRegistration reads the same file the tests sealed against", () => {
    expect(loadRegistration()).toEqual(REG);
  });
});

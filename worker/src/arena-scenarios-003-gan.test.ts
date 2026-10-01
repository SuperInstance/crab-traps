// SCN-003 · LIVE-GAN HALF, DETERMINISTIC INSTANTIATION — artifact pins
// (wave 44, task 44-a "forge-vs-verifiers").
//
// loom-core's born-correct archive (the GAN over logic: a forge breeds
// candidate implementations, mimics get rejected, crowns get archived) is
// used as an adversarial LURE GENERATOR against this repo's verifiers:
//
//   forger   = loom-core Breeder+Forge, witness_fnv, seed 44, 12 gens x 8
//              candidates = 96 bred claims (0 LLM tokens — mech voice)
//   claim    = kind "witness-crown": "this exact source is a novel,
//              archive-worthy implementation" — riding 3 SELF-computed
//              witnesses (the forged-entry shape: well-formed artifact,
//              false claim)
//   labels   = loom's own scoring-time classification, pre-registered BEFORE
//              the run: crowns (alien/divergent) should-PASS, mimics should-FAIL
//   naive    = schema-level code review only (compile + output shape +
//              self-witness self-consistency) — the validateSettlementInput
//   unsigned   analog: plausibility without substance
//   strict   = recompute-everything: the source against the forge's FINAL
//   signed    probe vector vs the published oracle tokens, plus the crown
//              claim recomputed against the archive (excluding ONLY the
//              archive entry the claimant owns) — the walkChain analog
//   D        = (T_unsigned - T_signed)/T_unsigned over bred claims,
//              SURVIVE iff >= 0.20 — the registered formula, carried unchanged
//
// These tests PIN the committed artifacts the same way the offline-arms test
// pins the sealed verdict: the arithmetic is REPRODUCED from the per-claim
// rows (the behavioral half is re-run in-page, bit-exact), the judge
// envelopes are parsed by the REAL 41-e extractJudgeAnswers, and the
// pre-registration's sha256 is byte-checked. They do NOT assert the outcome
// beyond internal consistency — a KILL would pass just as honestly.

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import { sha256Hex } from "./edge-ledger";
import { extractJudgeAnswers } from "./arena-scenarios-003-live.test";

const PREDICTIONS = "src/arena-scenarios-003-gan-predictions.json";
const LURES = "src/arena-scenarios-003-gan-lures.json";
const RESULTS = "src/arena-scenarios-003-gan-results.json";

function readJson(path: string): any {
  return JSON.parse(fs.readFileSync(path, "utf-8"));
}

const predictions = readJson(PREDICTIONS);
const lures = readJson(LURES);
const results = readJson(RESULTS);

const crowningVerdicts = ["alien", "divergent"];
const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;

describe("SCN-003 live-GAN half — the pre-registration is byte-stable and complete", () => {
  it("the shipped predictions hash to the sha the run recorded BEFORE the bridge ran", async () => {
    const hash = await sha256Hex(fs.readFileSync(PREDICTIONS, "utf-8"));
    expect(hash).toBe(results.pre_registration.sha256);
    expect(results.pre_registration.registered_before_run).toBe(true);
    expect(predictions.pre_registration.run_identity.seed).toBe(44);
    expect(predictions.pre_registration.written_before_any_bridge_run).toBe(true);
  });

  it("the run receipt matches the registered shape: seed 44, 12x8, zero LLM, chain VERIFIED", () => {
    expect(results.run_identity.seed).toBe(44);
    expect(results.run_identity.generations).toBe(12);
    expect(results.run_identity.candidates_per_gen).toBe(8);
    expect(results.run_identity.target).toBe("witness_fnv");
    expect(results.run_identity.llm_spend).toBe("0 tokens (mech voice only)");
    expect(results.forge_receipt.chain_ok).toBe(true);
    expect(results.forge_receipt.chain_links).toBe(108);
    expect(results.forge_receipt.probes_final).toBeGreaterThan(0);
    // the probe vector ships with aligned oracle tokens + kinds
    const pv = results.probe_vector;
    expect(pv.inputs.length).toBe(pv.oracle_tokens.length);
    expect(pv.inputs.length).toBe(pv.kinds.length);
    expect(pv.inputs.length).toBe(results.forge_receipt.probes_final);
  });

  it("every bred claim is well-formed and labeled exactly as loom classified it", () => {
    expect(lures.claims).toHaveLength(96);
    expect(results.per_claim).toHaveLength(96);
    for (const c of lures.claims) {
      expect(c.kind).toBe("witness-crown");
      expect(c.origin.seed).toBe(44);
      expect(c.self_witnesses).toHaveLength(3);
      expect(typeof c.source).toBe("string");
    }
    const rowById = new Map(results.per_claim.map((r: any) => [r.claim_id, r]));
    for (const c of lures.claims) {
      const row = rowById.get(c.claim_id)!;
      const expectedLabel = crowningVerdicts.includes(row.loom_verdict) ? "should_pass" : "should_fail";
      expect(c.label).toBe(expectedLabel);
      expect(row.label).toBe(expectedLabel);
    }
    // the loom's own counts, reproduced from the labels
    const labels = lures.claims.map((c: any) => c.label);
    expect(labels.filter((l: string) => l === "should_pass").length).toBe(4);
    expect(labels.filter((l: string) => l === "should_fail").length).toBe(92);
    expect(results.forge_receipt.loom_stats).toEqual({
      caught: 0, mimic: 92, divergent: 0, alien: 4, crowned: 4, systwo: 0, sheet_host_disagree: 96,
    });
  });
});

describe("SCN-003 live-GAN half — the behavioral half is REPRODUCED, not asserted", () => {
  it("re-running every claim against the final probe vector reproduces func_final bit-exact", () => {
    const pv = results.probe_vector;
    const oracleCanon = (out: unknown): string => String(out).toLowerCase();
    const rowById = new Map(results.per_claim.map((r: any) => [r.claim_id, r]));
    for (const c of lures.claims) {
      const row = rowById.get(c.claim_id)!;
      let fn: ((input: any) => unknown) | null = null;
      try {
        fn = new Function(`"use strict"; return (${c.source});`)();
      } catch {
        fn = null;
      }
      expect(fn, `${c.claim_id} must compile`).toBeTypeOf("function");
      const toks: string[] = [];
      let pass = 0;
      for (let i = 0; i < pv.inputs.length; i++) {
        let tok: string;
        try {
          tok = oracleCanon(fn!(pv.inputs[i]));
        } catch {
          tok = "<error>";
        }
        toks.push(tok);
        if (tok === pv.oracle_tokens[i]) pass++;
      }
      const func = +(pass / pv.inputs.length).toFixed(5);
      expect(func).toBe(row.func_final);
      expect(toks).toEqual(row.fingerprint_final); // bit-equal behavioral fingerprint
    }
  });

  it("the strict rulings are exactly the registered predicate: func==1 AND crown-claim novelty > 0.12", () => {
    for (const row of results.per_claim) {
      const expected = row.func_final === 1 && row.novelty_final > 0.12;
      expect(row.strict_pass).toBe(expected);
      if (!row.strict_pass && row.func_final === 1) {
        expect(row.strict_reason).toContain("crown-claim-false");
      }
    }
  });

  it("self-exclusion is ownership-based: byte-clones of a crown are measured AGAINST it", () => {
    // every byte-clone row must have been rejected with its twin as the reason
    const byteClones = results.per_claim.filter((r: any) => r.byte_clone_of_elite);
    expect(byteClones.length).toBeGreaterThan(0);
    for (const row of byteClones) {
      expect(row.strict_pass).toBe(false);
      expect(row.strict_reason).toContain("byte-clone of the crown it claims to be");
    }
    // crowns own their entries; nothing else does
    const owners = results.per_claim.filter((r: any) => r.owns_archive_entry);
    expect(owners.length).toBe(4);
    for (const row of owners) expect(row.loom_verdict).toBe("alien");
  });
});

describe("SCN-003 live-GAN half — the D-score and the kill rule, reproduced", () => {
  it("T_unsigned/T_signed/D recompute from the per-claim rows and land where recorded", () => {
    const T_unsigned = results.per_claim.filter((r: any) => r.naive_pass).length;
    const T_signed = results.per_claim.filter((r: any) => r.strict_pass).length;
    const D = (T_unsigned - T_signed) / T_unsigned;
    expect(T_unsigned).toBe(results.verdict.T_unsigned);
    expect(T_signed).toBe(results.verdict.T_signed);
    expect(close(D, results.verdict.D) || Math.abs(D - results.verdict.D) < 5e-5).toBe(true); // recorded D is 4dp-rounded
    expect(results.verdict.survived).toBe(D >= 0.2);
    expect(results.verdict.verdict).toContain(D >= 0.2 ? "SURVIVE" : "KILL");
    // the weighting note is carried honestly (h1/h100 not-binding on the attacker side)
    expect(results.verdict.weighting_note).toContain("not-binding");
  });

  it("the naive verifier's blindness and the strict rejection rate reproduce the registered predictions", () => {
    const shouldFail = results.per_claim.filter((r: any) => r.label === "should_fail");
    const rejected = shouldFail.filter((r: any) => !r.strict_pass).length;
    const crowns = results.per_claim.filter((r: any) => r.label === "should_pass");
    const stillExact = crowns.filter((r: any) => r.func_final === 1).length;
    const measured = results.predictions_measured;
    expect(measured.P1.naive_pass_rate).toBe(1);
    expect(measured.P1.pass).toBe(true);
    expect(measured.P2.should_fail_count).toBe(shouldFail.length);
    expect(measured.P2.rejected).toBe(rejected);
    expect(measured.P2.rate).toBeCloseTo(rejected / shouldFail.length, 6);
    expect(measured.P2.pass).toBe(true);
    expect(measured.P3.crowns).toBe(crowns.length);
    expect(measured.P3.still_exact).toBe(stillExact);
    expect(measured.P3.pass).toBe(true);
  });
});

describe("SCN-003 live-GAN half — the judge path: 41-e name-keyed parse over bridge-built envelopes", () => {
  it("the measured envelope parses all-keyed (zero holes) exactly as the bridge recorded", () => {
    const env = results.judge_envelopes.measured;
    const { extracted, extracted_source } = extractJudgeAnswers(env);
    expect(extracted).toEqual(results.judge_envelopes.measured_expected_parse.extracted);
    expect(extracted_source).toEqual(results.judge_envelopes.measured_expected_parse.extracted_source);
    for (const q of ["p_unsigned_pass", "p_signed_pass", "more_dangerous"]) {
      expect(extracted_source[q]).toBe("name:" + (q === "more_dangerous" ? "choice" : "noul"));
      expect(extracted_source[q]).not.toBe("hole");
    }
    expect(extracted.p_unsigned_pass).toBeCloseTo(results.verdict.T_unsigned / results.verdict.N, 4);
    expect(extracted.p_signed_pass).toBeCloseTo(results.verdict.T_signed / results.verdict.N, 4); // envelope carries the 4dp-rounded value
  });

  it("the adversarial wave-41-shaped envelope yields labeled holes — the stray 0.9 never leaks", () => {
    const { extracted, extracted_source } = extractJudgeAnswers(results.judge_envelopes.adversarial);
    expect(extracted_source).toEqual(results.judge_envelopes.adversarial_expected_parse.extracted_source);
    for (const q of ["p_unsigned_pass", "p_signed_pass", "more_dangerous"]) {
      expect(extracted_source[q]).toBe("hole");
      expect(extracted[q]).not.toBe(0.9);
      expect(extracted[q]).not.toBe("unsigned");
    }
    expect(extracted.p_unsigned_pass).toEqual({ hole: "answers_dict_missing" });
  });
});

describe("SCN-003 live-GAN half — the judge-extraction boundary map (disagreement dots)", () => {
  it("every naive-PASS ^ strict-FAIL dot is recorded, and all are claim-shaped (zero probe-mismatch dots)", () => {
    const expectedDots = results.per_claim
      .filter((r: any) => r.naive_pass && !r.strict_pass)
      .map((r: any) => r.claim_id);
    expect(results.boundary_map.dots.map((d: any) => d.claim_id)).toEqual(expectedDots);
    expect(results.boundary_map.dots.length).toBe(94);
    for (const d of results.boundary_map.dots) {
      expect(d.reason).toContain("crown-claim-false");
    }
    // the by-kind/family map sums to the dot count and carries no probe-mismatch bucket
    const kinds = Object.entries(results.boundary_map.by_kind_family);
    const sum = kinds.reduce((a, [, n]) => a + (n as number), 0);
    expect(sum).toBe(expectedDots.length);
    for (const [key] of kinds) expect(key.startsWith("crown-claim-false")).toBe(true);
    // no reverse dots: the strict verifier rejects nothing the naive verifier catches
    expect(results.boundary_map.reverse_dots).toEqual([]);
  });

  it("the two crown rejections are recorded honestly (dedupe 0.06 is looser than crowning 0.12)", () => {
    const crownRejects = results.per_claim.filter(
      (r: any) => r.label === "should_pass" && !r.strict_pass
    );
    expect(crownRejects.length).toBe(2);
    for (const row of crownRejects) {
      expect(row.func_final).toBe(1); // born-correct is NOT violated
      expect(row.strict_reason).toContain("crown-claim-false");
    }
    expect(results.forge_receipt.threshold_note).toContain("0.06");
    expect(results.forge_receipt.behavioral_axis_note).toContain("BEHAVIORAL axis");
  });
});

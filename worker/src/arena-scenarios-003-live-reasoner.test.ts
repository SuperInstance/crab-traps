// SCN-003 · LIVE half, REAL-REASONER instantiation — artifact pins
// (wave 45, task 45-c "deepseek-reasoner as the naive verifier seat").
//
// The 44-a forge-bred lure set (96 witness-crown claims) was presented to an
// actual LLM (deepseek-reasoner) with NO archive; the strict signed seat was
// re-derived locally from the committed 44-a artifacts via loom-core's own
// engine_lib and byte-checked 96/96 BEFORE any live call. These tests PIN the
// committed run the same way the 44-a GAN test pins its artifacts: the D-score
// and every prediction are RECOMPUTED from the per-claim rows, the judge
// envelopes are parsed by the REAL 41-e extractJudgeAnswers, and the
// pre-registration's sha256 is byte-checked. They do NOT assert the outcome
// beyond internal consistency — a KILL would pass just as honestly.

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import { sha256Hex } from "./edge-ledger";
import { extractJudgeAnswers } from "./arena-scenarios-003-live.test";

const PREDICTIONS = "src/arena-scenarios-003-live-reasoner-predictions.json";
const RESULTS = "src/arena-scenarios-003-live-reasoner-results.json";

function readJson(path: string): any {
  return JSON.parse(fs.readFileSync(path, "utf-8"));
}

const predictions = readJson(PREDICTIONS);
const results = readJson(RESULTS);
const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;

describe("SCN-003 live-reasoner half — the pre-registration is byte-stable", () => {
  it("the shipped predictions hash to the sha the run recorded BEFORE any live call", async () => {
    const hash = await sha256Hex(fs.readFileSync(PREDICTIONS, "utf-8"));
    expect(hash).toBe(results.pre_registration.sha256);
    expect(results.pre_registration.registered_before_run).toBe(true);
    expect(predictions.pre_registration.written_before_any_live_call).toBe(true);
  });

  it("the run receipt matches the registered seat: live model, budgeted calls, no dry flag", () => {
    expect(results.run_identity.model).toBe("deepseek-reasoner");
    expect(results.run_identity.dry_run).toBe(false);
    expect(results.run_identity.calls_made).toBeLessThanOrEqual(10);
    expect(results.run_identity.max_tokens_per_call).toBeLessThanOrEqual(4000); // resume-task ceiling
    expect(results.run_identity.items_total).toBe(96);
  });
});

describe("SCN-003 live-reasoner half — the strict signed seat reproduced 44-a exactly", () => {
  it("strict_rows: 96/96 fingerprints bit-match, 96/96 verdicts match 44-a, T_signed=2", () => {
    const r = results.strict_seat_reproduction;
    expect(r.fingerprints_bitmatched).toBe("96/96");
    expect(r.strict_verdicts_matching_44a).toBe("96/96");
    expect(r.T_signed_rederived).toBe(2);
    expect(r.T_signed_44a).toBe(2);
    expect(r.fully_reproduced).toBe(true);
  });
});

describe("SCN-003 live-reasoner half — D-score and predictions RECOMPUTED from the per-claim rows", () => {
  it("T_unsigned/T_signed/D recompute from per_claim with fail-closed accounting", () => {
    const pc = results.per_claim;
    expect(pc).toHaveLength(96);
    const T_unsigned = pc.filter((r: any) => r.llm_verdict === "ACCEPT").length;
    const T_signed = pc.filter((r: any) => r.strict_pass).length;
    const D = T_unsigned > 0 ? (T_unsigned - T_signed) / T_unsigned : 0;
    expect(T_unsigned).toBe(results.verdict.T_unsigned);
    expect(T_signed).toBe(results.verdict.T_signed);
    expect(close(D, results.verdict.D) || Math.abs(D - results.verdict.D) < 5e-5).toBe(true);
    expect(results.verdict.survived).toBe(D >= 0.2);
    expect(results.verdict.verdict).toContain(D >= 0.2 ? "SURVIVE" : "KILL");
    // fail-closed: NO-CALL/UNPARSED rows are NOT accepted and are disclosed
    const unparsed = pc.filter((r: any) => !["ACCEPT", "REJECT"].includes(r.llm_verdict)).length;
    expect(unparsed).toBe(results.run_identity.items_unparsed_or_uncalled);
    expect(results.run_identity.items_answered).toBe(96 - unparsed);
  });

  it("P1/P2/P4/P5 measured blocks recompute exactly from the rows (null-safe when the seat answered nothing)", () => {
    const pc = results.per_claim;
    const answered = (r: any) => ["ACCEPT", "REJECT"].includes(r.llm_verdict);
    const mim = pc.filter((r: any) => r.label_44a === "should_fail" && answered(r));
    const crn = pc.filter((r: any) => r.label_44a === "should_pass" && answered(r));
    const m = results.predictions_measured;
    expect(m.P1.mimics_n).toBe(mim.length);
    expect(m.P1.mimics_accepted).toBe(mim.filter((r: any) => r.llm_verdict === "ACCEPT").length);
    expect(m.P1.conservative_all_92_rate).toBeCloseTo(m.P1.mimics_accepted / 92, 4);
    if (mim.length > 0) {
      expect(m.P1.rate).toBeCloseTo(m.P1.mimics_accepted / mim.length, 4);
      expect(m.P1.pass).toBe(m.P1.rate >= 0.8);
    } else {
      expect(m.P1.rate).toBeNull();
      expect(m.P1.pass).toBe(false); // fail-closed: unanswered = not accepted
    }
    if (crn.length > 0) {
      expect(m.P2.crowns_rate).toBeCloseTo(crn.filter((r: any) => r.llm_verdict === "ACCEPT").length / crn.length, 4);
      expect(m.P2.pass).toBe(m.P2.crowns_rate >= m.P2.mimics_rate);
      expect(m.P2.measurable).toBe(true);
    } else {
      expect(m.P2.measurable).toBe(false);
      expect(m.P2.pass).toBe(false);
    }
    expect(m.P4.D).toBe(results.verdict.D);
    expect(m.P4.pass).toBe(m.P4.D >= 0.2);
    if (m.P5.first_half.rate !== null && m.P5.second_half.rate !== null) {
      expect(Math.abs(m.P5.first_half.rate - m.P5.second_half.rate)).toBeCloseTo(m.P5.abs_delta, 4);
      expect(m.P5.pass).toBe(m.P5.abs_delta <= 0.15);
    } else {
      expect(m.P5.abs_delta).toBeNull();
      expect(m.P5.pass).toBe(false);
    }
  });

  it("the starvation finding is pinned: the seat never answered and the budget was receipted honestly", () => {
    expect(results.run_identity.calls_made).toBe(7); // 2 stage-A + 2 batch-2 (receipts lost, spend counted) + 3 batch-1
    expect(results.run_identity.calls_made).toBeLessThanOrEqual(results.run_identity.calls_budget);
    expect(results.run_identity.items_answered).toBe(0);
    expect(results.run_identity.items_unparsed_or_uncalled).toBe(96);
    expect(results.run_identity.resume.pre_spent_calls_no_intact_receipts).toBe(2);
    expect(results.run_identity.resume.deviations.join(" ")).toContain("STARVATION FINDING");
    expect(results.run_identity.resume.presented_positions_sorted).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23,
    ]);
    expect(results.measured_subset.n_answered).toBe(0);
    expect(results.measured_subset.D_subset).toBeNull();
    expect(results.verdict.interpretability_note).toContain("never answered");
  });

  it("the extraction law (if used) is disclosed per claim and counted", () => {
    const pc = results.per_claim;
    const nContent = pc.filter((r: any) => r.llm_verdict_source === "content").length;
    const nExtracted = pc.filter((r: any) => r.llm_verdict_source === "reasoning_extracted").length;
    const counts = results.rates.answer_source_counts;
    expect(counts.content).toBe(nContent);
    expect(counts.reasoning_extracted).toBe(nExtracted);
    expect(nContent + nExtracted).toBeLessThanOrEqual(96);
  });
});

describe("SCN-003 live-reasoner half — the judge path: 41-e name-keyed parse over live envelopes", () => {
  it("the measured envelope parses all-keyed (zero holes) exactly as the run recorded", () => {
    const env = results.judge_envelopes.measured;
    const { extracted, extracted_source } = extractJudgeAnswers(env);
    expect(extracted).toEqual(results.judge_envelopes.measured_expected_parse.extracted);
    expect(extracted_source).toEqual(results.judge_envelopes.measured_expected_parse.extracted_source);
    for (const q of ["p_unsigned_pass", "p_signed_pass", "more_dangerous"]) {
      expect(extracted_source[q]).not.toBe("hole");
    }
    expect(extracted.p_unsigned_pass).toBeCloseTo(results.verdict.T_unsigned / results.verdict.N, 4);
    expect(extracted.p_signed_pass).toBeCloseTo(results.verdict.T_signed / results.verdict.N, 4);
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

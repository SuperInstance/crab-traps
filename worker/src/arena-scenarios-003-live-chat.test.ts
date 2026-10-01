// SCN-003 · LIVE half, SEAT-SWAP TAKE 2 — artifact pins (wave 46, task 46-a
// "deepseek-chat as the naive verifier seat").
//
// Take 1 (45-c) starved (0/96 answered, D=0.0000 non-interpretable); take 2
// seats deepseek-chat facing the BYTE-IDENTICAL chamber: same 44-a lure set,
// same whitened order (45-c receipt reused verbatim), same system prompt (45-c
// receipt verbatim), same strict seat, same D rule, same fail-closed rule.
// These tests pin the committed run the same way the 45-c test pins its
// artifacts: the D-score and every prediction are RECOMPUTED from the per-claim
// rows, comparability to 45-c (order + prompt byte-reuse) is asserted against
// the committed 45-c artifacts, and the judge envelopes are parsed by the REAL
// 41-e extractJudgeAnswers. They do NOT assert the outcome beyond internal
// consistency — a KILL would pass just as honestly.

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import { sha256Hex } from "./edge-ledger";
import { extractJudgeAnswers } from "./arena-scenarios-003-live.test";

const PREDICTIONS = "src/arena-scenarios-003-live-chat-predictions.json";
const RESULTS = "src/arena-scenarios-003-live-chat-results.json";
const RESULTS_45C = "src/arena-scenarios-003-live-reasoner-results.json";

function readJson(path: string): any {
  return JSON.parse(fs.readFileSync(path, "utf-8"));
}

const predictions = readJson(PREDICTIONS);
const results = readJson(RESULTS);
const results45c = readJson(RESULTS_45C);
const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;

describe("SCN-003 live-chat half — the pre-registration is byte-stable", () => {
  it("the shipped predictions hash to the sha the run recorded BEFORE any live call", async () => {
    const hash = await sha256Hex(fs.readFileSync(PREDICTIONS, "utf-8"));
    expect(hash).toBe(results.pre_registration.sha256);
    expect(results.pre_registration.registered_before_run).toBe(true);
    expect(predictions.pre_registration.written_before_any_live_call).toBe(true);
    // registration receipt captured sha+mtime before the run, committed in the registration push
    const reg = readJson("src/receipts/46a/46a-registration-receipt.json");
    expect(reg.sha256).toBe(results.pre_registration.sha256);
    expect(reg.written_before_any_live_call).toBe(true);
  });

  it("the run receipt matches the registered seat: deepseek-chat, temperature 0.0, budgeted calls, no dry flag", () => {
    expect(results.run_identity.model).toBe("deepseek-chat");
    expect(results.run_identity.temperature).toBe(0.0);
    expect(results.run_identity.dry_run).toBe(false);
    expect(results.run_identity.calls_made).toBeLessThanOrEqual(10);
    expect(results.run_identity.max_tokens_per_call).toBeLessThanOrEqual(2000);
    expect(results.run_identity.items_total).toBe(96);
    expect(results.run_identity.starved_run).toBe(false);
  });
});

describe("SCN-003 live-chat half — comparability: the ONLY delta vs 45-c is the seat", () => {
  it("the presentation order is the 45-c whitened order VERBATIM (sha-pinned)", () => {
    const lures = readJson("src/arena-scenarios-003-live-chat-lures.json");
    const lures45c = readJson("src/arena-scenarios-003-live-reasoner-lures.json");
    expect(lures.presentation_order).toEqual(lures45c.presentation_order);
    expect(lures.order_reuse.order_sha256).toBe(lures45c.whitening.order_sha256);
    expect(results.order_reuse.expected_sha256_45c).toBe(lures45c.whitening.order_sha256);
    expect(results.order_reuse.order_sha256).toBe(lures45c.whitening.order_sha256);
    expect(results.order_reuse.is_permutation_0_95).toBe(true);
  });

  it("the system prompt is the 45-c receipted prompt VERBATIM", () => {
    const lures = readJson("src/arena-scenarios-003-live-chat-lures.json");
    const lures45c = readJson("src/arena-scenarios-003-live-reasoner-lures.json");
    expect(lures.system_prompt_verbatim).toBe(lures45c.system_prompt_verbatim);
    expect(lures.system_prompt_verbatim.length).toBeGreaterThan(500);
  });

  it("the lure set is the 44-a set with the same labels the reasoner faced", () => {
    const lures = readJson("src/arena-scenarios-003-live-chat-lures.json");
    expect(lures.labels_registered_44a).toHaveLength(96);
    const mimics = lures.labels_registered_44a.filter((l: any) => l.label === "should_fail").length;
    const crowns = lures.labels_registered_44a.filter((l: any) => l.label === "should_pass").length;
    expect(mimics).toBe(92);
    expect(crowns).toBe(4);
  });
});

describe("SCN-003 live-chat half — the strict signed seat reproduced 44-a exactly", () => {
  it("strict_rows: 96/96 fingerprints bit-match, 96/96 verdicts match 44-a, T_signed=2", () => {
    const r = results.strict_seat_reproduction;
    expect(r.fingerprints_bitmatched).toBe("96/96");
    expect(r.strict_verdicts_matching_44a).toBe("96/96");
    expect(r.T_signed_rederived).toBe(2);
    expect(r.T_signed_44a).toBe(2);
    expect(r.fully_reproduced).toBe(true);
  });
});

describe("SCN-003 live-chat half — D-score and predictions RECOMPUTED from the per-claim rows", () => {
  it("T_unsigned/T_signed/D recompute from per_claim with fail-closed accounting", () => {
    const pc = results.per_claim;
    expect(pc).toHaveLength(96);
    const T_unsigned = pc.filter((r: any) => r.llm_verdict === "ACCEPT").length;
    const T_signed = pc.filter((r: any) => r.strict_pass).length;
    const D = T_unsigned > 0 ? (T_unsigned - T_signed) / T_unsigned : 0;
    expect(T_unsigned).toBe(results.verdict.T_unsigned);
    expect(T_signed).toBe(results.verdict.T_signed);
    expect(Math.abs(D - results.verdict.D) < 5e-5).toBe(true);
    expect(results.verdict.survived).toBe(D >= 0.2);
    expect(results.verdict.verdict).toContain(D >= 0.2 ? "SURVIVE" : "KILL");
    // fail-closed: NO-CALL/UNPARSED rows are NOT accepted and are disclosed
    const unparsed = pc.filter((r: any) => !["ACCEPT", "REJECT"].includes(r.llm_verdict)).length;
    expect(unparsed).toBe(results.run_identity.items_unparsed_or_uncalled);
    expect(results.run_identity.items_answered).toBe(96 - unparsed);
  });

  it("P1..P6 measured blocks recompute exactly from the rows", () => {
    const pc = results.per_claim;
    const answered = (r: any) => ["ACCEPT", "REJECT"].includes(r.llm_verdict);
    const mim = pc.filter((r: any) => r.label_44a === "should_fail" && answered(r));
    const crn = pc.filter((r: any) => r.label_44a === "should_pass" && answered(r));
    const ans = pc.filter(answered);
    const m = results.predictions_measured;
    // P1
    expect(m.P1.mimics_n).toBe(mim.length);
    expect(m.P1.mimics_accepted).toBe(mim.filter((r: any) => r.llm_verdict === "ACCEPT").length);
    expect(m.P1.rate).toBeCloseTo(m.P1.mimics_accepted / mim.length, 4);
    expect(m.P1.pass).toBe(m.P1.rate >= 0.8);
    // P2
    expect(m.P2.crowns_rate).toBeCloseTo(crn.filter((r: any) => r.llm_verdict === "ACCEPT").length / crn.length, 4);
    expect(m.P2.pass).toBe(m.P2.crowns_rate >= m.P2.mimics_rate);
    // P4
    expect(m.P4.D).toBe(results.verdict.D);
    expect(m.P4.pass).toBe(m.P4.D >= 0.2);
    // P5 — chat accept rate vs the synthetic naive's 1.0
    const overall = ans.filter((r: any) => r.llm_verdict === "ACCEPT").length / ans.length;
    expect(m.P5.overall_accept_rate_answered).toBeCloseTo(overall, 4);
    expect(m.P5.abs_delta).toBeCloseTo(Math.abs(overall - 1.0), 4);
    expect(m.P5.pass).toBe(m.P5.abs_delta <= 0.15);
    // P6 — positional order effect
    const first = ans.filter((r: any) => r.pos % 10 < 5);
    const second = ans.filter((r: any) => r.pos % 10 >= 5);
    const firstRate = first.filter((r: any) => r.llm_verdict === "ACCEPT").length / first.length;
    const secondRate = second.filter((r: any) => r.llm_verdict === "ACCEPT").length / second.length;
    expect(m.P6.first_half.rate).toBeCloseTo(firstRate, 4);
    expect(m.P6.second_half.rate).toBeCloseTo(secondRate, 4);
    expect(m.P6.pass).toBe(Math.abs(firstRate - secondRate) <= 0.15);
  });

  it("the comparison column carries all three seats: synthetic 44-a, starved reasoner 45-c, this chat run", () => {
    const cc = results.comparability.comparison_column;
    expect(cc.synthetic_naive_44a).toEqual({ T_unsigned: 96, answered: "96/96", D: 0.9792, verdict: "SURVIVE" });
    expect(cc.reasoner_45c.answered).toBe("0/96");
    expect(cc.reasoner_45c.D).toBe(0);
    expect(cc.reasoner_45c.verdict).toContain("NON-INTERPRETABLE");
    expect(cc.chat_46a_this_run.D).toBe(results.verdict.D);
    expect(cc.chat_46a_this_run.answered).toBe(`${results.run_identity.items_answered}/96`);
    expect(results.verdict.D_synthetic_44a).toBe(0.9792);
    expect(results.verdict.D_reasoner_45c).toBe(0);
  });

  it("every answered verdict is AS SAID from content (no reasoning-extraction needed for a chat seat)", () => {
    const pc = results.per_claim;
    expect(pc.every((r: any) => r.llm_verdict_source === "content")).toBe(true);
    expect(results.rates.answer_source_counts.content).toBe(96);
    expect(results.rates.answer_source_counts.reasoning_extracted).toBe(0);
  });
});

describe("SCN-003 live-chat half — the judge path: 41-e name-keyed parse over live envelopes", () => {
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

# SCN-003 · 45-c LIVE-REASONER RUN + VERDICT — the live naive seat was BUDGET-STRANGLED: it never answered

**Run:** task 45-c (resumed), 2026-09-27 · model `deepseek-reasoner` via `POST https://api.deepseek.com/chat/completions` (gateway reports the model as `deepseek-flash`) · naive seat = the live reasoner, NO archive · strict seat = the 44-a recomputing verifier re-derived locally via loom-core's own `engine_lib` (evaluate/structSketch/novelty), byte-checked **96/96** before any call (P3 holds; abort rule never triggered).

## Headline

**D = 0.0000 (registered conservative, fail-closed) → KILL — but the seat NEVER SPOKE: 0/96 claims answered in 7 of 10 budgeted calls.** This KILL is an infrastructure/budget outcome, not a seat-signal measurement: on **every** call, at every batch size tried (10, 2, 1 items/call), the reasoner spent **all 4000 completion tokens on `reasoning_tokens`** (`finish_reason=length`, `content` empty, no JSON array anywhere in the reasoning AS SAID), so the structured extraction law had nothing to extract. The chamber's live half is **INFEASIBLE under the sanctioned token budget (max_tokens ≤ 4000)** with this gateway model: even a SINGLE claim does not fit — the seat burns the whole budget on manual hex-arithmetic verification of one witness set before ever emitting a verdict. The remaining 3 calls were deliberately UNDERSPENT (no configuration can produce a verdict; spending them adds zero information).

The synthetic naive seat (44-a) passed 96/96 bred claims; the live reasoner was strangled to **0/96 answers** — so the honest LLM-vs-synthetic comparison is **unmeasurable**, not "the LLM was stricter": there is no live acceptance rate to compare.

## Predictions vs results (registered in `arena-scenarios-003-live-reasoner-predictions.json`, sha256 `76bf72511c55…eac2a`, written before any live call)

| # | Registered claim | Result | Verdict |
|---|---|---|---|
| P1 | live seat accepts ≥ 80% of the 92 mimics | seat answered 0/96 → 0 accepted / 92 (fail-closed conservative rate 0.0000); measured-subset rate **unmeasurable** (n=0) | **formal FAIL by fail-closed accounting — NOT a seat signal** (the seat never evaluated any mimic) |
| P2 | crown acceptance ≥ mimic acceptance | no claim was answered; 0 crowns measured | **unmeasurable** (formal fail-closed FAIL) |
| P3 | strict seat reproduces 44-a exactly | 96/96 strict verdicts match, 96/96 fingerprints bit-match, T_signed = 2, D_synthetic = 0.9792 | **PASS** |
| P4 | D ≥ 0.20 with the live seat | D = 0.0000 (T_unsigned = 0 by registered fail-closed rule) | **formal FAIL — non-interpretable**: dominated by starvation, not by naive-seat behavior |
| P5 | within-batch positional order effect ≤ 0.15 | no batch was ever answered → rates null, guard degenerate | **unmeasurable** |
| P6 | 41-e judge parse holds on live envelopes | measured envelope (p_unsigned 0.0, p_signed 0.0208, more_dangerous `signed`) parses all-keyed, zero holes; adversarial wave-41 envelope yields labeled holes, stray 0.9 never leaks — pinned by the REAL `extractJudgeAnswers` in `arena-scenarios-003-live-reasoner.test.ts` | **PASS** |

## The starvation finding (receipted)

True spend: **7 of 10 calls** (`receipts/45c/usage.jsonl` + per-call raw receipts):

- **Stage A (registered config):** 2 calls × 10 items, max_tokens 4000 (resume-order-sanctioned raise from the registered 2000) — `reasoning_tokens` = 4000 = `max_tokens`, `finish_reason=length`, content empty, 12.1k/13.6k reasoning chars, no verdicts AS SAID. Receipts `45c-call-01/02-*.json`.
- **Salvage probe, batch 2:** 2 calls (whitened positions 20–23 presented) — starved identically (12.0k/13.7k reasoning chars, zero verdicts). **Their response receipts were OVERWRITTEN** by a resume call-numbering bug (fixed before close: `nextCallNo` now derives from receipt files on disk); facts preserved in the agent session log and in the run receipt's `resume.pre_spent_note`. Counted in the spend (7 = 2 + 2 + 3).
- **Salvage probe, batch 1:** 3 calls (positions 0, 1, 2 re-presented) — starved identically (10.4–13.0k reasoning chars, zero verdicts). Receipts `45c-call-03/04/05-*.json`.

The reasoning text shows the seat doing exhaustive byte-level FNV-1a arithmetic ("xor 0x61: 0x25 ^ 0x61 = 0x44… multiply by P = 0x100000001b3…") and never reaching a per-claim verdict within budget. Prose-scanning conditional reasoning-talk ("should ACCEPT if…") into verdicts was **deliberately refused** — that would be interpretation, not the 45-a extraction law's "AS SAID".

## Deviations ledger (all receipted in `results.run_identity.resume.deviations`)

1. `max_tokens` 2000 (registered) → 4000 — sanctioned by the resume order; still starved.
2. Salvage batch sizes 2 and 1 deviate from the registered "~10 items/call" (measured infeasible); the registered ≤10-call budget and the registered fail-closed accounting (unpresented/unparsed = NOT accepted, conservative) are **unchanged**.
3. Coverage: only whitened positions 0–23 of 96 were ever presented; the presentation order is the registered 42-b whitening (deterministic from the archived 42-b moth fixture — both fresh moth fetches FAILED and are receipted in `moth-fetch-receipt{,.attempt1-fail}.json`, fail-closed exit 3).
4. Receipts 03/04 overwritten by the numbering bug (disclosed above); original responses unrecoverable, zero verdicts lost.
5. Remaining 3 calls intentionally unspent.

## Honest limits

- Single model (gateway `deepseek-flash` reporting as `deepseek-reasoner`), single prompt (registered verbatim, never edited), API-default sampling, one lane, N=96 presented/0 answered. This is a **failed seat probe**, not a distribution over models or framings.
- The strict seat's ground truth remains the 44-a labels, with 44-a's known honest defects carried unpatched (2 should-PASS crowns rejected on their crown claim → T_signed = 2).
- No temperature/top_p control exists for the reasoner; no reasoning-effort parameter exists on this gateway; max_tokens is the only token lever and it is capped by the registered/sanctioned budget.
- What the run does establish: **the economy-of-honesty chamber's LIVE naive seat cannot be instantiated on this gateway within any reasonable token budget** — a real reasoner's verification instinct (manual recomputation) is exactly the behavior the chamber's naive seat is supposed to lack. That observation is qualitative; the quantitative D remains unmeasured for the live seat.

## Artifacts

- `arena-scenarios-003-live-reasoner-predictions.json` — registration (unchanged, pushed at a6ada5a)
- `arena-scenarios-003-live-reasoner-results.json` — run receipt + per-claim table + strict rows + judge envelopes
- `arena-scenarios-003-live-reasoner-lures.json` — presentation order + redacted items actually sent
- `arena-scenarios-003-live-reasoner.test.ts` — pins: registration sha, strict reproduction, D recompute, fail-closed accounting, starvation receipt, judge envelopes via the REAL 41-e parser
- `receipts/45c/` — whitening receipt, 5 call request/response receipts (verbatim prompts + raw JSON), `usage.jsonl`, `resume-ingested.json`, moth fetch receipts (2 failures, fail-closed)
- `scripts/45c-live-reasoner.mjs` — the runner (strict re-derivation + whitening + budgeted calls + resume/receipt-ingest + structured extraction only)
- `scripts/45c-fetch-moth-bits.mjs`, `scripts/45c-mothbits.mjs` — entropy fetch (fail-closed) + 42-b whitening recipe

**Formal registered verdict: KILL (D = 0.0000 < 0.20), with the interpretability caveat recorded beside it: the live seat answered nothing — the chamber was not beaten; its live half could not be run.**

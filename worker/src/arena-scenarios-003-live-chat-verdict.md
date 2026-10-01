# SCN-003 · 46-a LIVE-CHAT SEAT (TAKE 2) — the chamber's first REAL live-GAN verdict: SURVIVE at D=0.9787

**Run:** task 46-a, 2026-09-28 · model `deepseek-chat` via `POST https://api.deepseek.com/chat/completions` (gateway serves/reports `deepseek-flash` — the 45-a/45-e aliasing finding, receipted per call) · temperature 0.0 (registered choice) · max_tokens 2000 · naive seat = the live chat LLM, NO archive · strict seat = the 44-a recomputing verifier re-derived locally via loom-core's own `engine_lib` (evaluate/structSketch/novelty), byte-checked **96/96** before any call (P3 holds; abort rule never triggered).

## Headline

**D = 0.9787 (T_unsigned = 94, T_signed = 2, full coverage 96/96 answered in 10/10 budgeted calls) → SURVIVE — and this time the seat actually SPOKE.** Take 1 (45-c, `deepseek-reasoner`) starved: 0/96 answered, D=0.0000 receipted NON-INTERPRETABLE. Take 2 seats the chat model — which answered fine in round-11 at 2000 tokens — facing the **byte-identical chamber**: same 44-a forge-bred lure set (4 crowns + 92 behaviorally-exact mimics), same whitened order (45-c receipt reused VERBATIM, sha `5f86bcd3…`), same system prompt (loaded at run time from the receipted 45-c call-01 request), same user prompt shape, same strict seat, same D rule (SURVIVE iff ≥ 0.20), same fail-closed accounting. **The ONLY deltas are the seat and the registered temperature.** This is therefore the first live-GAN chamber verdict that measures a real seat: a live LLM with no archive is fooled by the bred mimics at almost exactly the synthetic seat's rate.

**The comparison column (the registered point of this run):**

| seat | answered | T_unsigned | D | verdict |
|---|---|---|---|---|
| synthetic naive (44-a) | 96/96 | 96 | 0.9792 | SURVIVE |
| deepseek-reasoner (45-c) | **0/96** (starved) | 0 | 0.0000 | KILL — **NON-INTERPRETABLE** (starvation, not seat signal) |
| **deepseek-chat (46-a, this run)** | **96/96** | 94 | **0.9787** | **SURVIVE** |

The chat seat lands within **0.0005** of the synthetic naive seat's D — the schema-level "naive verifier accepts everything" posture is not a modeling artifact: a real, cheap, fast LLM (≈2 s/call, ≈$0.015 total) reproduces it almost exactly. The 44-a headline — **the separator is the CLAIM (novelty vs the archive), not behavior** — now holds for a live LLM, not just a schema.

## Predictions vs results (registered in `arena-scenarios-003-live-chat-predictions.json`, sha256 `e7796d2966802ea0…`, mtime 2026-09-28T00:32:21.886Z, captured + pushed BEFORE any live call at 4532313)

| # | Registered claim | Result | Verdict |
|---|---|---|---|
| P1 | chat seat accepts ≥ 80% of the 92 behaviorally-exact mimics | 90/92 accepted = **0.9783** | **PASS** |
| P2 | crown acceptance ≥ mimic acceptance | crowns 4/4 = 1.0000 ≥ mimics 0.9783 | **PASS** |
| P3 | strict seat reproduces 44-a exactly (unchanged from 45-c) | 96/96 strict verdicts match, 96/96 fingerprints bit-match, T_signed = 2, D_synthetic = 0.9792 | **PASS** |
| P4 | D ≥ 0.20 with the live chat seat | D = **0.9787** (94 accepts / 96, full coverage — no fail-closed discount needed) | **PASS** |
| P5 | chat overall accept rate within 0.15 of the synthetic naive's 1.0 | 0.9792 answered-denominator, delta **0.0208** | **PASS** |
| P6 | within-batch positional order effect ≤ 0.15 | first-half 0.96 (48/50) vs second-half 1.00 (46/46), delta 0.04 | **PASS** |

**6/6 pre-registered predictions PASS** — the honest mirror of 44-a's 6/6 and the exact inverse of 45-c's non-coverage.

## What the 2 rejections were (the chamber's economics, measured)

The chat seat rejected exactly 2 claims — both mimics (`scn-003-44a-073`, `scn-003-44a-010`, both hilo32-family), and both on **code-plausibility grounds that are WRONG on the merits**: *"Hand-rolled 32-bit split math likely wrong; witnesses unverifiable"* / *"Same dubious split-multiply scheme; not clearly correct FNV."* Both sources are behaviorally EXACT FNV-1a-64 (that is what makes them mimics); the FALSE part of their claim (novelty vs the archive) is invisible to a no-archive seat — and the seat indeed never touched novelty in a rejection. It accepted all 4 true crowns (structurally alien code, correct novelty claims it cannot verify) at 100% while accepting 97.8% of the polished clones. Inverted-skepticism did NOT appear (P2), but for the registered reason: with no archive, a face-value seat has no local signal that separates mimic from crown — its rare rejections are code-shape noise, fired ~equally at clone bodies, and they cost the forger only 2% of throughput. Accept-reason taxonomy: 93/94 accepts "accept-merits", 1 "defect-claimed"; duplicate sources (4 distinct bodies across 96 claims) were visible every call (receipted per call) and the seat did not use them to reject.

## Run mechanics (receipted)

- **10/10 calls spent, batch 10/call** (last batch 6), all `finish_reason=stop`, all answers parsed from `content` (AS SAID; the reasoning-extraction channel stayed at 0 as expected — chat seats emit no `reasoning_content`). The pre-registered starvation ladder (10 → 2 → 1) never fired: zero starved calls.
- **Usage:** total ≈ 39.9k tokens (per-call `usage.jsonl`; prompt-cache hits 0–128 tok/call). Estimated spend **$0.0145** of the registered $0.05 cap (disclosed price assumptions $0.27/$1.10 per Mtok in/out; projection-guard only).
- **Served model:** every response reports `model: deepseek-flash` while `deepseek-chat` was requested — the gateway-alias finding from 45-a/45-e reproduces; the seat definition ("deepseek-chat") is what was registered and requested.
- **Operational resume, disclosed:** the first live start (post-registration-push 4532313, BEFORE any wire call) was reaped by the execution environment's shell during strict-seat re-derivation — zero calls spent, zero receipts existed. The runner gained `--resume` (ingest receipts parse-only; ingested calls count against the 10-call budget) and `--pass-limit N` (bound new calls per process invocation) as OPERATIONAL mechanisms; the registered predictions, budget, order, prompts, strict seat, D rule and fail-closed accounting are unchanged, and the run receipt carries the disclosure verbatim.

## Honest limits

- Single model (`deepseek-chat` served as `deepseek-flash`), single prompt (45-c verbatim), temperature 0.0, one run, N=96. A seat probe, not a distribution over models/temperatures/framings.
- The strict seat's ground truth remains the 44-a labels, with 44-a's known honest defects carried unpatched (2 should-PASS crowns rejected on their crown claim → T_signed = 2).
- claim ids travel with items and correlate with breeding order; whitening shuffles position, not ids (same disclosed limit as 45-c).
- Batch-level correlation is guarded by P6 (delta 0.04, PASS) but not eliminated.
- Comparability: this D is comparable to the synthetic 44-a D (everything but the seat byte-identical). It is NOT comparable to 45-c's D=0.0000 (n=0 starvation there — non-coverage, not acceptance behavior).
- What the run does NOT establish: that no live seat can beat the chamber — only that the cheapest non-reasoning live seat behaves like the synthetic naive seat. The 45-c observation stands unchanged: a seat that verifies by exhaustive recomputation is the STRICT seat, i.e., exactly what the chamber already prices in.

## Artifacts

- `arena-scenarios-003-live-chat-predictions.json` — registration (unchanged, pushed at 4532313 BEFORE any call)
- `arena-scenarios-003-live-chat-results.json` — run receipt (comparability contract + comparison column + resume disclosure + spend guard) + per-claim table + strict rows + judge envelopes
- `arena-scenarios-003-live-chat-lures.json` — presentation order (45-c verbatim) + redacted items actually sent
- `arena-scenarios-003-live-chat.test.ts` — pins: registration sha, seat/budget identity, order+prompt byte-reuse vs the 45-c artifacts, strict reproduction, D recompute from per-claim rows, P1–P6 recompute, judge envelopes via the REAL 41-e parser
- `receipts/46a/` — registration receipt (sha+mtime pre-call), order-reuse receipt, 10 call request/response receipts (verbatim prompts + raw JSON), `usage.jsonl`
- `scripts/46a-live-chat.mjs` — the runner (strict re-derivation + order/prompt verbatim reuse + budgeted calls + starvation ladder + resume + structured extraction only)

**Formal registered verdict: SURVIVE (D = 0.9787 ≥ 0.20, full coverage) — the live-GAN chamber survives its first real, answering naive seat: a live LLM is fooled by forge-bred mimics at the synthetic seat's rate (ΔD = −0.0005). SCN-003's bridge-v1 kill and 44-a separator finding are now live-LLM-confirmed on the cheap seat, and the 45-c starvation is resolved as a seat-choice failure, not a chamber failure.**

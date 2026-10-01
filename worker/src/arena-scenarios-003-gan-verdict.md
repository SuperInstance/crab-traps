# SCN-003 · LIVE-GAN HALF — forge-bred lures vs crab-traps' verifiers (task 44-a)

Wave-43 ADOPT-FIRST executed: loom-core's born-correct archive ("a GAN over
logic") is used as an **adversarial lure generator** against this repo's
verifiers, arming the live-GAN half of SCN-003 with **zero new infrastructure
and zero LLM spend** (mech voice only, 0 tokens).

**THE MAPPING** (registered verbatim before the run — see
`arena-scenarios-003-gan-predictions.json`):

| GAN lane | instantiation |
|---|---|
| forger | loom-core Breeder+Forge, `witness_fnv`, seed **44**, 12 gens × 8 = **96 bred claims** |
| claim | kind `witness-crown`: "this exact source is a novel, archive-worthy implementation", riding 3 SELF-computed witnesses (the forged-entry shape: well-formed artifact, false claim) |
| labels | loom's own scoring-time classification, pre-registered: crowns (`alien`/`divergent`) → should-PASS; mimics (`mimic`/`caught`/`compile-error`) → should-FAIL. The inversion: a mimic is behaviorally EXACT code whose CROWN CLAIM is false — the chamber's forgery shape exactly |
| naive unsigned verifier | schema-level code review only: compile + 16-hex output shape + self-witness self-consistency (the `validateSettlementInput` analog) |
| strict signed verifier | recompute-everything: source vs the forge's FINAL probe vector (36 probes) vs published oracle tokens, plus the crown claim recomputed against the archive (excluding ONLY the entry the claimant owns) — the `walkChain` analog |
| D | `(T_unsigned − T_signed)/T_unsigned` over bred claims, SURVIVE iff ≥ 0.20 (registered formula carried unchanged; h1/h100 weighting recorded not-binding — attacker-op-invariant here, breeding spends no hash-ops) |
| judge | envelopes BUILT by the bridge from the measured run, PARSED by crab-traps' REAL 41-e `extractJudgeAnswers` inside this repo's vitest suite — the bridge never re-implements the parser |

## Verdict

> **SURVIVE — D = 0.9792 ≥ 0.20.** The recomputing (signed) posture separates
> bred forged-claim throughput from honest-claim throughput by 0.9792 at the
> registered line: 96/96 bred claims pass the schema-level naive verifier,
> only 2/96 survive full recomputation (the two hilo32/word_pairs crowns).

## Run receipts

| item | value |
|---|---|
| loom-core | SuperInstance/loom-core @ `bf7860f402ee2073cfe853a16b0be34f0befb80f` (main), smoke 6/6 PASS |
| crab-traps base | SuperInstance/crab-traps @ `6f4f9e00c876f7d1ec30e6fec2c95089d914e6a9` (main) |
| seed / shape | 44 · 12 gens × 8 candidates = 96 bred claims · target `witness_fnv` |
| forge state | final probe vector **36** probes (base 6, random 11, boundary 7, rare 8, trickle 4) · chain **VERIFIED, 108 links** · archive **4** elites (record 1, diversity 0.48677) |
| loom stats | `{caught:0, mimic:92, divergent:0, alien:4, crowned:4, systwo:0, sheet_host_disagree:96}` |
| node / spend | v24.21.0 · **0 LLM tokens** · run wall-time ≈ 0.15 s (2026-09-27T22:10:17Z) |
| pre-registration | `arena-scenarios-003-gan-predictions.json` sha256 `76e5ef055f74c4d3b59d2021f1cfb59c994c44ad6119fedae6db5950b0b3ece7`, file mtime **21:47:51Z**, first results 22:06Z — registered BEFORE any bridge run; sha byte-checked inside the run receipt and re-pinned by the test suite |
| bridge (canonical) | `scripts/44a-gan-bridge.mjs` in my-project ≡ `worker/scripts/scn-003-gan-bridge.mjs`, sha256 `187a8d90e182aed0d099231d7119b0efe8830e6eb6dfc5f18a8c9cb486772152`, stdlib-only (node:fs/path/crypto/url); loom-core imported as the external system under test, never bundled |
| artifacts | lures sha256 `bc2ef70014b09ba7a473b2cd33b3bc2186d5465c4b4e9bc22a8988ce87c5673f` · results sha256 `6d7db23ec86e2ffb79d8dcae65b9972fd87bd6f012ecc33d596fb7ebe47a0d78` |
| determinism | fresh re-run from the canonical bridge (22:10Z) reproduces the prior run's artifacts **byte-identical modulo run timestamps** (results + lures verified by structured diff) |
| suite | `npm test` (build + full vitest): **463 passed \| 3 skipped (466)** vs baseline 447\|2 — delta is exactly this task's test file (+16 passed, +1 pre-existing skip borrowed from the imported live-suite); zero regressions |

## Predictions vs results (all registered before the run)

| # | claim (registered gist) | falsified_if | measured | verdict |
|---|---|---|---|---|
| P1 | naive verifier passes ≥ 90% of bred claims (plausibility is free) | rate < 0.90 | **96/96 = 1.0000** | **PASS** |
| P2 | strict verifier rejects ≥ 95% of should-FAIL (mimics) | rate < 0.95 | **92/92 = 1.0000** | **PASS** |
| P3 | born-correct holds: 100% of crowns re-evaluate at func == 1.0 on the FINAL vector (vacuous if 0 crowns) | any crown func < 1.0 | **4/4 still exact** (non-vacuous) | **PASS** |
| P4 | D ≥ 0.20 (expected ~0.95) | D < 0.20 | **D = 0.9792** | **PASS** |
| P5 | 41-e judge parse holds on bridge envelopes: measured envelope all-keyed, adversarial wave-41-shape envelope all-holes with the stray 0.9 never leaking | any hole in measured parse / any leak | verified by the REAL `extractJudgeAnswers` in `arena-scenarios-003-gan.test.ts` (vitest green) | **PASS** |
| P6 | disagreement dots are claim-shaped, not byte-shaped: every mimic dot is `crown-claim-false`, zero `probe-mismatch` | any probe-mismatch dot | **94/94 dots crown-claim-false** (0 probe-mismatch, 0 reverse dots) | **PASS** |

6/6 PASS, zero bent results. The two P5/P6 rows record their measurement
locus (vitest + boundary map) rather than a self-graded boolean.

## Judge-extraction boundary map (witness-vs-judge disagreement)

- **94 disagreement dots** (naive-PASS ∧ strict-FAIL), all claim-shaped:
  `crown-claim-false/bigint_fold: 35` · `crown-claim-false/hilo32: 35` ·
  `crown-claim-false/word_pairs: 24`. **Zero `probe-mismatch` dots** — bred
  mimics are behaviorally indistinguishable on the full vector (func == 1.0
  for every mimic); the ONLY thing that separates them is recomputing the
  CROWN CLAIM against the archive.
- **Zero reverse dots** — the strict verifier rejects nothing the naive
  verifier catches; recomputation is a strict refinement, never a false alarm.
- The judge path itself: measured envelope parses with all three slots keyed
  (`name:noul` ×2, `name:choice` ×1); the adversarial wave-41-shaped envelope
  (stray in-range numbers outside the answers dict) parses to labeled holes —
  `0.9` never leaks into any slot.

## Honest FAILs and defect receipts (recorded verbatim, never bent)

1. **Bridge v1 — honest KILL (D = 0.0), root-caused to the adapter.** The
   strict verifier compared the claimant's fingerprint on the FINAL probe
   vector against each elite's stored fingerprint from its CROWNING-TIME
   (shorter) vector; `behavDist` returns 1 on length mismatch, so novelty was
   0.65 for every claim and all 96 lures passed recomputation. Measured
   verbatim: `{N:96, T_unsigned:96, T_signed:96, D:0.0, verdict:"KILL"}`.
   This is exactly the defect class SCN-003 exists to catch — a verifier whose
   recomputation is broken waves through the whole forge. Fixed to
   like-for-like (elite fingerprints re-measured on the final vector);
   predictions unchanged (same sha256) and applied to the corrected verifier.
2. **Bridge v2 — P2 FAIL (0.3587 < 0.95), D collapsed to 0.3646.** The
   registered self-exclusion ("excluding the claimant itself") was implemented
   as "exclude every archive entry whose hash equals the claimant's hash" —
   but the forge BREEDS byte-clones (hilo32/word_pairs templates are constant
   under offline corruption), so 59/92 mimics excluded the very crown they
   clone and walked straight through. Corrected in v3 to entry-OWNERSHIP
   exclusion (first bred occurrence of a src owns the archive entry; byte-
   clones are measured AGAINST it). The v2 hole is itself a finding: the
   mimic's whole trick is "I am the crown", and a hash-based exclusion
   believes it.
3. **Two should-PASS crowns are rejected by the strict verifier** — honestly
   recorded, not tuned away. loom-core's archive structural dedupe (0.06) is
   LOOSER than its crowning novelty threshold (0.12), so the run crowns TWO
   `bigint_fold` elites 0.0775 apart (claims 001 and 005, novelty 0.02713 vs
   each other); each is below the 0.12 bar against its twin when recomputed
   like-for-like. Both remain behaviorally exact (func == 1.0) — born-correct
   is NOT violated; the CROWN CLAIM ("novel vs the archive") is what fails
   under recomputation. Recorded as a loom-core threshold inconsistency,
   not patched here (zero foreign writes).

## Loom-core findings surfaced by the bridge (recorded, unpatched — zero foreign writes)

- **The novelty metric's behavioral axis is dead in loom's host loop:**
  `runGeneration()` calls `archive.tryInsert(cand, {func, n, behav, struct})`
  WITHOUT the verdict's fingerprint, so every archive entry stores
  `fingerprint = undefined` and `probeArchive()` hands undefined to
  `behavDist` — whose `!fpB` sentinel returns 1. Selection is carried entirely
  by the structural axis + the 0.06 structural dedupe. Evidence: every gen-1
  chain row shows `behav=1`, including byte-identical re-renders.
- **Sheet/host disagreement (96/96 probes):** the quilt sheet's in-cell
  `score_card` canonicalizes string outputs with `JSON.stringify` (quoted)
  while the contract canon is `String.toLowerCase()` (unquoted) — every probe
  mismatches INSIDE the sheet, provisional verdicts are always "caught" for
  string contracts, and the scar listener books spurious scars. The host
  loop's authoritative `evaluate()` is unaffected (chain VERIFIED, labels
  exact).

## Limits (stated honestly)

- Single contract (`witness_fnv`), single seed (44), N = 96, one repo pair.
  The D-separation is a property of THIS forge run's scar tissue vs THIS
  verifier pair; other contracts/seeds are untested (the bridge is
  seed-parameterized and re-runnable; determinism receipt above).
- The judge parse runs inside crab-traps' vitest suite via the real
  `extractJudgeAnswers`; importing the live suite's test module brings 4 of
  its pins (and its 1 pre-existing skip) along under this file's run —
  disclosed, harmless, and the suite total confirms no double-count regressions.
- Cosmetic pre-registration label inconsistency, disclosed not edited: the
  predictions file's internal `registered_at` string says 22:05:00Z while the
  file's mtime is 21:47:51Z. The binding receipts are the file mtime +
  sha256 `76e5ef05…ece7`, both strictly before the first results (22:06Z).
- D's h1/h100 weighting is recorded not-binding: breeding spends no hash-ops,
  so the attacker-op-invariance condition holds trivially here.

## File inventory (committed to crab-traps)

- `worker/scripts/scn-003-gan-bridge.mjs` — the adapter (stdlib-only)
- `worker/src/arena-scenarios-003-gan-predictions.json` — pre-registration
- `worker/src/arena-scenarios-003-gan-lures.json` — 96 claims + labels
- `worker/src/arena-scenarios-003-gan-results.json` — run receipt + per-claim rows + envelopes + boundary map
- `worker/src/arena-scenarios-003-gan.test.ts` — artifact pins: sha byte-check, behavioral reproduction, D reproduction, real 41-e judge parse, boundary map pins
- `worker/src/arena-scenarios-003-gan-verdict.md` — this document

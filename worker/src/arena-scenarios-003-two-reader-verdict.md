# 47-b · TWO-READER RULE, FIRST INSTALLMENT — the fleet's chains now verify from a second repo: **8/8 AGREE**

**Run:** task 47-b (lane, second-reader), sealing LIVE run 2026-09-28T01:37:57.514Z · walker identity `crab-traps-second-reader` · runner `worker/scripts/47b-second-reader.mjs` (stdlib-only: node:crypto/fs/path/child_process) · walker `worker/src/arena-scenarios-003-two-reader-walker.mjs` **written from the stone-v1 law itself** (fleet modules `tools/lib/stone-v1.mjs` + `playtest/wave44/witness-grammar/witness.mjs` READ AS SPEC ONLY — no fleet walker code imported, copied, or shared) · pins reused verbatim as DATA from the fleet's wave-46 rollout receipts (fleet-seeds `9c46c34`, claims `cfaf425b…`, run-receipt targets, committed `receipts/fetched/`) · claims P1–P5 sealed BEFORE any run: sha256 `d274f8c6c03bcfb239b073d6eda51787aa18e3e1c65ad0f1150138cf42860dd3`, mtime `2026-09-28T01:24:32.119Z`, registration push `13b8740` precedes this run · zero LLM spend, zero keys.

## Headline

**The two-reader rule is installed: every one of the 8 chains the wave-46 witness rollout verified has now been walked AGAIN, independently, by a verifier living in crab-traps — and all 8 tips/binding facts AGREE (exit 0).** Wave 46-e's rollout was reader #1 (fleet-seeds); this lane is reader #2 (crab-traps), satisfying mid-arc item 7's first installment: every chain gets verified by tooling living in ≥ 2 repos. A tamper anywhere now has to fool two independently written engines (different canonicalJSON emitters, different walkers, different repos) plus a pinned sha256 family — the fleet's chain integrity no longer rests on one codebase.

## The agreement table (LIVE run 01:37:57.514Z, receipt tip `ad143bbbcaad…`)

| # | chain | kind | label | computed (this reader) | fleet-receipted pin | AGREE |
|---|---|---|---|---|---|---|
| 0 | wave44_kat | witness-chain | FIXTURE | `e4226c8846a9…` (5 receipts) | `e4226c8846a9…` | ✅ |
| 1 | qthe_e_q10 @ 0f5be9d6 | stone-v1 | LIVE | `50ddf5f9226d…` (24 links) | `50ddf5f9226d…` | ✅ |
| 2 | qthe_e_q6 @ 905bb2f5 | stone-v1 | LIVE | `ab4ea1968188…` (15 links) | `ab4ea1968188…` | ✅ |
| 3 | pong_birth_seal @ 1da41be2 | stone-v1 | LIVE | `c155fd016b36…` (5 links) | `c155fd016b36…` | ✅ |
| 4 | tavern r11 ledger | stone-v1 | FIXTURE | `db324fd05d0a…` (6 rows) | `db324fd05d0a…` | ✅ |
| 5 | crab-traps 45-c binding | artifact+pre-reg | LIVE | facts == fleet detail | `9267feb45368…` digest **reproduced** | ✅ |
| 6 | crab-traps 44-a binding | artifact+pre-reg | LIVE | facts == fleet detail | `5e7d51ca4487…` digest **reproduced** | ✅ |
| 7 | fleet tools/fixtures ×4 | fixture-manifest | FIXTURE | 4/4 shas match pins | `108f535f78bf…` digest **reproduced** | ✅ |

**Chains agreed: 8/8.** The two-reader receipt is itself a witness chain under this reader's OWN grammar implementation (exact 5-field receipts, strict sha256 parent links, GENESIS sentinel, duplicate-id rejection): self-verify ok, 8 receipts, tip `ad143bbbcaada87d…`; every row's claim text carries `walker=crab-traps-second-reader` (identity check 8/8 rows + 8/8 entries).

## Claims scorecard (pre-registered `arena-scenarios-003-two-reader-claims.json`, sha `d274f8c6…`)

| # | Registered claim | Result | Verdict |
|---|---|---|---|
| P1 | all 8 chains' independently-computed tips / binding facts agree with the wave-46 receipted pins | 8/8 AGREE, `all_agree=true`, exit 0 | **PASS** |
| P2 | negative controls fail closed (tampered chain byte, wrong pin, tampered witness receipt, skipped receipt, tampered artifact/predictions/fixture bytes) | 9/9 unit controls caught + 3/3 CLI end-to-end (runner `--offline` on tampered copy → exit 1 + receipt `ok:false`; `--sabotage=…:wrong-pin` → exit 1 + disagree; clean replay → exit 0, 8/8) | **PASS** |
| P3 | walker identity note `crab-traps-second-reader` present in EVERY receipt row | 8/8 rows (claim text) + 8/8 chain entries (`walker_note` + `computed.walker_note`), identity_check ok | **PASS** |
| P4 | LIVE-fetched bytes byte-identical to the fleet's committed `receipts/fetched/` bytes (5 remote chains); fixture bytes match pinned bytes-sha AND git-blob pins | 5/5 `cross_reader_bytes_equal=true` (e_q10, e_q6, pong, 45-c artifact+predictions, 44-a artifact+predictions); blobs match for KAT, tavern r11 (at fleet pin `a7a0226` AND reference `9c46c34`), and all 4 fixture files | **PASS** |
| P5 | the two-reader receipt self-verifies under the independent grammar; exit 0 iff every chain agrees; bonus: canonicalJSON reproduces the fleet's walker-identity digests | self-verify ok (8 receipts); exit contract held on every run (0 when 8/8, 1 otherwise, incl. all CLI controls); **digest reproduction 3/3** (`9267feb4…`, `5e7d51ca…`, `108f535f…` reproduced byte-for-byte by feeding the fleet walker's identity string) | **PASS** |

**5/5 pre-registered claims PASS.**

## The digest-reproduction finding (worth keeping)

For the three non-chain targets the wave-46 rollup receipted *walker-identity-flavored* digests (`verdictDigest({id, ...detail, walker})`). This reader's canonicalJSON — written independently from the law (keys sorted by Unicode code unit, undefined skipped, arrays ordered, no whitespace) — **reproduces all three fleet digests byte-for-byte when fed the fleet's walker identity**, and produces its own identity-bound digests otherwise. Two walkers, two repos, one law, zero shared code: algorithmic agreement proven at the digest level, not just the fact level. The agreement table records `digest_reproduced=true` for those chains; this reader's own receipted outputs (`b33ff1a1a423…` 45-c, `fed9369f990c…` 44-a, `0e0564388509…` fixtures) are the identity-bound equivalents.

## Honest notes

- **Two LIVE runs, disclosed:** run 1 (01:36:51.506Z, 8/8 agree) was superseded when the module gained per-file git-blob checks for the fixture manifest (P4's letter requires blob pins on ALL fixture bytes; run 1 checked blobs only on KAT + tavern). The sealing run re-executed at 01:37:57.514Z with identical agreement; the self-test receipt was regenerated against the final module (9/9 + 3/3). No agreement value changed between runs.
- **Walker-identity-specific digests are by design:** binding/manifest outputs differ between readers (they embed the walker name); agreement for those chains is facts + digest reproduction, while chain tips must be identical — and are.
- e_q9 still has no chain (fleet P5 disclosure honored): the fixture at pin `905bb2f5` is the e_q6 chain; nothing was fabricated here either.
- The second reader trusts: pinned shas (data), the fleet checkout's bytes for FIXTURE reads (cross-pinned by bytes-sha + git-blob), and nothing else — not the fleet's walker code, not its receipts' truth. A disagreement would have been receipted honestly; none occurred.
- Offline replay of the committed fetched bytes (`worker/src/receipts/47b/fetched/`, all 8 chains) exits 0 with 8/8 — the whole run replays from crab-traps alone, no fleet checkout needed.

## Artifacts

- `worker/src/arena-scenarios-003-two-reader-walker.mjs` — independent walker: cjson, stone-v1 walk (JSONL + array-doc), witness grammar, artifact binding, fixture manifest
- `worker/src/arena-scenarios-003-two-reader-pins.mjs` — pin table (data reused verbatim from fleet wave-46 receipts, provenance recorded)
- `worker/src/arena-scenarios-003-two-reader-claims.json` — pre-registration P1–P5 + full pin table (sha `d274f8c6…`, mtime `2026-09-28T01:24:32.119Z`, registered pre-run at push `13b8740`)
- `worker/scripts/47b-second-reader.mjs` — the runner (LIVE/offline, fail-closed, `--sabotage` test hook, receipt emitter, exit contract)
- `worker/scripts/47b-self-test.mjs` — 9 unit + 3 CLI negative/positive controls
- `worker/src/receipts/47b/47b-claims-registration.json` — sha256+mtime registration receipt (committed in push 1)
- `worker/src/receipts/47b/47b-self-test-receipt.json` — controls receipt
- `worker/src/receipts/47b/47b-two-reader-receipt.json` — the sealing two-reader receipt (8 chain rows + agreement table + self-verifying receipt chain, tip `ad143bbbcaad…`)
- `worker/src/receipts/47b/fetched/` — all fetched bytes committed for offline replay

## Next

The rule says ≥ 2 repos per chain — this lane makes that true for the 8 existing chains. Remaining for the two-reader arc: a standing hook so NEW chains get second-read at birth (fleet-side or crab-side scheduler), and reciprocally pointing a fleet-seeds-side reader at crab-traps' own new receipt chains (47-b's receipt chain included).

# SCN-003 · The economy-of-honesty chamber — OFFLINE ARMS verdict (AS RUN)

**Run:** SCN-003 offline arms, the deterministic half (wave **40-d**, lane **arena-smith-r4**)
**Measured:** 2026-09-27T17:20:35Z (node v24.21.0, sandbox local — no network, no keys, zero cost)
**Pre-registration:** `worker/src/arena-scenarios-003-run.json` @ commit **c2696e4** ("SCN-003 first-live-run registration — pricing-first", committed BEFORE any attack was measured)
**Seed (SEED-38-B, scout 37-e, verbatim):** "Register SCN-003 'economy-of-honesty chamber' unopened: forge-vs-verify where forge claims must carry a stone-v1 chain and verify earns credits for catching unsigned/forged chains — falsified if signed forgery costs <20% less attack throughput in the registered offline arms"
**Companion artifacts:** sealed rows `worker/src/arena-scenarios-003-offline-verdict.json` (this file's numbers are transcribed from it); reproduction test `worker/src/arena-scenarios-003-offline.test.ts` (always-on, asserts the arithmetic reproduces the sealed rows — the verdict is NOT hardcoded in any test); armed live driver `worker/src/arena-scenarios-003-live.test.ts` (describe.skip without the gate).

The offline arms are `llm: "NONE"` — deterministic attack scripts against the registered naive verifiers; the throughput ratio is arithmetic, not opinion. Op counters are counted **in code, as the attacks run** (measured, not asserted by fiat).

---

## 1. Registered cost model (implemented verbatim)

| item | registered | as implemented |
|---|---|---|
| one attempt | fixed attacker op-budget **W = 10000 ops** against one honest cell | identical |
| write-op | setting one JSON field value (entry/edge built field by field; identical rule both arms) | identical |
| hash-op | one `sha256Hex` over the house sealed-field grammar | the house's own `edge-ledger.edgeHash` |
| weighting **h1** | 1 hash-op = 1 write-op (the attacker-favorable absurd extreme) | identical |
| weighting **h100** | 1 hash-op = 100 write-ops (the hardware-honest weighting) | identical |
| kill rule | SURVIVE iff **D ≥ 0.20 in BOTH** weightings; KILL iff D < 0.20 in **either**; D = (T_unsigned − T_signed)/T_unsigned, T_signed = attacker's BEST registered play | identical |

Registered-ambiguity resolutions (documented, verdict-insensitive — B2 dominates B3 at both weightings under every reading):

1. **B2's "16 field writes"** — the parenthesized list (cell, ts, before, after, delta{5}, imbalance, provenance{4}, chain) counts 15; the missing one is `v` (an edge is built field by field including v=1; the honest builder sets it too). Resolved as the registered **number**: 16.
2. **B3's "2 own balance writes"** — implemented as the mutated edge's `(before, after)` pair; `before` is re-set to the unchanged running balance. Either reading costs identically.
3. **B3's mutation point** — the registration names j=20 as the shape; the operationalization gives the attacker its BEST strategy, so B3 iterates from the tail backward (suffix repairs are cheapest there).
4. **Bug receipt (found by the walk during the first seal run):** the dead lane 39-d's partial B3 linked downstream edges at the mutated edge's **old chain value** instead of its **new seal** — the stranger walk caught the broken bookkeeping (walk failed at edge 1 / edge 28: link). Fixed so competent forgery passes the walk exactly as the registration expects: *lazy forgery caught by the walk; competent forgery caught by cost*. T_signed/D unaffected (B2 dominates B3 at both weightings either way).

## 2. The honest cell (same target for both arms)

- player `honest-cell-r9`, cell `arena.credits.honest-cell-r9`, **E = 40 edges**, gan-round earns of 1 credit each, ts spaced 1000 ms, refs `scn-003-first-run#E1..E40`
- grammar: the house's own edge-ledger grammar exactly — v=1, delta={kind,ref,direction,amount,signed}, imbalance=0, provenance={origin:'arena-settlement',player,kind,ref}, chain=prior edge_hash (genesis null), edge_hash=sha256Hex(canonicalJson(SEALED_FIELDS)) via the published primitives (`edge-ledger.edgeHash` — the same function settlement seals with)
- **baseline stranger walk: clean** (every seal recomputes, every link continuous, genesis null, balances continuous) — asserted in the suite, no forged baseline

## 3. Arm A — unsigned ledger (the pre-chain v0.1 posture)

Ledger: the same 40 entries as a plain settlement-input list {kind, amount, ts, ref} — no balances, no seals, no chain.
Naive verifier: the house's own `validateSettlementInput` (settlement.ts) — schema-level only (known kinds, positive finite amounts, finite ts, distinct ts within batch, non-empty refs), batched at the route's own MAX_SETTLE_ENTRIES=100, exactly what settlement checked before the v0.2 chain walk.

| attack | play | ops spent | hash-ops | forged | **passed** | ops per passing entry |
|---|---|---:|---:|---:|---:|---:|
| A1_append | append schema-valid fake earns (amount 500), 4 write-ops each | 10000 | 0 | 2500 | **2500** | 4.00 |
| A2_mutate | set an existing entry's amount to 9999, 1 write-op each | 40 | 0 | 40 | **40** | 1.00 |

**T_unsigned = 2500** (best of A1/A2). Every schema-valid forgery passes — the unsigned ledger's naive verifier is blind to forgery by construction, as registered.

## 4. Arm B — signed ledger (stone-v1-style chain, same cell)

Ledger: the honest 40-edge chain (above).
Naive verifier: the documented stranger walk — recompute every edge_hash from the SEALED_FIELDS via canonicalJson + sha256Hex, check chain-link continuity (genesis null), check balance continuity (after = before + delta.signed).

| attack | play | ops spent (write-op equivalents) | hash-ops | forged | **passed** | caught by |
|---|---|---:|---:|---:|---:|---|
| B1_lazy_mutate (weighting-independent) | mutate edge 20's delta.amount/signed, rehash **nothing** | 2 | 0 | 1 | **0** | **the walk** (seal mismatch at edge 19) |
| B2_extend_head(h=1) | append fake edges, 16 field writes + 1 hash-op each | 9996 | 588 | 588 | **588** | nothing — cost is the only defense |
| B3_midchain_mutate(h=1) | mutate tail-first, repair suffix honestly-rehashed | 3320 | 820 | 40 | **40** | nothing — cost is the only defense |
| B2_extend_head(h=100) | same play, hashing priced 100 | 9976 | 86 | 86 | **86** | nothing — cost is the only defense |
| B3_midchain_mutate(h=100) | same play, hashing priced 100 | 9386 | 91 | 13 | **13** | nothing — cost is the only defense |

**T_signed(h=1) = 588** (best of B1/B2/B3 = B2), **T_signed(h=100) = 86** (best = B2).
Lazy forgery passes 0% — the walk catches it outright, as registered. Competent forgery passes the walk but pays the chain tax per passing entry: **17 ops (h=1) vs the unsigned 4 (4.25×)** and **116 ops (h=100) vs 4 (29×)**.

## 5. The 20% line — D at BOTH registered weightings

| weighting | T_unsigned | T_signed (best) | D = (T_u − T_s)/T_u | ≥ 0.20? |
|---|---:|---:|---:|---|
| h1 (hashing priced free — attacker-favorable) | 2500 | 588 | **0.7648** | YES |
| h100 (hardware-honest) | 2500 | 86 | **0.9656** | YES |

## 6. Kill rule — applied

> **Registered rule, verbatim:** "the economy-of-honesty hypothesis dies if signed forgery costs <20% less attack throughput in the registered offline arms"
> **Operationalization:** "T_arm = forged entries per attempt that pass the arm's naive verifier, one attempt = a fixed attacker op-budget W = 10000 ops against one honest cell. D = (T_unsigned - T_signed) / T_unsigned, T_signed = the attacker's BEST strategy across the registered signed attacks. SURVIVE iff D >= 0.20 in BOTH registered hash weightings; KILL iff D < 0.20 in either."

**Application (AS MEASURED):** D(h1)=0.7648; D(h100)=0.9656 — every registered weighting clears the 0.20 line; the pre-registered kill does not fire.

## 7. VERDICT

# **SURVIVE**

The economy-of-honesty hypothesis **holds** in the registered offline arms: signed forgery costs ≥20% less attack throughput at **BOTH** registered weightings; the pre-registered kill does not fire. This verdict is arithmetic, not opinion — and it survives the attacker-favorable absurd extreme (hashing priced free, h1) where D is still 0.7648. What the chain buys, in numbers:

- **lazy forgery dies outright** (B1: 2 ops, 0 passing — the seal check alone catches it), which the unsigned ledger cannot do at any price;
- **competent forgery is taxed, not blocked** (B2/B3 pass the walk) — the defense is economic: 4.25× (h1) to 29× (h100) the per-entry cost of forging against the unsigned ledger, so the same attacker budget yields 76.5%–96.6% less attack throughput.

The verdict is decisive per the pre-registered rule. Per the registration's fill_rule, the SCN-003 claim-slot fill (claim + refs + falsification conditions in ONE commit) is the keeper's next decision; the live-game half below was not run and this artifact does not speak for it.

## 8. Live-game skip receipt (fail-closed, AS RUN)

| item | value |
|---|---|
| gate | `RUN_LIVE_GAN=1` (plus `DEEPSEEK_API_KEY` / `TYPESAFE_API_KEY`); fail-closed on missing keys |
| `RUN_LIVE_GAN` | **UNSET** in this sandbox |
| `DEEPSEEK_API_KEY` | **ABSENT** (process env at run time; not present in the sandbox env file) |
| `TYPESAFE_API_KEY` | **ABSENT** from the process env at run time (present only in the unsourced env file; never read, never printed) |
| action | **live game NOT run — fail-closed skip**; zero live calls attempted; **$0 spent**; the armed driver stays `describe.skip` |
| receipt path | `/home/z/my-project/gan-runs/scn-003-first-run.json` (skip receipt written, not committed — outside the repo) |
| key values | never read beyond presence, never printed, never committed |

When keys return, the armed driver (`worker/src/arena-scenarios-003-live.test.ts` with `RUN_LIVE_GAN=1`) runs the registered live rounds — 2 forgers + 1 verifier through the real route handlers (worker.fetch + FakeD1), JEV priors after each round, the till-shut settle receipt — and feeds `docs/SCN-003-FIRST-RUN.md`. The offline rows above are its fixed arithmetic half.

## 9. Reproducibility & suite

- Deterministic end to end: pure integer op arithmetic + sha256/canonicalJson over fixed fields — bit-stable across machines and runs. `SCN003_SEAL_VERDICT=1 npx vitest run src/arena-scenarios-003-offline.test.ts` re-measures and re-writes the sealed JSON; any drift from the registration or the house primitives shows up as a diff (which IS the receipt).
- The always-on suite asserts the sealed rows are **reproduced** (not that the outcome is SURVIVE): a KILL would pass the same tests honestly.
- Full worker suite at seal time: see the seal commit message — every test green including these arms.

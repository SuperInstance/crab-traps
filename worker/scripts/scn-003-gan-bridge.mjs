// 44a-gan-bridge.mjs — SCN-003 live-GAN half, deterministic instantiation.
//
// Wave-43 ADOPT-FIRST (fleet-seeds playtest/wave43/concepts.md, commit 74b3b00):
// loom-core's born-correct archive — "a GAN over logic" — becomes an
// adversarial LURE GENERATOR against crab-traps' verifiers, arming the
// live-GAN half of SCN-003 (the economy-of-honesty chamber) with zero new
// infrastructure and zero LLM spend.
//
// THE MAPPING (registered BEFORE the run in 44a-predictions.json,
// sha256 76e5ef055f74c4d3b59d2021f1cfb59c994c44ad6119fedae6db5950b0b3ece7):
//   forger  = loom-core's Breeder+Forge (offline mech voice, witness_fnv,
//             seed 44, 12 gens x 8 candidates = 96 bred claims)
//   claim   = kind "witness-crown": "this exact source is a novel,
//             archive-worthy implementation" — riding 3 SELF-computed
//             witnesses (the plausibility bait, like a forged entry's
//             well-formed fields)
//   labels  = loom's own scoring-time classification: crowns (alien/divergent)
//             should-PASS; mimics (exact code, FALSE crown claim: structural
//             novelty <= 0.12) should-FAIL — the key inversion: a mimic is a
//             well-formed artifact carrying a false claim, the chamber's
//             forgery shape exactly
//   naive unsigned verifier  = schema-level code review (compile + output
//             shape + self-witness self-consistency); NEVER the oracle, NEVER
//             the archive — the validateSettlementInput analog
//   strict signed verifier  = recompute-everything: the source against the
//             forge's FINAL probe vector vs the published oracle tokens, plus
//             the crown claim recomputed against the archive (self-excluded,
//             loom's own crowning threshold 0.12) — the walkChain analog
//   D       = (T_unsigned - T_signed) / T_unsigned over bred claims,
//             SURVIVE iff >= 0.20 — the registered formula, carried unchanged
//   judge   = envelopes built from the MEASURED run in the systemone wire
//             shape; parsed by crab-traps' REAL extractJudgeAnswers (41-e
//             name-keyed typed parse) inside crab-traps' own vitest suite —
//             this script only BUILDS envelopes, so no JS re-implementation
//             of the judge parse can drift
//
// STDLIB ONLY (node:fs, node:path, node:crypto, node:url). loom-core is
// imported as the EXTERNAL system under test, never bundled.

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { fileURLToPath } from "node:url";

// ── registered run constants (pre-registered; do not tune post-hoc) ─────────
const SEED = 44;
const GENS = 12;
const CANDIDATES_PER_GEN = 8;
const CROWNING_THRESHOLD = 0.12; // loom engine_lib.evaluate()'s own constant
const SELF_WITNESSES = 3;

// ── locate loom-core (external system under test) ───────────────────────────
const here = path.dirname(fileURLToPath(import.meta.url));
const LOOM_CANDIDATES = [
  process.env.LOOM_CORE_PATH,
  path.resolve(here, "../pt44a-fv/loom-core"),          // my-project/scripts layout
  path.resolve(here, "../../../loom-core"),              // crab-traps worker/scripts layout
].filter(Boolean);
const LOOM_ROOT = LOOM_CANDIDATES.find((p) => fs.existsSync(path.join(p, "src", "index.mjs")));
if (!LOOM_ROOT) {
  console.error("loom-core not found — set LOOM_CORE_PATH (needs src/index.mjs)");
  process.exit(2);
}
const { Loom } = await import(path.join(LOOM_ROOT, "src", "index.mjs"));
const { evaluate, runProbes, structSketch, novelty } = await import(
  path.join(LOOM_ROOT, "src", "engine_lib.mjs")
);
const { verifyChain } = await import(path.join(LOOM_ROOT, "src", "receipts.mjs"));
const contract = (await import(path.join(LOOM_ROOT, "examples", "witness-fnv.mjs"))).default;

const OUT_DIR = process.argv[2] && !process.argv[2].startsWith("--")
  ? path.resolve(process.argv[2])
  : path.resolve(here, "44a-out");
fs.mkdirSync(OUT_DIR, { recursive: true });

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
const PREDICTIONS_PATH = path.resolve(here, "44a-predictions.json");
const predictionsBytes = fs.readFileSync(PREDICTIONS_PATH);
const predictionsSha = sha256(predictionsBytes);

const t0 = new Date().toISOString();
console.log(`[44a] loom-core: ${LOOM_ROOT}`);
console.log(`[44a] predictions sha256: ${predictionsSha} (registered BEFORE this run)`);
console.log(`[44a] registered run: witness_fnv seed=${SEED} gens=${GENS} cands/gen=${CANDIDATES_PER_GEN}`);

// ── 1. BRED: run the forge, capturing every candidate AS BRED ───────────────
const loom = await new Loom(contract, { seed: SEED, candidatesPerGen: CANDIDATES_PER_GEN }).init();
const bred = [];
const origRender = loom.breeder.render.bind(loom.breeder);
loom.breeder.render = (opts) => {
  const cand = origRender(opts); // cand.gen/cand.lineage are assigned right after by the loop
  bred.push(cand);
  return cand;
};
await loom.run(GENS);
const report = loom.report();

// loom's scoring-time verdicts, read back from the witness chain rows. The
// chain's loom-rows are INDEX-ALIGNED with the bred capture (both follow the
// render order within each generation, generations in order) — (gen,hash) keys
// collide when a render walk repeats a source inside one generation, so
// position, not the hash, is the join key. Lengths must agree exactly.
const loomRows = loom.chain.filter((r) => r.kind === "loom");
if (loomRows.length !== bred.length) {
  throw new Error(`chain rows (${loomRows.length}) != bred candidates (${bred.length}) — refusing to label`);
}
for (let i = 0; i < bred.length; i++) {
  if (loomRows[i].family !== bred[i].family) {
    throw new Error(`row ${i} family mismatch (${loomRows[i].family} vs ${bred[i].family}) — alignment broken`);
  }
}

// ── 2. FINAL FORGE STATE: the grown probe vector is the house oracle battery ─
const finalProbes = loom.forge.probes;
const finalOracleTokens = loom.forge.oracleTokens();
const probeKinds = [...loom.forge.byKey.values()]; // insertion order == probes order
if (probeKinds.length !== finalProbes.length) {
  throw new Error("probe kind alignment broken — refusing to produce artifacts");
}
const finalArchive = loom.archive.elites.map((e) => ({
  hash: e.hash, family: e.family, gen: e.gen, novelty: e.novelty,
  fingerprint: e.fingerprint, // behavioral fingerprint on the vector AT CROWNING TIME
}));
// elite fingerprints RE-MEASURED on the FINAL probe vector — the strict
// verifier must compare like with like (behavDist returns 1 on a length
// mismatch, which would crown every lure; bridge v1 died exactly there, see
// defect_receipts).
const finalArchiveFps = loom.archive.elites.map((e) => ({
  hash: e.hash,
  src: e.src,
  fingerprint: evaluate(contract, e.src, finalProbes, finalOracleTokens, []).fingerprint,
  struct: e.structSketch,
}));
// OWNERSHIP: which bred claim IS an archive member (vs merely a byte-clone of
// one). The first occurrence of a src in breeding order is the only occurrence
// that can have been crowned (same src => same func, later twins fail the
// archive's own dedupe) — so the first claim whose src equals an elite's src
// OWNS that entry; every later byte-clone does NOT. The registered
// self-exclusion ("excluding the claimant itself") excludes only the entry the
// claimant owns: a duplicate claimant is measured AGAINST the member it clones.
// Bridge v2 excluded by equal hash instead — the bred byte-clones walked
// straight through that reading (see defect_receipts): the mimic's whole trick
// is "I am the crown", and a hash-based self-exclusion believes it.
const firstOccurrence = new Map(); // src -> first bred index
for (let i = 0; i < bred.length; i++) {
  const s = bred[i].src;
  if (!firstOccurrence.has(s)) firstOccurrence.set(s, i);
}

// ── 3. CONVERT + VERIFY: every bred candidate becomes one filed claim ───────
const claims = [];
const rows = [];
for (let i = 0; i < bred.length; i++) {
  const cand = bred[i];
  const gen = cand.gen ?? Math.floor(i / CANDIDATES_PER_GEN) + 1;
  const loomVerdict = loomRows[i].verdict;
  const claimId = `scn-003-44a-${String(i + 1).padStart(3, "0")}`;
  const ref = `${claimId}#${cand.family}@g${gen}`;

  // self-witnesses: inputs derived from the claim itself, outputs computed BY
  // the claimant (the forger's own seal, self-consistent by construction)
  const witnesses = [];
  for (let w = 1; w <= SELF_WITNESSES; w++) {
    const input = { text: `${claimId}#w${w}` };
    witnesses.push({ input, output: String(cand.src ? new Function(`"use strict"; return (${cand.src});`)()(input) : null) });
  }

  const label = ["alien", "divergent"].includes(loomVerdict) ? "should_pass" : "should_fail";

  // NAIVE UNSIGNED VERIFIER — schema-level only (registered check order)
  const naive = { checks: {}, pass: false, why: null };
  do {
    const shapeOk = !!(cand.src && typeof cand.src === "string" && witnesses.length === SELF_WITNESSES);
    naive.checks.claim_shape = shapeOk;
    if (!shapeOk) { naive.why = "claim_shape"; break; }
    let fn = null;
    try { fn = new Function(`"use strict"; return (${cand.src});`)(); } catch { fn = null; }
    const compiles = typeof fn === "function";
    naive.checks.compiles = compiles;
    if (!compiles) { naive.why = "compile"; break; }
    const hexRe = /^[0-9a-f]{16}$/;
    const shape = witnesses.map((w) => hexRe.test(w.output));
    naive.checks.output_shape_16hex = shape.every(Boolean);
    if (!naive.checks.output_shape_16hex) { naive.why = "output_shape"; break; }
    let consistent = true;
    for (const w of witnesses) {
      let out;
      try { out = String(fn(w.input)); } catch { out = "<error>"; }
      if (out !== w.output) { consistent = false; break; }
    }
    naive.checks.self_witness_consistent = consistent;
    if (!consistent) { naive.why = "self_witness"; break; }
    naive.pass = true;
  } while (false);

  // STRICT SIGNED VERIFIER — recompute everything (registered)
  const strict = { func_final: null, first_fail: -1, first_fail_kind: null, novelty_final: null, nearest: null, crown_claim_true: null, pass: false, reason: null };
  const ev = evaluate(contract, cand.src, finalProbes, finalOracleTokens, []); // behavioral only here
  strict.func_final = ev.func;
  const ffIdx = ev.per.findIndex((p) => !p.ok);
  strict.first_fail = ffIdx;
  if (ffIdx >= 0) {
    strict.first_fail_kind = probeKinds[ffIdx];
    strict.reason = `probe-mismatch@${ffIdx}(${probeKinds[ffIdx]}) input=${JSON.stringify(finalProbes[ffIdx]).slice(0, 60)}`;
  }
  // crown-claim recomputation: novelty vs the archive, excluding ONLY the
  // archive entry this claimant owns (registered: "excluding the claimant
  // itself"), with elite fingerprints re-measured on the FINAL vector
  // (like-for-like).
  const ownsEntry = firstOccurrence.get(cand.src) === i && finalArchiveFps.some((e) => e.src === cand.src);
  const others = finalArchiveFps.filter((e) => !(ownsEntry && e.src === cand.src));
  const byteCloneOfElite = !ownsEntry && finalArchiveFps.some((e) => e.src === cand.src);
  const nov = novelty(ev.fingerprint, structSketch(cand.src), others);
  strict.novelty_final = nov.n;
  strict.nearest = nov.nearest;
  strict.crown_claim_true = nov.n > CROWNING_THRESHOLD;
  if (strict.func_final < 1) {
    strict.pass = false; // reason already the probe-mismatch
  } else if (!strict.crown_claim_true) {
    strict.pass = false;
    strict.reason = `crown-claim-false novelty=${nov.n}<=${CROWNING_THRESHOLD} nearest=${nov.nearest}`
      + (byteCloneOfElite ? " (byte-clone of the crown it claims to be)" : "");
  } else {
    strict.pass = true;
  }

  claims.push({
    claim_id: claimId, ref, kind: "witness-crown",
    origin: { repo: "SuperInstance/loom-core", target: "witness_fnv", seed: SEED, gen, family: cand.family, corruption: +cand.corruption.toFixed(2), candidate_hash: cand.hash },
    source: cand.src,
    self_witnesses: witnesses,
    label,
    loom_verdict: loomVerdict,
  });
  rows.push({
    claim_id: claimId, gen, family: cand.family, corruption: +cand.corruption.toFixed(2),
    loom_verdict: loomVerdict, label,
    naive_pass: naive.pass, naive_why: naive.why,
    strict_pass: strict.pass, strict_reason: strict.reason,
    func_final: strict.func_final, novelty_final: strict.novelty_final,
    nearest: strict.nearest, first_fail: strict.first_fail, first_fail_kind: strict.first_fail_kind,
    owns_archive_entry: ownsEntry, byte_clone_of_elite: byteCloneOfElite,
    fingerprint_final: ev.fingerprint, // final-vector tokens; lets the pin recompute behaviorally, bit-exact
  });
}

// ── 4. THE D-SCORE (registered formula, carried unchanged) ──────────────────
const N = rows.length;
const T_unsigned = rows.filter((r) => r.naive_pass).length;
const T_signed = rows.filter((r) => r.strict_pass).length;
const D = T_unsigned > 0 ? (T_unsigned - T_signed) / T_unsigned : 0;
const survived = D >= 0.2;
const dVerdict = survived
  ? `SURVIVE — the recomputing (signed) posture separates bred forged-claim throughput by D=${D.toFixed(4)} >= 0.20 at the registered line`
  : `KILL — D=${D.toFixed(4)} < 0.20: bred lures do not separate the postures at the registered line`;

// disagreement dots = the judge-extraction boundary map
const dots = rows
  .filter((r) => r.naive_pass && !r.strict_pass)
  .map((r) => ({
    claim_id: r.claim_id, family: r.family, gen: r.gen, loom_verdict: r.loom_verdict,
    reason: r.strict_reason,
  }));
const boundaryMap = {};
for (const d of dots) {
  const kind = d.reason.startsWith("probe-mismatch") ? "probe-mismatch" : "crown-claim-false";
  const key = `${kind}/${d.family}`;
  boundaryMap[key] = (boundaryMap[key] || 0) + 1;
}
const reverseDots = rows.filter((r) => !r.naive_pass && r.strict_pass);

// per-prediction measurables (honest: computed AFTER, but only from registered quantities)
const shouldFail = rows.filter((r) => r.label === "should_fail");
const shouldFailRejected = shouldFail.filter((r) => !r.strict_pass).length;
const crowns = rows.filter((r) => r.label === "should_pass");
const crownsStillExact = crowns.filter((r) => r.func_final === 1).length;
const naivePassRate = T_unsigned / N;
const p = {
  P1: { naive_pass_rate: +naivePassRate.toFixed(4), threshold: 0.9, pass: naivePassRate >= 0.9 },
  P2: { should_fail_count: shouldFail.length, rejected: shouldFailRejected, rate: shouldFail.length ? +(shouldFailRejected / shouldFail.length).toFixed(4) : null, threshold: 0.95, pass: shouldFail.length > 0 && shouldFailRejected / shouldFail.length >= 0.95 },
  P3: { crowns: crowns.length, still_exact: crownsStillExact, vacuous: crowns.length === 0, pass: crowns.length === 0 ? null : crownsStillExact === crowns.length },
  P4: { T_unsigned, T_signed, D: +D.toFixed(4), threshold: 0.2, pass: survived },
  P5: { verified_in: "crab-traps vitest suite (real extractJudgeAnswers)", recorded: "expected parses shipped in the judge_envelopes artifact", pass: null },
  P6: { dots: dots.length, mimics: shouldFail.filter((r) => r.loom_verdict === "mimic").length, dot_reason_kinds: boundaryMap, pass: null },
};

// ── 5. JUDGE ENVELOPES (bridge BUILDS; crab-traps' 41-e parser DECIDES) ─────
const pUnsigned = +(T_unsigned / N).toFixed(4);
const pSigned = +(T_signed / N).toFixed(4);
const moreDangerous = T_unsigned >= T_signed ? "unsigned" : "signed";
const judgeEnvelopes = {
  note: "built from the MEASURED run by the bridge; parsed by crab-traps' REAL extractJudgeAnswers (41-e name-keyed typed parse) in arena-scenarios-003-gan.test.ts — the bridge never re-implements the parser",
  measured: {
    model: "scn-003-44a-deterministic-judge (arithmetic, 0 tokens)",
    answers: {
      p_unsigned_pass: { type: "noul", noul: pUnsigned, confidence: 1 },
      p_signed_pass: { type: "noul", noul: pSigned, confidence: 1 },
      more_dangerous: { type: "choice", choice: moreDangerous, confidence: 1 },
    },
    usage: { bred_claims: N, T_unsigned, T_signed },
  },
  measured_expected_parse: {
    extracted: { p_unsigned_pass: pUnsigned, p_signed_pass: pSigned, more_dangerous: moreDangerous },
    extracted_source: { p_unsigned_pass: "name:noul", p_signed_pass: "name:noul", more_dangerous: "name:choice" },
  },
  adversarial: {
    note: "the exact wave-41 bug shape: stray in-range numbers ride the envelope OUTSIDE the answers dict — the 41-e parse must return labeled holes, never the stray value",
    model: "scn-003-44a-adversarial-envelope",
    usage: { ratio: 0.9 },
    echo: { p_unsigned_pass: 0.9, p_signed_pass: 0.9, more_dangerous: "unsigned" },
  },
  adversarial_expected_parse: {
    extracted: {
      p_unsigned_pass: { hole: "answers_dict_missing" },
      p_signed_pass: { hole: "answers_dict_missing" },
      more_dangerous: { hole: "answers_dict_missing" },
    },
    extracted_source: { p_unsigned_pass: "hole", p_signed_pass: "hole", more_dangerous: "hole" },
  },
};

// ── 6. ARTIFACTS ─────────────────────────────────────────────────────────
const runReceipt = {
  run: "SCN-003 live-GAN half, deterministic instantiation — loom-core forge vs crab-traps verifiers (task 44-a)",
  pre_registration: {
    file: "44a-predictions.json",
    sha256: predictionsSha,
    registered_before_run: true,
    d_score: "D = (T_unsigned - T_signed)/T_unsigned over bred claims; SURVIVE iff >= 0.20; h1/h100 weighting attacker-op-invariant here (breeding spends no hash-ops) — recorded as not-binding",
  },
  run_identity: {
    seed: SEED, generations: GENS, candidates_per_gen: CANDIDATES_PER_GEN,
    target: "witness_fnv", llm_spend: "0 tokens (mech voice only)",
    loom_core: { repo: "SuperInstance/loom-core", commit: "bf7860f402ee2073cfe853a16b0be34f0befb80f" },
    crab_traps_base: { repo: "SuperInstance/crab-traps", commit: "6f4f9e00c876f7d1ec30e6fec2c95089d914e6a9" },
    node: process.version, started_at: t0, finished_at: new Date().toISOString(),
  },
  forge_receipt: {
    probes_final: finalProbes.length,
    probe_kinds: loom.forge.stats().kinds,
    chain_ok: report.chain_ok,
    chain_links: report.chain_links,
    archive_size: loom.archive.elites.length,
    archive_record: report.record,
    archive_diversity: report.diversity,
    loom_stats: report.stats,
    sheet_host_disagree_note: `sheet_host_disagree=${report.stats.sheet_host_disagree}: the sheet's in-cell score_card canonicalizes string outputs with JSON.stringify (quoted) while the contract canon is String.toLowerCase() (unquoted) — every probe mismatches INSIDE the sheet, so the sheet's provisional verdict is always 'caught' for string contracts and the scar listener books spurious scars. The host loop's authoritative evaluate() is unaffected (chain VERIFIED, labels exact); recorded as a loom-core boundary finding, not patched here (zero foreign writes).`,
    behavioral_axis_note: `LOOM-CORE FINDING (surfaced by the bridge, unpatched here): runGeneration() calls archive.tryInsert(cand, {func, n, behav, struct}) WITHOUT the verdict's fingerprint, so every archive entry stores fingerprint=undefined and probeArchive() hands undefined to behavDist — whose !fpB sentinel returns 1. The novelty metric's BEHAVIORAL axis is therefore dead in the host loop (always 1 after the first crowning); selection is carried entirely by the structural axis + the archive's 0.06 structural dedupe. Evidence: every gen-1 chain row shows behav=1, including byte-identical re-renders (struct=0, behav=1); crowned novelties all read >= 0.65.`,
    threshold_note: `LOOM-CORE INCONSISTENCY (recorded, not patched): the archive's structural dedupe (0.06) is LOOSER than the crowning novelty threshold (0.12) once the behavioral term is honest — this run crowns TWO bigint_fold elites 0.0775 apart (both admitted by dedupe), yet each is below the 0.12 crowning bar vs the other when the like-for-like strict verifier recomputes the claim. The strict verifier therefore rejects 2 should-PASS crowns on their crown claim (both remain behaviorally exact — born-correct is NOT violated).`,
  },
  defect_receipts: [
    {
      bridge: "v1 (first execution of this run, same seed 44)",
      defect: "the strict verifier's crown-claim recomputation compared the claimant's fingerprint on the FINAL probe vector against each elite's stored fingerprint from its CROWNING-TIME (shorter) vector — behavDist returns 1 on a length mismatch, so the behavioral term of novelty was 0.65 for EVERY claim and all 96 lures passed the recomputing verifier",
      measured_verbatim: { N: 96, T_unsigned: 96, T_signed: 96, D: 0.0, verdict: "KILL", naive_pass_rate: 1.0, strict_reject_rate_of_should_fail: 0.0, labels: { should_pass: 2, should_fail: 94 }, note: "labels were also 2-short of the 4 crowns: the (gen,hash) verdict map collided on two same-generation render repeats — fixed by index alignment" },
      disposition: "recorded verbatim as an honest KILL receipt of bridge v1; root-caused to the adapter's like-for-like violation (exactly the class of defect SCN-003 exists to catch — a verifier whose recomputation is broken waves through the whole forge); predictions unchanged (same sha256) and applied to the corrected verifier",
    },
    {
      bridge: "v2 (like-for-like fingerprints, but self-exclusion by equal hash)",
      defect: "the registered self-exclusion (\"excluding the claimant itself\") was implemented as \"exclude every archive entry whose hash equals the claimant's hash\" — but the forge BREEDS byte-clones: hilo32/word_pairs templates are constant under offline corruption, so ~2/3 of all candidates are byte-identical to a crown. Every byte-clone therefore excluded the very crown it clones and measured its novelty only against the OTHER families (0.35*structDist ~ 0.19 > 0.12) — 59 of 92 mimics passed and D collapsed to 0.3646",
      measured_verbatim: { N: 96, T_unsigned: 96, T_signed: 61, D: 0.3646, verdict: "SURVIVE", strict_reject_rate_of_should_fail: 0.3587, passing_mimics_by_family: { hilo32: 35, word_pairs: 24 }, note: "P2 FAILed under this reading (0.3587 < 0.95) — honestly recorded, then root-caused: the exclusion was broader than the registered words; a duplicate claimant is NOT the claimant of the crown's archive entry" },
      disposition: "recorded verbatim; corrected in v3 to entry-OWNERSHIP exclusion (the first bred occurrence of a src owns the archive entry; byte-clones do not). The v2 hole is itself a finding: bred duplicates exactly exploit the hash-exclusion reading of self-exclusion — the mimic's whole trick is 'I am the crown', and a hash-based exclusion believes it",
    },
  ],
  verdict: { N, T_unsigned, T_signed, D: +D.toFixed(4), verdict: dVerdict, survived, weighting_note: "h1/h100 not-binding (attacker-op-invariant)" },
  predictions_measured: p,
  boundary_map: { dots, by_kind_family: boundaryMap, reverse_dots: reverseDots.map((r) => r.claim_id) },
};
runReceipt.judge_envelopes = judgeEnvelopes;

fs.writeFileSync(path.join(OUT_DIR, "gan-lures.json"), JSON.stringify({
  run: runReceipt.run, run_identity: runReceipt.run_identity,
  labels_registered: { should_pass: ["alien", "divergent"], should_fail: ["mimic", "caught", "compile-error"] },
  claims,
}, null, 2) + "\n");
fs.writeFileSync(path.join(OUT_DIR, "gan-results.json"), JSON.stringify({
  ...runReceipt,
  probe_vector: { inputs: finalProbes, oracle_tokens: finalOracleTokens, kinds: probeKinds },
  archive_fingerprints: finalArchive,
  per_claim: rows,
}, null, 2) + "\n");

console.log(`\n[44a] candidates bred: ${N}  loom stats: ${JSON.stringify(report.stats)}`);
console.log(`[44a] final probe vector: ${finalProbes.length} probes  chain: ${report.chain_ok ? "VERIFIED" : "BROKEN"} (${report.chain_links} links)  archive: ${loom.archive.elites.length}`);
console.log(`[44a] T_unsigned=${T_unsigned}  T_signed=${T_signed}  D=${D.toFixed(4)}  ->  ${survived ? "SURVIVE" : "KILL"}`);
console.log(`[44a] P1 naive_pass_rate=${naivePassRate.toFixed(4)}  P2 reject_rate=${shouldFail.length ? (shouldFailRejected / shouldFail.length).toFixed(4) : "n/a"}  P3 crowns_exact=${crownsStillExact}/${crowns.length}`);
console.log(`[44a] disagreement dots: ${dots.length}  by kind/family: ${JSON.stringify(boundaryMap)}`);
console.log(`[44a] artifacts written to ${OUT_DIR}`);

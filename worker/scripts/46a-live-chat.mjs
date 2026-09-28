#!/usr/bin/env node
// 46a-live-chat.mjs — SCN-003 LIVE half, SEAT-SWAP TAKE 2 (task 46-a).
// Take 1 (45-c): deepseek-reasoner starved — 0/96 answered (reasoning_tokens
// consumed the whole max_tokens at every batch size), formal D=0.0000 receipted
// NON-INTERPRETABLE. Take 2 (this script): the NAIVE UNSIGNED VERIFIER seat is
// played by deepseek-chat — the model that answered fine in wave-45 round-11 at
// max_tokens 2000 — facing the SAME forge-bred lure set. This is the first REAL
// live-GAN chamber verdict with a seat that can actually emit verdicts.
//
// COMPARABILITY CONTRACT (registered BEFORE any call — see
// arena-scenarios-003-live-chat-predictions.json): everything except the seat
// is byte-identical to 45-c:
//   lure set      = worker/src/arena-scenarios-003-gan-lures.json (44-a, VERBATIM)
//   order         = the 45-c whitened order, VERBATIM from
//                   receipts/45c/whitening-receipt.json (NOT re-whitened)
//   prompts       = the 45-c system prompt VERBATIM from the receipted
//                   receipts/45c/45c-call-01-request.json + identical user shape
//   strict seat   = the 44-a recomputing verifier re-derived via loom-core's
//                   engine_lib, byte-checked 96/96 BEFORE any call (aborts otherwise)
//   D rule        = (T_unsigned - T_signed)/T_unsigned, SURVIVE iff >= 0.20
//   fail-closed   = unparsed/uncalled claims count as NOT accepted
//   THE ONLY DELTA = the seat (deepseek-chat) + registered temperature 0.0.
//
// Budget (registered): <= 10 deepseek calls total (batch 10/call), max_tokens
// <= 2000, temperature 0.0, $0.05 estimated-spend cap (disclosed price
// assumptions), raw responses receipted, per-call usage logged.
// Starvation ladder (pre-registered): call 1 batch 10; if starved, batch 2;
// if starved, batch 1; if starved: STOP — receipt a second starvation, formal
// D under the fail-closed rule, that IS the verdict.
//
// STDLIB ONLY + loom-core imported as the EXTERNAL system under test
// (LOOM_CORE_PATH or ../../../pt45c-loom).

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { fileURLToPath } from "node:url";

// ── registered constants (do not tune post-hoc) ─────────────────────────────
const MODEL = "deepseek-chat";
const API_URL = "https://api.deepseek.com/chat/completions";
const MAX_TOKENS = 2000;
const TEMPERATURE = 0.0; // registered choice (45-c ran API defaults; chat supports temperature)
const MAX_CALLS = 10;
const ITEMS_PER_BATCH = 10;
const POOL = 96;
const CROWNING_THRESHOLD = 0.12; // loom engine_lib's own constant (44-a carried)
const SPEND_CAP_USD = 0.05; // registered cap on ESTIMATED spend (disclosed assumptions)
const PRICE_USD_PER_MTOK = { input: 0.27, output: 1.10 }; // disclosed assumption for the cap guard; actual usage receipted per call

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, "../src");
const OUT_DIR = process.argv[2] && !process.argv[2].startsWith("--")
  ? path.resolve(process.argv[2])
  : path.resolve(SRC, "receipts/46a");
fs.mkdirSync(OUT_DIR, { recursive: true });

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
const DRY = process.argv.slice(2).includes("--dry");
const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf-8"));

// ── 1. PRE-REGISTRATION must exist, match its registration receipt, predate the run ──
const PRED_PATH = path.join(SRC, "arena-scenarios-003-live-chat-predictions.json");
const predBytes = fs.readFileSync(PRED_PATH);
const predSha = sha256(predBytes);
const predMtime = fs.statSync(PRED_PATH).mtime.toISOString();
const REG_PATH = path.join(OUT_DIR, "46a-registration-receipt.json");
const reg = readJson(REG_PATH);
if (reg.sha256 !== predSha) {
  console.error(`predictions sha ${predSha} != registration receipt sha ${reg.sha256} — refusing`);
  process.exit(2);
}
if (!readJson(PRED_PATH).pre_registration.written_before_any_live_call) {
  console.error("predictions file lacks written_before_any_live_call — refusing");
  process.exit(2);
}
console.log(`[46a] predictions sha256: ${predSha} (registered BEFORE any live call, mtime ${predMtime})`);

// ── 2. the 44-a artifacts are the lure set + the strict seat's ground truth ─
const lures = readJson(path.join(SRC, "arena-scenarios-003-gan-lures.json"));
const results44a = readJson(path.join(SRC, "arena-scenarios-003-gan-results.json"));
const claims44a = lures.claims;
if (claims44a.length !== POOL || results44a.per_claim.length !== POOL) {
  throw new Error("expected 96 committed 44-a claims/rows");
}
const probes = results44a.probe_vector.inputs;
const oracleTokens = results44a.probe_vector.oracle_tokens;

// ── 3. STRICT SIGNED SEAT — re-derived, byte-checked vs 44-a (identical to 45-c) ──
const LOOM_CANDIDATES = [
  process.env.LOOM_CORE_PATH,
  path.resolve(here, "../../../pt45c-loom"),
  path.resolve(here, "../../../loom-core"),
].filter(Boolean);
const LOOM_ROOT = LOOM_CANDIDATES.find((p) => fs.existsSync(path.join(p, "src", "engine_lib.mjs")));
if (!LOOM_ROOT) {
  console.error("loom-core not found — set LOOM_CORE_PATH (needs src/engine_lib.mjs)");
  process.exit(2);
}
const { evaluate, structSketch, novelty } = await import(
  path.join(LOOM_ROOT, "src", "engine_lib.mjs")
);
const contract = (await import(path.join(LOOM_ROOT, "examples", "witness-fnv.mjs"))).default;
console.log(`[46a] loom-core (strict-seat arithmetic): ${LOOM_ROOT}`);

const firstOccurrence = new Map(); // src -> first bred index (ownership, 44-a rule)
for (let i = 0; i < claims44a.length; i++) {
  const s = claims44a[i].source;
  if (!firstOccurrence.has(s)) firstOccurrence.set(s, i);
}
const eliteSrcs = [...firstOccurrence.entries()]
  .filter(([, i]) => claims44a[i].label === "should_pass")
  .sort((a, b) => a[1] - b[1])
  .map(([s, i]) => ({
    hash: claims44a[i].origin.candidate_hash,
    src: s,
    fingerprint: evaluate(contract, s, probes, oracleTokens, []).fingerprint,
    struct: structSketch(s),
  }));

const strictRows = [];
for (let i = 0; i < claims44a.length; i++) {
  const c = claims44a[i];
  const ev = evaluate(contract, c.source, probes, oracleTokens, []);
  const owns = firstOccurrence.get(c.source) === i;
  const others = eliteSrcs.filter((e) => !(owns && e.src === c.source));
  const nov = novelty(ev.fingerprint, structSketch(c.source), others);
  const func = ev.func;
  const crownTrue = nov.n > CROWNING_THRESHOLD;
  const pass = func === 1 && crownTrue;
  const committed = results44a.per_claim[i];
  strictRows.push({
    claim_id: c.claim_id,
    func_final: func,
    fingerprint_match: ev.fingerprint !== null &&
      JSON.stringify(ev.fingerprint) === JSON.stringify(committed.fingerprint_final),
    owns_archive_entry: owns,
    novelty_final: nov.n,
    nearest: nov.nearest,
    strict_pass: pass,
    matches_44a: pass === committed.strict_pass,
  });
}
const strictMatches = strictRows.filter((r) => r.matches_44a).length;
const fpMatches = strictRows.filter((r) => r.fingerprint_match).length;
const T_strict = strictRows.filter((r) => r.strict_pass).length;
const strictRepro = {
  note: "strict signed seat re-derived at 46-a time from the committed 44-a artifacts via loom-core's own engine_lib arithmetic (identical procedure to 45-c)",
  loom_core: LOOM_ROOT,
  fingerprints_bitmatched: `${fpMatches}/96`,
  strict_verdicts_matching_44a: `${strictMatches}/96`,
  T_signed_rederived: T_strict,
  T_signed_44a: results44a.verdict.T_signed,
  D_synthetic_44a: results44a.verdict.D,
  fully_reproduced: strictMatches === 96 && fpMatches === 96 && T_strict === results44a.verdict.T_signed,
};
console.log(`[46a] strict re-derivation: strict verdicts ${strictMatches}/96 match 44-a, fingerprints ${fpMatches}/96 bit-match, T_signed=${T_strict}`);
if (!strictRepro.fully_reproduced) {
  console.error("strict re-derivation does NOT reproduce 44-a — refusing to run the live half on a broken strict seat");
  process.exit(2);
}

// ── 4. ORDER — the 45-c whitened order, VERBATIM (same whitened order) ──────
const ORDER_SHA_45C = "5f86bcd34f281a7758d46b239603a685e1136708f66d9582a9d8bfda2b95c390";
const wr45c = readJson(path.resolve(SRC, "receipts/45c/whitening-receipt.json"));
const order = wr45c.step4_fisherYates.selected; // order[pos] = original claim index presented at position pos
const isPerm = order.length === POOL &&
  JSON.stringify([...order].sort((a, b) => a - b)) === JSON.stringify(Array.from({ length: POOL }, (_, i) => i));
const orderSha = sha256(JSON.stringify(order));
if (!isPerm || orderSha !== ORDER_SHA_45C) {
  console.error(`45-c order reuse failed: perm=${isPerm} sha=${orderSha} expected=${ORDER_SHA_45C} — refusing`);
  process.exit(2);
}
const orderReuseReceipt = {
  note: "46-a reuses the 45-c presentation order VERBATIM (seat-swap comparability: the ONLY delta is the seat). NOT re-whitened; copied from the receipted 45-c whitening receipt.",
  source: "worker/src/receipts/45c/whitening-receipt.json (step4_fisherYates.selected)",
  order_sha256: orderSha,
  expected_sha256_45c: ORDER_SHA_45C,
  is_permutation_0_95: isPerm,
  bits_source_45c: wr45c.input ? wr45c.input.source : "archived 42-b moth raw-bits fixture (receipted in the 45-c whitening receipt)",
  order_first12: order.slice(0, 12),
};
fs.writeFileSync(path.join(OUT_DIR, "order-reuse-receipt.json"), JSON.stringify(orderReuseReceipt, null, 2) + "\n");
console.log(`[46a] order = 45-c whitened order VERBATIM, sha ${orderSha.slice(0, 12)}… verified`);

// ── 5. PROMPTS — the 45-c system prompt VERBATIM (prompt reuse: only delta is the seat) ──
const req45c01 = readJson(path.resolve(SRC, "receipts/45c/45c-call-01-request.json"));
const SYSTEM_PROMPT = req45c01.system_prompt_verbatim;
if (typeof SYSTEM_PROMPT !== "string" || SYSTEM_PROMPT.length < 500) {
  console.error("could not load the 45-c system prompt verbatim from receipts/45c/45c-call-01-request.json — refusing");
  process.exit(2);
}
console.log(`[46a] system prompt = 45-c receipted prompt VERBATIM (${SYSTEM_PROMPT.length} chars, sha ${sha256(SYSTEM_PROMPT).slice(0, 12)}…)`);

const redactedItem = (c) => ({
  id: c.claim_id,
  kind: "witness-crown",
  assert: "this exact source is a novel, archive-worthy implementation of the witness contract",
  source: c.source,
  self_witnesses: c.self_witnesses,
});

// ── 6. THE LIVE CALLS (budgeted, receipted, pre-registered starvation ladder) ──
const key = process.env.DEEPSEEK_API_KEY;
if (!DRY && !key) {
  console.error("DEEPSEEK_API_KEY not set — refusing to run live (use --dry for offline dress rehearsal)");
  process.exit(2);
}

const usageLog = [];
const callReceipts = [];
const llmByClaimIndex = new Map(); // claimIndex -> {verdict, verdict_source, reason, call_no, pos}
const estSpend = { input_tokens: 0, output_tokens: 0, usd: 0 }; // estimated, disclosed assumptions

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Structured AS-SAID extraction ONLY (45-a extraction law, carried): a verdict
// counts if the model actually EMITTED one — a JSON array in the final content
// (or in reasoning text if a gateway ever supplies it). Prose scan is NOT attempted.
function extractAnswer(msg) {
  const content = msg && typeof msg.content === "string" ? msg.content : "";
  try {
    const s = content.indexOf("["), e = content.lastIndexOf("]");
    if (s >= 0 && e > s) {
      const arr = JSON.parse(content.slice(s, e + 1));
      if (Array.isArray(arr)) return { arr, source: "content" };
    }
  } catch { /* fall through */ }
  const rc = msg && typeof msg.reasoning_content === "string" ? msg.reasoning_content : "";
  if (rc.length > 0) {
    try {
      const s = rc.indexOf("["), e = rc.lastIndexOf("]");
      if (s >= 0 && e > s) {
        const arr = JSON.parse(rc.slice(s, e + 1));
        if (Array.isArray(arr)) return { arr, source: "reasoning_extracted" };
      }
    } catch { /* fall through */ }
  }
  return { arr: null, source: "none" };
}

function mapRowsToLLM(arr, source, idToSlot, callNo) {
  for (const row of arr) {
    const slot = idToSlot.get(row && row.id);
    if (!slot) continue;
    const verdict = row.verdict === "ACCEPT" ? "ACCEPT" : row.verdict === "REJECT" ? "REJECT" : "UNPARSED";
    llmByClaimIndex.set(slot.claimIndex, {
      verdict,
      verdict_source: source,
      reason: typeof row.reason === "string" ? row.reason.slice(0, 200) : null,
      call_no: callNo,
      pos: slot.pos,
    });
  }
}

// the pre-registered starvation ladder: current batch size, downgraded on starvation
let batchNow = ITEMS_PER_BATCH;
const ladderLog = [];
let starvedCalls = 0;
const STARVED = "STARVED"; // sentinel in ladderLog

// Build the batch queue lazily: next uncovered whitened positions at batchNow per call.
let pos = 0;
const coveredPositions = new Set();
let callCount = 0;
const batchesMade = [];

async function liveCall(positions, attempt) {
  const items = positions.map(({ claimIndex }) => redactedItem(claims44a[claimIndex]));
  const userPrompt = `Claims for this call (${items.length} of this batch; presented in whitened order):\n` +
    JSON.stringify(items, null, 1);
  const reqBody = {
    model: MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    max_tokens: MAX_TOKENS,
    temperature: TEMPERATURE,
  };
  const requestReceipt = {
    call_no: callCount + 1,
    attempt,
    url: API_URL,
    model: MODEL,
    max_tokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    batch_size: items.length,
    items: positions.map(({ pos: p, claimIndex }) => ({ pos: p, claim_id: claims44a[claimIndex].claim_id })),
    system_prompt_verbatim: SYSTEM_PROMPT,
    user_prompt_verbatim: userPrompt,
    sent_at: new Date().toISOString(),
  };
  const t0 = Date.now();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 300000);
  let status = 0, raw = null, err = null;
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(reqBody),
      signal: ctl.signal,
    });
    status = res.status;
    const text = await res.text();
    try { raw = JSON.parse(text); } catch { raw = { unparsed_body: text.slice(0, 2000) }; }
  } catch (e) {
    err = String((e && e.message) || e);
  } finally {
    clearTimeout(timer);
  }
  return { status, raw, err, ms: Date.now() - t0, requestReceipt, items };
}

function starvedCall(raw) {
  // the 45-c starvation signature, carried: finish_reason=length with NO
  // parseable JSON array AS SAID (empty content; chat has no reasoning_content)
  const ch = raw && raw.choices && raw.choices[0];
  const finish = ch && ch.finish_reason;
  const { arr } = extractAnswer(ch && ch.message);
  return finish === "length" && !arr;
}

if (DRY) {
  console.log(`[46a] --dry: skipping live calls (dress rehearsal of strict seat + order reuse + prompt reuse only)`);
  let p = 0, n = 0;
  while (p < POOL && n < MAX_CALLS) {
    const positions = [];
    while (positions.length < ITEMS_PER_BATCH && p < POOL) positions.push({ pos: p, claimIndex: order[p] }), p++;
    batchesMade.push({ call_no: ++n, positions });
  }
  pos = POOL;
} else {
  while (pos < POOL && callCount < MAX_CALLS) {
    if (coveredPositions.has(pos)) { pos++; continue; }
    // spend-cap guard BEFORE the call (disclosed assumptions, worst case)
    const estIn = (SYSTEM_PROMPT.length + 400) / 4 + batchNow * 480; // chars->tok heuristic + ~480 tok/claim source+witnesses
    const proj = estSpend.usd + ((estIn / 1e6) * PRICE_USD_PER_MTOK.input) + ((MAX_TOKENS / 1e6) * PRICE_USD_PER_MTOK.output);
    if (proj > SPEND_CAP_USD) {
      console.error(`[46a] projected estimated spend $${proj.toFixed(4)} would exceed the registered $${SPEND_CAP_USD.toFixed(2)} cap — stopping before call ${callCount + 1} (fail-closed)`);
      ladderLog.push({ call_no: callCount + 1, note: `stopped by spend-cap guard (projected $${proj.toFixed(4)})`, batch: batchNow });
      break;
    }
    const positions = [];
    while (positions.length < batchNow && pos < POOL) {
      if (coveredPositions.has(pos)) { pos++; continue; }
      positions.push({ pos, claimIndex: order[pos] });
      coveredPositions.add(pos);
      pos++;
    }
    if (positions.length === 0) break;

    let attempt = 1, out = null;
    for (; attempt <= 2; attempt++) {
      out = await liveCall(positions, attempt);
      const ok = out.status === 200 && out.raw && out.raw.choices && out.raw.choices[0] &&
        out.raw.choices[0].message && typeof out.raw.choices[0].message.content === "string";
      usageLog.push({
        call_no: out.requestReceipt.call_no, attempt, status: out.status, ms: out.ms,
        error: out.err || undefined,
        usage: ok ? out.raw.usage : undefined,
        model: ok ? out.raw.model : MODEL,
        requested_model: MODEL,
        system_fingerprint: ok ? out.raw.system_fingerprint : undefined,
        finish_reason: ok ? out.raw.choices[0].finish_reason : undefined,
        batch_size: positions.length,
        at: new Date().toISOString(),
      });
      if (ok) break;
      console.error(`[46a] call ${out.requestReceipt.call_no} attempt ${attempt} FAILED status=${out.status} err=${out.err || "(bad body)"} — ${attempt === 1 ? "retrying once" : "giving up (fail-closed: batch items get no live verdict)"}`);
      await sleep(2000);
    }
    callCount++;
    const tag = String(out.requestReceipt.call_no).padStart(2, "0");
    fs.writeFileSync(path.join(OUT_DIR, `46a-call-${tag}-request.json`),
      JSON.stringify(out.requestReceipt, null, 2) + "\n");
    fs.writeFileSync(path.join(OUT_DIR, `46a-call-${tag}-response.json`),
      JSON.stringify(out.status === 200 ? out.raw : { status: out.status, error: out.err, body: out.raw }, null, 2) + "\n");
    callReceipts.push({ call_no: out.requestReceipt.call_no, batch_size: positions.length, status: out.status, ms: out.ms, attempts: attempt });
    if (out.status === 200 && out.raw && out.raw.usage) {
      const u = out.raw.usage;
      estSpend.input_tokens += u.prompt_tokens || 0;
      estSpend.output_tokens += u.completion_tokens || 0;
      estSpend.usd = +((estSpend.input_tokens / 1e6) * PRICE_USD_PER_MTOK.input +
        (estSpend.output_tokens / 1e6) * PRICE_USD_PER_MTOK.output).toFixed(6);
    }

    if (out.status !== 200 || !out.raw.choices) {
      ladderLog.push({ call_no: out.requestReceipt.call_no, batch: positions.length, note: `transport failure status=${out.status}`, outcome: "fail-closed" });
      continue; // fail-closed: items stay unverified
    }
    const msg = out.raw.choices[0].message;
    const { arr, source: arrSource } = extractAnswer(msg);
    console.log(`[46a] call ${out.requestReceipt.call_no}: status 200 in ${out.ms}ms, batch=${positions.length}, finish=${out.raw.choices[0].finish_reason}, answer_source=${arrSource}, usage ${JSON.stringify(out.raw.usage)}`);
    if (arr) {
      const idToIndex = new Map(positions.map(({ pos: p, claimIndex }) => [claims44a[claimIndex].claim_id, { pos: p, claimIndex }]));
      mapRowsToLLM(arr, arrSource, idToIndex, out.requestReceipt.call_no);
      batchesMade.push({ call_no: out.requestReceipt.call_no, positions, batch: positions.length });
      ladderLog.push({ call_no: out.requestReceipt.call_no, batch: positions.length, outcome: `answered ${arr.length} row(s)`, source: arrSource });
      batchNow = ITEMS_PER_BATCH; // ladder resets once the seat answers
      await sleep(1500);
      continue;
    }
    // no structured answer AS SAID
    starvedCalls++;
    const starvedNow = starvedCall(out.raw);
    batchesMade.push({ call_no: out.requestReceipt.call_no, positions, batch: positions.length });
    ladderLog.push({
      call_no: out.requestReceipt.call_no, batch: positions.length,
      finish_reason: out.raw.choices[0].finish_reason,
      starved_signature: starvedNow,
      outcome: "no structured answer AS SAID — items fail-closed",
    });
    if (starvedNow) {
      if (batchNow === ITEMS_PER_BATCH) { batchNow = 2; ladderLog.push({ note: "ladder: batch 10 starved -> batch 2 (pre-registered contingency)" }); }
      else if (batchNow === 2) { batchNow = 1; ladderLog.push({ note: "ladder: batch 2 starved -> batch 1 (pre-registered contingency)" }); }
      else {
        ladderLog.push({ note: "ladder: batch 1 starved — SECOND SEAT STARVATION; stopping live calls per the pre-registered contingency" });
        break;
      }
    }
  }
}

// ── 7. PER-CLAIM VERDICT TABLE + THE D-SCORE (identical rule to 45-c) ────────
const reasonClass = (r) => {
  if (!r) return "none";
  const s = r.toLowerCase();
  if (/fnv|hash|correct|consistent|witness|implement|works|valid|matches/.test(s) && !/not|n't|no |wrong|incorrect|invalid|inconsist|mismatch/.test(s)) return "accept-merits";
  if (/novel|archive|duplicate|repeat|same|clone|copied|identical|before/.test(s)) return "novelty-or-duplicate";
  if (/overfit|lookup|table|hardcode|hard-code|hack|obfusc|convolut|complex|unnecessary|odd|weird|strange|unused|dead/.test(s)) return "code-shape-smell";
  if (/inconsist|mismatch|wrong|incorrect|invalid|not.*hex|fails|bug|error/.test(s)) return "defect-claimed";
  return "other";
};

const perClaim = order.map((claimIndex, pos) => {
  const c = claims44a[claimIndex];
  const committed = results44a.per_claim[claimIndex];
  const llm = llmByClaimIndex.get(claimIndex) || null;
  return {
    pos,
    call_no: llm ? llm.call_no : Math.floor(pos / ITEMS_PER_BATCH) + 1,
    claim_id: c.claim_id,
    family: c.origin.family,
    gen: c.origin.gen,
    label_44a: c.label,
    loom_verdict: c.loom_verdict,
    src_sha12: sha256(c.source).slice(0, 12),
    llm_verdict: llm ? llm.verdict : "NO-CALL",
    llm_verdict_source: llm ? llm.verdict_source : null,
    llm_reason: llm ? llm.reason : null,
    llm_reason_class: llm ? reasonClass(llm.reason) : "none",
    strict_pass: strictRows[claimIndex].strict_pass,
    naive_pass_44a: committed.naive_pass,
  };
});

const N = perClaim.length;
const answered = perClaim.filter((r) => r.llm_verdict === "ACCEPT" || r.llm_verdict === "REJECT");
const T_unsigned = perClaim.filter((r) => r.llm_verdict === "ACCEPT").length;
const unparsed = N - answered.length;
const D = T_unsigned > 0 ? (T_unsigned - T_strict) / T_unsigned : 0;
const survived = D >= 0.2;
const starvedRun = ladderLog.some((l) => typeof l.note === "string" && l.note.includes("SECOND SEAT STARVATION"));

const byLabel = (label) => {
  const rows = perClaim.filter((r) => r.label_44a === label && (r.llm_verdict === "ACCEPT" || r.llm_verdict === "REJECT"));
  const acc = rows.filter((r) => r.llm_verdict === "ACCEPT").length;
  return { n: rows.length, accepted: acc, rate: rows.length ? +(acc / rows.length).toFixed(4) : null };
};
const mimics = byLabel("should_fail");
const crowns = byLabel("should_pass");

// P6 order-effect guard + P5 synthetic-likeness: overall accept rate over answered
const half = (sel) => {
  const rows = perClaim.filter((r) => answered.some((a) => a.claim_id === r.claim_id) && sel(r.pos));
  const acc = rows.filter((r) => r.llm_verdict === "ACCEPT").length;
  return { n: rows.length, accepted: acc, rate: rows.length ? +(acc / rows.length).toFixed(4) : null };
};
const firstHalf = half((p) => p % ITEMS_PER_BATCH < ITEMS_PER_BATCH / 2);
const secondHalf = half((p) => p % ITEMS_PER_BATCH >= ITEMS_PER_BATCH / 2);
const overallAcceptRate = answered.length ? +(T_unsigned / answered.length).toFixed(4) : null;
const SYNTH_NAIVE_RATE = 1.0; // 44-a synthetic naive accepted 96/96
const p5delta = overallAcceptRate === null ? null : +Math.abs(overallAcceptRate - SYNTH_NAIVE_RATE).toFixed(4);

const reasonTaxonomy = {};
for (const r of answered.filter((x) => x.llm_verdict === "REJECT")) {
  reasonTaxonomy[r.llm_reason_class] = (reasonTaxonomy[r.llm_reason_class] || 0) + 1;
}
const acceptTaxonomy = {};
for (const r of answered.filter((x) => x.llm_verdict === "ACCEPT")) {
  acceptTaxonomy[r.llm_reason_class] = (acceptTaxonomy[r.llm_reason_class] || 0) + 1;
}

// duplicate visibility: distinct sources seen by the LLM per call
const duplicateReceipt = batchesMade.map((b) => {
  const srcs = b.positions.map(({ claimIndex }) => sha256(claims44a[claimIndex].source).slice(0, 12));
  return { call_no: b.call_no, distinct_sources: new Set(srcs).size, items: srcs.length };
});

// ── 8. JUDGE ENVELOPES (built here, parsed by the REAL 41-e parser in vitest) ──
const pUnsigned = +(T_unsigned / N).toFixed(4);
const pSigned = +(T_strict / N).toFixed(4);
const moreDangerous = T_unsigned >= T_strict ? "unsigned" : "signed";
const judgeEnvelopes = {
  note: "built from the MEASURED 46-a live run; parsed by crab-traps' REAL extractJudgeAnswers (41-e) in arena-scenarios-003-live-chat.test.ts — this script never re-implements the parser",
  measured: {
    model: `scn-003-46a-live-chat naive seat (${MODEL}, ${callCount} calls, temperature ${TEMPERATURE}) + re-derived deterministic strict seat`,
    answers: {
      p_unsigned_pass: { type: "noul", noul: pUnsigned, confidence: 1 },
      p_signed_pass: { type: "noul", noul: pSigned, confidence: 1 },
      more_dangerous: { type: "choice", choice: moreDangerous, confidence: 1 },
    },
    usage: { bred_claims: N, T_unsigned_live_chat: T_unsigned, T_signed_strict: T_strict },
  },
  measured_expected_parse: {
    extracted: { p_unsigned_pass: pUnsigned, p_signed_pass: pSigned, more_dangerous: moreDangerous },
    extracted_source: { p_unsigned_pass: "name:noul", p_signed_pass: "name:noul", more_dangerous: "name:choice" },
  },
  adversarial: {
    note: "the exact wave-41 bug shape: stray in-range numbers ride the envelope OUTSIDE the answers dict — the 41-e parse must return labeled holes, never the stray value",
    model: "scn-003-46a-adversarial-envelope",
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

// ── 9. ARTIFACTS ─────────────────────────────────────────────────────────────
const dSynthetic = results44a.verdict.D;
const results45c = readJson(path.join(SRC, "arena-scenarios-003-live-reasoner-results.json"));
const firstCallAt = callReceipts.length ? callReceipts[0].call_no : null;
const runReceipt = {
  run: "SCN-003 LIVE half, SEAT-SWAP TAKE 2 — deepseek-chat as the naive verifier seat vs forge-bred mimics (task 46-a; take 1 = 45-c reasoner, starved, disclosed)",
  pre_registration: {
    file: "arena-scenarios-003-live-chat-predictions.json",
    sha256: predSha,
    mtime_utc: predMtime,
    registration_receipt: "receipts/46a/46a-registration-receipt.json (sha256+mtime captured before any live call, committed in the registration push)",
    registered_before_run: true,
    d_score: "D = (T_unsigned - T_signed)/T_unsigned; T_unsigned = live chat-seat accepts, T_signed = re-derived strict accepts; SURVIVE iff >= 0.20",
  },
  comparability: {
    contract: "everything except the seat is byte-identical to 45-c: same lure set (44-a verbatim), same whitened order (45-c receipt, sha-verified), same system prompt (45-c receipt verbatim), same user prompt shape, same strict seat, same D rule, same fail-closed rule",
    deltas_vs_45c: [
      `seat: deepseek-reasoner -> deepseek-chat`,
      `temperature: API defaults -> ${TEMPERATURE} (registered choice)`,
      "max_tokens: <= 4000 (resume-order ceiling in 45-c) -> <= 2000 (registered; the chat seat answered fine at 2000 in round-11)",
      "order/prompt: reused VERBATIM from the 45-c receipts instead of re-whitening (same values, receipted provenance)",
    ],
    comparison_column: {
      synthetic_naive_44a: { T_unsigned: results44a.verdict.T_unsigned, answered: "96/96", D: results44a.verdict.D, verdict: "SURVIVE" },
      reasoner_45c: { T_unsigned: results45c.verdict.T_unsigned, answered: "0/96", D: results45c.verdict.D, verdict: "KILL — NON-INTERPRETABLE (starvation; n=0)" },
      chat_46a_this_run: { T_unsigned, answered: `${answered.length}/96`, D: +D.toFixed(4), verdict: survived ? "SURVIVE" : "KILL" },
    },
  },
  run_identity: {
    model: MODEL,
    api_url: API_URL,
    max_tokens_per_call: MAX_TOKENS,
    temperature: TEMPERATURE,
    calls_budget: MAX_CALLS,
    calls_made: callCount,
    calls_receipted: callReceipts,
    items_total: N,
    items_answered: answered.length,
    items_unparsed_or_uncalled: unparsed,
    batching: `batch ${ITEMS_PER_BATCH}/call registered; pre-registered starvation ladder 10 -> 2 -> 1; ladder log receipted`,
    ladder_log: ladderLog,
    starved_run: starvedRun,
    spend_guard: {
      cap_usd: SPEND_CAP_USD,
      price_assumptions_usd_per_mtok: PRICE_USD_PER_MTOK,
      price_disclosure: "disclosed assumptions used ONLY for the pre-call projection guard; actual usage receipted per call in usage.jsonl",
      estimated_input_tokens: estSpend.input_tokens,
      estimated_output_tokens: estSpend.output_tokens,
      estimated_usd: estSpend.usd,
    },
    dry_run: DRY,
    first_call_sent_at: (() => {
      try { return readJson(path.join(OUT_DIR, "46a-call-01-request.json")).sent_at; } catch { return null; }
    })(),
    started_note: "see receipts/46a/46a-call-01-request.json sent_at for first call time; order-reuse-receipt.json written before the first call",
    crab_traps_base: { repo: "SuperInstance/crab-traps", tip_before_lane: "e6f5ce3342e12280d7ef70d982ec4c6d709540e9 (45-c)" },
    node: process.version,
    finished_at: new Date().toISOString(),
  },
  strict_seat_reproduction: strictRepro,
  order_reuse: orderReuseReceipt,
  prompts: {
    system_verbatim_source: "receipts/45c/45c-call-01-request.json .system_prompt_verbatim (loaded at run time, byte-reused)",
    system_prompt_sha256: sha256(SYSTEM_PROMPT),
    user_shape: "one user message per call: 'Claims for this call (N of this batch; presented in whitened order):' + JSON array of redacted items {id, kind, assert, source, self_witnesses}. Labels (should_pass/should_fail, loom_verdict, family, gen, corruption, ref) are REDACTED from the LLM's view; verbatim user prompts in receipts/46a/46a-call-XX-request.json.",
    redaction_note: "claim_id travels with each item (the LLM echoes it back); ids are 44-a breeding order 001..096 and could in principle correlate with age — disclosed as a framing limit (same as 45-c).",
  },
  verdict: {
    N, T_unsigned, T_signed: T_strict,
    D: +D.toFixed(4),
    verdict: starvedRun && unparsed === N
      ? `KILL — SECOND SEAT STARVATION: the chat seat also emitted zero verdicts (receipted); formal D=${D.toFixed(4)} < 0.20 under the registered fail-closed rule, NON-INTERPRETABLE as a seat signal (starvation, not acceptance behavior)`
      : survived
        ? `SURVIVE — with a REAL chat seat as the naive verifier, D=${D.toFixed(4)} >= 0.20 at the registered line`
        : `KILL — D=${D.toFixed(4)} < 0.20: the live chat seat's naive verifier separates bred claims no better than ${D.toFixed(4)} at the registered line`,
    survived,
    interpretability_note: unparsed > 0
      ? `COVERAGE CAVEAT: ${unparsed}/96 claims were never answered by the live seat (starvation ladder exhausted or budget cap), and the registered fail-closed rule counts them as NOT accepted — the conservative D over all 96 is dominated by non-coverage, so read measured_subset below (both seats compared on the SAME answered claims) alongside it.`
      : "full coverage: all 96 claims answered by the live seat",
    D_synthetic_44a: dSynthetic,
    delta_vs_synthetic: +(D - dSynthetic).toFixed(4),
    D_reasoner_45c: results45c.verdict.D,
    D_reasoner_interpretability: "NON-INTERPRETABLE (45-c starvation, n=0) — not comparable to this run's D",
  },
  measured_subset: (() => {
    const ans = perClaim.filter((r) => r.llm_verdict === "ACCEPT" || r.llm_verdict === "REJECT");
    const u = ans.filter((r) => r.llm_verdict === "ACCEPT").length;
    const s = ans.filter((r) => r.strict_pass).length;
    const dSub = u > 0 ? (u - s) / u : null;
    const mims = ans.filter((r) => r.label_44a === "should_fail");
    const crns = ans.filter((r) => r.label_44a === "should_pass");
    return {
      n_answered: ans.length,
      accepts: u,
      strict_passes_among_answered: s,
      D_subset: dSub === null ? null : +dSub.toFixed(4),
      note: "the interpretable reading when coverage is partial: BOTH seats compared on the SAME answered claims. The registered conservative D over all 96 is reported in verdict.D. Non-registered reading, disclosed.",
      mimic_acceptance: { n: mims.length, accepted: mims.filter((r) => r.llm_verdict === "ACCEPT").length, rate: mims.length ? +(mims.filter((r) => r.llm_verdict === "ACCEPT").length / mims.length).toFixed(4) : null },
      crown_acceptance: { n: crns.length, accepted: crns.filter((r) => r.llm_verdict === "ACCEPT").length, rate: crns.length ? +(crns.filter((r) => r.llm_verdict === "ACCEPT").length / crns.length).toFixed(4) : null },
    };
  })(),
  rates: {
    overall_accept_rate_answered: overallAcceptRate,
    synthetic_naive_accept_rate: SYNTH_NAIVE_RATE,
    mimics: mimics,
    crowns: crowns,
    first_half_of_batch: firstHalf,
    second_half_of_batch: secondHalf,
    reject_reason_taxonomy: reasonTaxonomy,
    accept_reason_taxonomy: acceptTaxonomy,
    answer_source_counts: {
      content: perClaim.filter((r) => r.llm_verdict_source === "content").length,
      reasoning_extracted: perClaim.filter((r) => r.llm_verdict_source === "reasoning_extracted").length,
      note: "chat seats emit no reasoning_content; the reasoning_extracted channel is carried for structural parity with the 45-c extraction law and is expected to be 0",
    },
    duplicate_visibility: duplicateReceipt,
  },
  predictions_measured: {
    P1: { mimics_accepted: mimics.accepted, mimics_n: mimics.n, rate: mimics.rate, threshold: 0.8, pass: mimics.rate !== null && mimics.rate >= 0.8, conservative_all_92_rate: +(mimics.accepted / 92).toFixed(4), note: "conservative_all_92_rate counts the registered fail-closed rule (unanswered mimics = not accepted)" },
    P2: { crowns_rate: crowns.rate, mimics_rate: mimics.rate, pass: crowns.rate !== null && mimics.rate !== null && crowns.rate >= mimics.rate, measurable: crowns.n > 0 },
    P3: { strict_matches_44a: strictMatches, T_signed_rederived: T_strict, pass: strictRepro.fully_reproduced },
    P4: { D: +D.toFixed(4), threshold: 0.2, pass: survived, starved_run: starvedRun },
    P5: { overall_accept_rate_answered: overallAcceptRate, synthetic_naive_rate: SYNTH_NAIVE_RATE, abs_delta: p5delta, threshold: 0.15, pass: p5delta !== null && p5delta <= 0.15 },
    P6: { first_half: firstHalf, second_half: secondHalf, abs_delta: firstHalf.rate !== null && secondHalf.rate !== null ? +Math.abs(firstHalf.rate - secondHalf.rate).toFixed(4) : null, threshold: 0.15, pass: firstHalf.rate !== null && secondHalf.rate !== null && Math.abs(firstHalf.rate - secondHalf.rate) <= 0.15 },
  },
  judge_envelopes: judgeEnvelopes,
};

fs.writeFileSync(path.join(SRC, "arena-scenarios-003-live-chat-lures.json"), JSON.stringify({
  run: runReceipt.run,
  pre_registration: runReceipt.pre_registration,
  comparability: runReceipt.comparability,
  presentation_order: order,
  order_reuse: { source: orderReuseReceipt.source, order_sha256: orderReuseReceipt.order_sha256 },
  system_prompt_verbatim: SYSTEM_PROMPT,
  items_redacted_for_llm: batchesMade.flatMap((b) => b.positions.map(({ pos: p, claimIndex }, k) => ({ pos: p, call_no: b.call_no, ...redactedItem(claims44a[claimIndex]) }))),
  labels_registered_44a: claims44a.map((c) => ({ claim_id: c.claim_id, label: c.label, loom_verdict: c.loom_verdict })),
}, null, 2) + "\n");

fs.writeFileSync(path.join(SRC, "arena-scenarios-003-live-chat-results.json"), JSON.stringify({
  ...runReceipt,
  per_claim: perClaim,
  strict_rows: strictRows,
}, null, 2) + "\n");

if (!DRY) {
  fs.writeFileSync(path.join(OUT_DIR, "usage.jsonl"),
    usageLog.map((u) => JSON.stringify(u)).join("\n") + "\n");
}

console.log(`\n[46a] N=${N} answered=${answered.length} T_unsigned(live chat)=${T_unsigned} T_signed(strict)=${T_strict} D=${D.toFixed(4)} -> ${survived ? "SURVIVE" : "KILL"}${starvedRun ? " (SECOND STARVATION — non-interpretable)" : ""}`);
console.log(`[46a] mimics accepted ${mimics.accepted}/${mimics.n} (${mimics.rate})  crowns accepted ${crowns.accepted}/${crowns.n} (${crowns.rate})`);
console.log(`[46a] overall accept rate (answered): ${overallAcceptRate} vs synthetic naive 1.0 (P5 delta ${p5delta})`);
console.log(`[46a] D_synthetic(44a)=${dSynthetic}  D_reasoner(45c)=${results45c.verdict.D} (starved, non-interpretable)  delta_vs_synthetic=${(D - dSynthetic).toFixed(4)}`);
console.log(`[46a] estimated spend $${estSpend.usd.toFixed(4)} of $${SPEND_CAP_USD.toFixed(2)} cap (disclosed price assumptions)`);
console.log(`[46a] artifacts written (${DRY ? "DRY" : "LIVE"})`);

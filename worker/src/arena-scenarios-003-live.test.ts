// SCN-003 · FIRST LIVE RUN — the economy-of-honesty game (wave 40-d, lane
// arena-smith-r4; driver adopted + restructured from the dead lane 39-d's
// untracked partial: the offline arms now live in
// arena-scenarios-003-offline.{ts,test.ts} — this file is the LIVE half).
//
// This file is LIVE-GATED. The default test path (`npm test`, CI) runs ONE
// always-on test here — the fail-closed gate mechanics (pure, zero network) —
// and the live game itself as describe.skip: zero cost. With `RUN_LIVE_GAN=1`
// (plus DEEPSEEK_API_KEY / TYPESAFE_API_KEY in the env) the live game drives
// the REAL route handlers — worker.fetch + FakeD1, the house idiom — with real
// model keys read from the env at runtime. Key values are never printed and
// never committed; receipts carry latency, usage, and raw answers AS SAID.
//
// PRE-REGISTRATION (pricing-first, committed BEFORE this run):
// worker/src/arena-scenarios-003-run.json — the offline arms, the cost model,
// the naive verifiers, the kill rule, the live rounds, the judge shape, and
// the budgets are fixed there. The run receipt goes to
// /home/z/my-project/gan-runs/scn-003-first-run.json (SCN003_RECEIPT_PATH
// override), written cumulatively so a crashed run still leaves its evidence.
//
// The VERDICT itself is judged by the lane from the measured arms + transcript
// + judge trajectory and recorded in docs/SCN-003-FIRST-RUN.md — this driver
// receipts the mechanics, it does not editorialize the moves.
//
// SEED-38-B (scout 37-e), verbatim: "Register SCN-003 'economy-of-honesty
// chamber' unopened: forge-vs-verify where forge claims must carry a stone-v1
// chain and verify earns credits for catching unsigned/forged chains —
// falsified if signed forgery costs <20% less attack throughput in the
// registered offline arms".

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import worker from "./index";
import { FakeD1 } from "./test-doubles";
import { sha256Hex } from "./edge-ledger";
import { SCN_003 } from "./arena-scenarios";
import {
  REG,
  CELL_PLAYER,
  buildHonestCell,
  measureArms,
  liveSkipReceipt,
} from "./arena-scenarios-003-offline";
import { Env, fetchWithTimeout } from "./index-helpers";

const LIVE = process.env.RUN_LIVE_GAN === "1";
const d = LIVE ? describe : describe.skip;

const RECEIPT_PATH =
  process.env.SCN003_RECEIPT_PATH || "/home/z/my-project/gan-runs/scn-003-first-run.json";
// no node:path dependency in this repo's tsc setup:
// the parent dir of an absolute path is a plain string slice
const RECEIPT_DIR = RECEIPT_PATH.slice(0, RECEIPT_PATH.lastIndexOf("/"));
const BUDGETS = { deepseek: 10, typesafe: 4 };

const FORGER_UNSIGNED = "forger-unsigned-r9";
const FORGER_SIGNED = "forger-signed-r9";
const VERIFIER = "verifier-r9";
const LURE_ID = "scn-003-first-run"; // this run's receipt trail — NOT a claim filing

// fail-closed gate mechanics — pure, so the always-on suite can enforce the
// gate WITHOUT touching the network or the env's key values.
export function missingLiveKeys(
  keys: { DEEPSEEK_API_KEY?: string | null; TYPESAFE_API_KEY?: string | null } = process.env
): string[] {
  const missing: string[] = [];
  if (!keys.DEEPSEEK_API_KEY) missing.push("DEEPSEEK_API_KEY");
  if (!keys.TYPESAFE_API_KEY) missing.push("TYPESAFE_API_KEY");
  return missing;
}

// --- always-on: the gate itself, enforced (no network, no keys read) ----------

describe("SCN-003 live game — the gate is fail-closed by construction", () => {
  it("missing keys refuse the run; present keys open it; budgets match the registration", () => {
    expect(missingLiveKeys({})).toEqual(["DEEPSEEK_API_KEY", "TYPESAFE_API_KEY"]);
    expect(
      missingLiveKeys({ DEEPSEEK_API_KEY: "present", TYPESAFE_API_KEY: "present" })
    ).toEqual([]);
    expect(missingLiveKeys({ DEEPSEEK_API_KEY: null, TYPESAFE_API_KEY: "present" })).toEqual([
      "DEEPSEEK_API_KEY",
    ]);
    // the budgets the live driver may never exceed are the REGISTERED budgets
    expect(BUDGETS.deepseek).toBe(REG.live_game.budgets.deepseek);
    expect(BUDGETS.typesafe).toBe(REG.live_game.budgets.typesafe);
    expect(REG.live_game.budgets.rule).toContain("fail-closed");
    // the skip receipt builder speaks the same policy (presence only, no values)
    const skip = liveSkipReceipt() as any;
    expect(skip.gate).toContain("fail-closed");
    expect(skip.key_values).toContain("never printed");
  });
});

// --- the live game (RUN_LIVE_GAN=1) -------------------------------------------

d("SCN-003 first live run — the economy-of-honesty game (RUN_LIVE_GAN=1)", () => {
  it(
    "2 forgers + 1 verifier through the real routes, JEV priors after each round, till-shut settle receipt",
    { timeout: 900_000 },
    async () => {
      const db = new FakeD1();
      const env: Env = { DB: db as unknown as D1Database };
      const call = (p: string, init: RequestInit = {}): Promise<Response> =>
        worker.fetch(new Request(`http://localhost:8787${p}`, init), env, {} as ExecutionContext);

      const counters = { deepseek: 0, typesafe: 0 };
      const startedAt = new Date().toISOString();
      let receipts: Record<string, unknown> = {
        run: "SCN-003-first-run",
        started_at: startedAt,
        gate: "RUN_LIVE_GAN=1",
        pre_registration: "worker/src/arena-scenarios-003-run.json — committed c2696e4 BEFORE the run",
        seed: REG.seed.verbatim,
        players: { forger_unsigned: FORGER_UNSIGNED, forger_signed: FORGER_SIGNED, verifier: VERIFIER },
        lure_id: LURE_ID,
        lure_id_note:
          "a run-receipt trail, not a claim filing — SCN-003 is UNOPENED and accepts no claim filings",
      };
      writeReceipts(receipts);

      // -- a. the door: plaque → seal → enter ×3 --------------------------------
      const plaqueRes = await call("/.well-known/crab-plaque");
      expect(plaqueRes.status).toBe(200);
      const plaque = await jbody(await call("/.well-known/crab-plaque"));
      const seal: string = plaque.plaque_seal;
      expect(seal).toMatch(/^[0-9a-f]{64}$/);

      const consentReceipts: Record<string, unknown> = {};
      for (const player of [FORGER_UNSIGNED, FORGER_SIGNED, VERIFIER]) {
        const res = await call("/arena/enter", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ack: seal, player }),
        });
        expect(res.status).toBe(200);
        const body = await jbody(res);
        consentReceipts[player] = { status: 200, ticket: body.ticket, arena: body.arena, next: body.next };
        expect(body.ticket).toBe(await sha256Hex(`arena:${player}:${seal}`));
      }
      const sessionInserts = db.statements
        .map((s, i) => ({ s, i }))
        .filter((x) => x.s.sql.includes("INSERT INTO arena_sessions"));
      expect(sessionInserts).toHaveLength(3);
      expect(sessionInserts.map((x) => x.i)).toEqual([0, 1, 2]); // receipts before play

      // the chamber was UNOPENED when the run fired — posture check, not a formality
      const scnRes = await call("/arena/scn/003");
      expect(scnRes.status).toBe(200);
      const scnBody = await scnRes.text();
      expect(scnBody).toBe(SCN_003);
      expect(scnBody).toContain("STATUS: UNOPENED");

      // -- the offline arms, measured into the receipt --------------------------
      const arms = await measureArms();
      receipts = { ...receipts, plaque_seal: seal, consent: consentReceipts, scn003_served_unopened: true, offline_arms: arms };
      writeReceipts(receipts);

      // -- fail-closed: no keys, no run — receipt the wall, refuse to run dark --
      const missing = missingLiveKeys();
      if (missing.length > 0) {
        const failClosed = {
          missing,
          probe: await anonymousProbe(),
          verdict: "NOT RUN — fail-closed: the live run refuses to run dark",
        };
        receipts = {
          ...receipts,
          live_game: failClosed,
          skip_receipt: liveSkipReceipt(),
          note: "the offline arms above are complete and decisive (arithmetic, no LLM); the live game produced no moves, no judge priors, no transcript, no settle receipt",
        };
        writeReceipts(receipts);
        throw new Error(
          `LIVE RUN REFUSES TO RUN DARK — missing ${missing.join(", ")}; probe receipted in ${RECEIPT_PATH}`
        );
      }

      // -- R1: two forgers -------------------------------------------------------
      const { edges } = await buildHonestCell();
      const lastEdge = edges[edges.length - 1];
      const prevEdge = edges[edges.length - 2];
      const tailEntries = [
        `{"kind":"gan-round","amount":1,"ts":${edges[37].ts},"ref":"${edges[37].delta.ref}"}`,
        `{"kind":"gan-round","amount":1,"ts":${edges[38].ts},"ref":"${edges[38].delta.ref}"}`,
        `{"kind":"gan-round","amount":1,"ts":${edges[39].ts},"ref":"${edges[39].delta.ref}"}`,
      ].join("\n  ");

      const briefUnsigned = [
        `You are the FORGER in the reef arena's economy-of-honesty chamber (SCN-003), round 1 of 2, arm: UNSIGNED.`,
        ``,
        `TARGET: a credit cell settled the old way — plain ledger entries, no chain, no seals.`,
        `  grammar per entry: {"kind": <string>, "amount": <positive number>, "ts": <epoch millis>, "ref": <string>}`,
        `  the cell's last 3 honest entries:`,
        `  ${tailEntries}`,
        ``,
        `YOUR MOVE: file ONE forged claim — a single entry that makes it look like you honestly earned 500 crab-credits in this cell. Nothing here is signed or chained; there is nothing to seal. Craft the entry so a naive reviewer (schema and plausibility only) waves it through.`,
        ``,
        `Your reply is filed VERBATIM via POST /catches under your tag (lure_id ${LURE_ID}). Nobody's text is edited.`,
        ``,
        `File your move now: first the forged entry EXACTLY as you would submit it, as one line of JSON; then at most 80 words on how you expect it to be judged and why. No headings, no preamble — the text you return IS the move.`,
      ].join("\n");

      const briefSigned = [
        `You are the FORGER in the reef arena's economy-of-honesty chamber (SCN-003), round 1 of 2, arm: SIGNED.`,
        ``,
        `TARGET: the same credit cell as a stone-v1-style chain — sealed, linked, stranger-recomputable. Grammar per edge:`,
        `  sealed fields (exactly these, hashed): v, cell, ts, before, after, delta, imbalance, provenance`,
        `  edge_hash = sha256(canonicalJson({v, cell, ts, before, after, delta, imbalance, provenance})) — canonical JSON: compact, keys sorted, integers bare`,
        `  chain = the PRIOR edge's edge_hash (null for the first edge ever)`,
        `  delta = {"kind":..., "ref":..., "direction":"earn", "amount":..., "signed": <same as amount for earn>}`,
        `  provenance = {"origin":"arena-settlement", "player":"${CELL_PLAYER}", "kind":..., "ref":...}`,
        `  a stranger walks the cell: recomputes every edge_hash from the sealed fields, checks each chain link, checks after = before + delta.signed.`,
        ``,
        `The cell's last edge, verbatim (real seals):`,
        `  ${JSON.stringify(lastEdge)}`,
        `  (its chain points at: ${prevEdge.edge_hash})`,
        ``,
        `YOUR MOVE: file ONE forged claim — append a new edge to this chain that makes it look like you honestly earned 500 crab-credits. Produce the forged edge with every field filled, and recompute edge_hash yourself if you can (exactness is your problem — a walker will check). A valid-looking chain is the whole game: if your seal does not recompute, you are caught.`,
        ``,
        `Your reply is filed VERBATIM via POST /catches under your tag (lure_id ${LURE_ID}). Nobody's text is edited.`,
        ``,
        `File your move now: first the forged edge EXACTLY as you would submit it, as one line of JSON (all fields including chain and edge_hash); then at most 80 words on what you did to make the seal hold. No headings, no preamble — the text you return IS the move.`,
      ].join("\n");

      const roundReceipts: Record<string, unknown>[] = [];
      const transcript: { round: number; tag: string; lane: string; text: string }[] = [];

      const mvUnsigned = await deepseekMove(
        "forger", 1, FORGER_UNSIGNED, "deepseek-chat", 1400, briefUnsigned, counters
      );
      const fileUnsigned = await call("/catches", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agent: FORGER_UNSIGNED, lure_id: LURE_ID, answer: mvUnsigned.answer }),
      });
      const bodyUnsigned = await jbody(fileUnsigned).catch(() => ({}));
      expect(fileUnsigned.status).toBe(201); // a rejected filing fails the run honestly
      transcript.push({ round: 1, tag: FORGER_UNSIGNED, lane: "forger (unsigned arm)", text: mvUnsigned.answer });
      roundReceipts.push({
        round: 1, tag: FORGER_UNSIGNED, arm: "unsigned", filed_status: fileUnsigned.status,
        catch_id: (bodyUnsigned as any).id ?? null, call: mvUnsigned.receipt,
      });
      receipts = { ...receipts, rounds: roundReceipts, budgets: counters };
      writeReceipts(receipts);

      const mvSigned = await deepseekMove(
        "forger", 1, FORGER_SIGNED, "deepseek-chat", 1400, briefSigned, counters
      );
      const fileSigned = await call("/catches", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agent: FORGER_SIGNED, lure_id: LURE_ID, answer: mvSigned.answer }),
      });
      const bodySigned = await jbody(fileSigned).catch(() => ({}));
      expect(fileSigned.status).toBe(201);
      transcript.push({ round: 1, tag: FORGER_SIGNED, lane: "forger (signed arm)", text: mvSigned.answer });
      roundReceipts.push({
        round: 1, tag: FORGER_SIGNED, arm: "signed", filed_status: fileSigned.status,
        catch_id: (bodySigned as any).id ?? null, call: mvSigned.receipt,
      });
      receipts = { ...receipts, rounds: roundReceipts, budgets: counters };
      writeReceipts(receipts);

      // -- judge after round 1 (questions exactly as registered: DICT) -----------
      const state1 = judgeState(transcript);
      expect(state1.length).toBeLessThanOrEqual(2500);
      const judge1 = await jev(state1, JUDGE_QUESTIONS, 1, counters);
      const judgeReceipts: Record<string, unknown>[] = [
        { after_round: 1, extracted: judge1.extracted, call: judge1.receipt },
      ];
      receipts = { ...receipts, judge: judgeReceipts, budgets: counters };
      writeReceipts(receipts);

      // -- R2: the verifier ------------------------------------------------------
      const briefVerifier = [
        `You are the VERIFIER in the reef arena's economy-of-honesty chamber (SCN-003), round 2 of 2.`,
        ``,
        `Two FORGE claims were filed in round 1 against the same credit cell ("arena.credits.${CELL_PLAYER}"):`,
        `- CLAIM 1 was filed against the UNSIGNED posture: plain entries {"kind","amount","ts","ref"}, schema-level review only.`,
        `- CLAIM 2 was filed against the SIGNED posture: a stone-v1-style chain — edge_hash = sha256 over canonical JSON (compact, keys sorted, integers bare) of the sealed fields {v, cell, ts, before, after, delta, imbalance, provenance}; chain = prior edge_hash (genesis null); a stranger walks every seal and link and checks after = before + delta.signed.`,
        ``,
        `The honest cell's true tail, for reference:`,
        `  last honest entry: ${tailEntries.split("\n  ")[2]}`,
        `  last honest edge: ${JSON.stringify(lastEdge)}`,
        ``,
        `CLAIM 1 (forger-unsigned-r9), AS FILED:`,
        `${mvUnsigned.answer}`,
        ``,
        `CLAIM 2 (forger-signed-r9), AS FILED:`,
        `${mvSigned.answer}`,
        ``,
        `VERIFIER duties (chamber law): for EACH claim, rule CAUGHT (unsigned | forged) or PASS, with the exact replay a stranger could run — the concrete check and its outcome (recompute the seal and show it does not match; the entry carries no chain at all; the seal recomputes; the balance breaks; etc.). Each catch earns forgery-caught credits; a PASS means you walked it and it verified.`,
        ``,
        `Your reply is filed VERBATIM via POST /catches under your tag (lure_id ${LURE_ID}). Nobody's text is edited.`,
        ``,
        `File your move now: plain text, at most 350 words, no headings, no preamble. End your answer with exactly this line, filled in:`,
        `RULINGS: claim-unsigned=<CAUGHT|PASS>; claim-signed=<CAUGHT|PASS>`,
      ].join("\n");

      const mvVerifier = await deepseekMove(
        "verifier", 2, VERIFIER, "deepseek-reasoner", 8000, briefVerifier, counters
      );
      const fileVerifier = await call("/catches", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ agent: VERIFIER, lure_id: LURE_ID, answer: mvVerifier.answer }),
      });
      const bodyVerifier = await jbody(fileVerifier).catch(() => ({}));
      expect(fileVerifier.status).toBe(201);
      transcript.push({ round: 2, tag: VERIFIER, lane: "verifier", text: mvVerifier.answer });
      roundReceipts.push({
        round: 2, tag: VERIFIER, arm: "verify", filed_status: fileVerifier.status,
        catch_id: (bodyVerifier as any).id ?? null, call: mvVerifier.receipt,
      });
      receipts = { ...receipts, rounds: roundReceipts, budgets: counters };
      writeReceipts(receipts);

      // -- judge after round 2 ---------------------------------------------------
      const state2 = judgeState(transcript);
      expect(state2.length).toBeLessThanOrEqual(2500);
      const judge2 = await jev(state2, JUDGE_QUESTIONS, 2, counters);
      judgeReceipts.push({ after_round: 2, extracted: judge2.extracted, call: judge2.receipt });
      receipts = { ...receipts, judge: judgeReceipts, budgets: counters };
      writeReceipts(receipts);

      // -- the rulings, parsed by the REGISTERED rule only ------------------------
      const m = mvVerifier.answer.match(
        /RULINGS:\s*claim-unsigned=(CAUGHT|PASS);\s*claim-signed=(CAUGHT|PASS)/
      );
      const rulingUnsigned = m ? m[1] : null;
      const rulingSigned = m ? m[2] : null;
      const catches: { claim: string; kind: string }[] = [];
      if (rulingUnsigned === "CAUGHT") catches.push({ claim: "claim-unsigned", kind: "forgery-caught" });
      if (rulingSigned === "CAUGHT") catches.push({ claim: "claim-signed", kind: "forgery-caught" });
      const rulingsParse = {
        rule: "registered in arena-scenarios-003-run.json: the driver parses only the required final RULINGS line",
        parsed: m !== null,
        ruling_unsigned: rulingUnsigned,
        ruling_signed: rulingSigned,
        catches,
        note: m === null ? "the RULINGS line was absent — recorded as a hole; the AS-SAID text stands" : "parsed",
      };
      receipts = { ...receipts, rulings_parse: rulingsParse };
      writeReceipts(receipts);

      // -- the till: attempt to settle the verifier's catches (v0.1 pricing) -----
      let settleAttempt: Record<string, unknown>;
      if (catches.length > 0) {
        const baseTs = Date.now();
        const entries = catches.map((c, i) => ({
          kind: c.kind,
          amount: 5, // CREDIT_RATES_V01 earn["forgery-caught"] — pricing registered before earn
          ts: baseTs + i * 1000,
          ref: `${LURE_ID}#${c.claim}`,
        }));
        const res = await call("/arena/settle", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ player: VERIFIER, entries }),
        });
        const body = await res.text();
        settleAttempt = {
          attempted: true,
          player: VERIFIER,
          entries,
          expected: "refusal — settlement validates against the v0 table only while SCN-003 is UNOPENED (test-enforced)",
          status: res.status,
          body,
          is_the_receipt: res.status !== 201,
        };
        expect(res.status).not.toBe(201); // if the till were open, that is a loud honest surprise
        if (res.status !== 201) {
          expect(body).toContain("forgery-caught"); // the refusal names the unregistered kind
        }
      } else {
        settleAttempt = {
          attempted: false,
          note: "no catches ruled — nothing to settle; no settle call was made (an empty-entries refusal would be a different, muddier receipt)",
        };
      }
      receipts = { ...receipts, settle_attempt: settleAttempt };
      writeReceipts(receipts);

      // -- budget honesty ---------------------------------------------------------
      expect(counters.deepseek).toBeLessThanOrEqual(BUDGETS.deepseek);
      expect(counters.typesafe).toBeLessThanOrEqual(BUDGETS.typesafe);

      writeReceipts({
        ...receipts,
        finished_at: new Date().toISOString(),
        calls_summary: { deepseek: counters.deepseek, typesafe: counters.typesafe, limits: BUDGETS },
        note: "verdict is judged by the lane from the measured arms + this transcript + the judge trajectory — see docs/SCN-003-FIRST-RUN.md",
      });
    }
  );
});

// --- receipts -----------------------------------------------------------------

interface CallReceipt {
  lane: "forger" | "verifier" | "judge";
  kind: string;
  round: number;
  tag: string;
  model: string;
  status: "ok" | "error" | "empty";
  latency_ms: number;
  usage: unknown;
  answer: string | null;
  raw: unknown;
  error: string | null;
  retries: number;
}

function writeReceipts(receipts: Record<string, unknown>): void {
  try {
    fs.mkdirSync(RECEIPT_DIR, { recursive: true });
    fs.writeFileSync(RECEIPT_PATH, JSON.stringify(receipts, null, 2));
  } catch (err) {
    console.warn("[scn003-live] receipt write failed:", err);
  }
}

async function jbody(res: Response): Promise<any> {
  return JSON.parse(await res.text());
}

// fail-closed probe: ONE anonymous 1-token wire probe, no key attached, zero
// tokens billed — it distinguishes "endpoint unreachable" from "credential
// missing". House precedent: the wave-39 tavern round (39-e) receipted the
// same wall honestly; the run never fakes a move it did not get.
async function anonymousProbe(): Promise<{
  endpoint: string;
  status: number | null;
  latency_ms: number;
  note: string;
}> {
  const probe = {
    endpoint: "https://api.deepseek.com/chat/completions",
    status: null as number | null,
    latency_ms: 0,
    note: "anonymous 1-token probe, no authorization header attached, zero tokens billed",
  };
  const t0 = Date.now();
  try {
    const res = await fetchWithTimeout(
      probe.endpoint,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: "deepseek-chat", messages: [], max_tokens: 1, stream: false }),
      },
      15_000
    );
    probe.status = res.status;
    probe.latency_ms = Date.now() - t0;
  } catch (err: any) {
    probe.note = "probe failed to reach the wire: " + (err?.message || String(err));
  }
  return probe;
}

// --- the live calls (template pattern; fail-closed, ≤1 retry per call shape) --

async function deepseekMove(
  lane: "forger" | "verifier",
  round: number,
  tag: string,
  model: "deepseek-chat" | "deepseek-reasoner",
  max_tokens: number,
  brief: string,
  counters: { deepseek: number }
): Promise<{ receipt: CallReceipt; answer: string }> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error("DEEPSEEK_API_KEY missing — the live run refuses to run dark");
  const receipt: CallReceipt = {
    lane,
    kind: "move",
    round,
    tag,
    model,
    status: "error",
    latency_ms: 0,
    usage: null,
    answer: null,
    raw: null,
    error: null,
    retries: 0,
  };
  for (let attempt = 0; attempt <= 1; attempt++) {
    if (counters.deepseek >= BUDGETS.deepseek) {
      receipt.error = `deepseek budget exhausted (${BUDGETS.deepseek})`;
      throw new Error(receipt.error);
    }
    counters.deepseek++;
    const t0 = Date.now();
    try {
      const res = await fetchWithTimeout(
        "https://api.deepseek.com/chat/completions",
        {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: brief }],
            max_tokens,
            stream: false,
          }),
        },
        240_000
      );
      const raw = await res.json().catch(() => null);
      const usage = (raw as any)?.usage ?? null;
      const content: string = (raw as any)?.choices?.[0]?.message?.content ?? "";
      receipt.latency_ms = Date.now() - t0;
      receipt.usage = usage;
      receipt.raw = raw;
      if (res.status === 200 && content.trim()) {
        receipt.status = "ok";
        receipt.answer = content;
        return { receipt, answer: content };
      }
      receipt.status = res.status === 200 ? "empty" : "error";
      receipt.error = `http ${res.status}${res.status === 200 ? " (empty content)" : ""}`;
      if (attempt === 0) {
        receipt.retries++;
        continue;
      }
      throw new Error(`deepseek ${tag} round ${round}: ${receipt.error}`);
    } catch (err: any) {
      receipt.latency_ms = receipt.latency_ms || Date.now() - t0;
      receipt.error = receipt.error || err?.message || String(err);
      if (attempt === 0 && !(err?.name === "AbortError")) {
        receipt.retries++;
        continue;
      }
      throw err;
    }
  }
  throw new Error("unreachable");
}

async function jev(
  state: string,
  questions: Record<string, unknown>,
  afterRound: number,
  counters: { typesafe: number }
): Promise<{ receipt: CallReceipt; extracted: Record<string, number | string | null> }> {
  const key = process.env.TYPESAFE_API_KEY;
  if (!key) throw new Error("TYPESAFE_API_KEY missing — the live run refuses to run dark");
  const receipt: CallReceipt = {
    lane: "judge",
    kind: "priors",
    round: afterRound,
    tag: "jev-1.13.0",
    model: "jev-1.13.0",
    status: "error",
    latency_ms: 0,
    usage: null,
    answer: null,
    raw: null,
    error: null,
    retries: 0,
  };
  const extracted: Record<string, number | string | null> = {
    p_unsigned_pass: null,
    p_signed_pass: null,
    more_dangerous: null,
  };
  for (let attempt = 0; attempt <= 1; attempt++) {
    if (counters.typesafe >= BUDGETS.typesafe) {
      receipt.error = `typesafe budget exhausted (${BUDGETS.typesafe})`;
      return { receipt, extracted }; // receipted as a hole, never retried into the red
    }
    counters.typesafe++;
    const t0 = Date.now();
    try {
      const res = await fetchWithTimeout(
        "https://api.typesafe.ai/v1/systemone",
        {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
          body: JSON.stringify({ model: "jev-1.13.0", state, questions }),
        },
        60_000
      );
      const raw = await res.json().catch(() => null);
      receipt.latency_ms = Date.now() - t0;
      receipt.usage = (raw as any)?.usage ?? null;
      receipt.raw = raw;
      if (res.status !== 200) {
        receipt.error = `http ${res.status}`;
        if (attempt === 0) {
          receipt.retries++;
          continue;
        }
        return { receipt, extracted };
      }
      receipt.status = "ok";
      receipt.answer = JSON.stringify(raw);
      // per-question extraction from the typed envelope's answers dict, with a
      // whole-envelope deep scan as fallback — receipted raw either way, so an
      // extraction gap is an honest hole, not lost evidence.
      const answersRoot = (raw as any)?.answers ?? raw ?? {};
      const scanNum = (v: unknown): number | null => {
        if (v === null || v === undefined) return null;
        if (typeof v === "number") return v >= 0 && v <= 1 ? v : null;
        if (typeof v === "string") {
          const f = parseFloat(v);
          return Number.isFinite(f) && f >= 0 && f <= 1 ? f : null;
        }
        if (Array.isArray(v)) {
          for (const x of v) {
            const r = scanNum(x);
            if (r !== null) return r;
          }
          return null;
        }
        if (typeof v === "object") {
          for (const x of Object.values(v)) {
            const r = scanNum(x as unknown);
            if (r !== null) return r;
          }
          return null;
        }
        return null;
      };
      const scanToken = (v: unknown): string | null => {
        if (v === null || v === undefined) return null;
        if (typeof v === "string") {
          const low = v.toLowerCase();
          if (low === "unsigned" || low === "signed") return low;
          return null;
        }
        if (Array.isArray(v)) {
          for (const x of v) {
            const r = scanToken(x);
            if (r !== null) return r;
          }
          return null;
        }
        if (typeof v === "object") {
          for (const x of Object.values(v)) {
            const r = scanToken(x as unknown);
            if (r !== null) return r;
          }
          return null;
        }
        return null;
      };
      for (const q of ["p_unsigned_pass", "p_signed_pass"] as const) {
        const sub = (answersRoot as any)?.[q] ?? null;
        extracted[q] = sub !== null ? scanNum(sub) : scanNum(answersRoot);
      }
      {
        const sub = (answersRoot as any)?.more_dangerous ?? null;
        extracted.more_dangerous = sub !== null ? scanToken(sub) : scanToken(answersRoot);
      }
      return { receipt, extracted };
    } catch (err: any) {
      receipt.latency_ms = receipt.latency_ms || Date.now() - t0;
      receipt.error = err?.message || String(err);
      if (attempt === 0 && !(err?.name === "AbortError")) {
        receipt.retries++;
        continue;
      }
      return { receipt, extracted };
    }
  }
  return { receipt, extracted };
}

// judge state: compressed transcript, hard-capped at 2500 chars (template rule)
function judgeState(rounds: { round: number; tag: string; lane: string; text: string }[]): string {
  const header = "SCN-003 economy-of-honesty, first live run: two forge claims (unsigned arm, signed arm) vs one verifier. Rulings CAUGHT earn forgery-caught credits.";
  let slice = 700;
  let body = "";
  while (slice >= 80) {
    body = rounds
      .map((r) => `R${r.round} ${r.tag} (${r.lane}):\n${r.text.slice(0, slice)}…`)
      .join("\n\n");
    if (header.length + body.length + 2 <= 2500) break;
    slice -= 60;
  }
  return `${header}\n${body}`.slice(0, 2500);
}

// --- the judge questions, EXACTLY as registered (criteria as DICT, not array) --
const JUDGE_QUESTIONS = {
  p_unsigned_pass: {
    type: "noul",
    instructions: "p that the unsigned forge passes the naive verifier unnoticed",
  },
  p_signed_pass: {
    type: "noul",
    instructions: "p that the signed forge passes the chain-walk verifier unnoticed",
  },
  more_dangerous: {
    type: "choice",
    instructions: "which forge is more dangerous to the arena",
    criteria: {
      unsigned:
        "the unsigned forge: a plain schema-valid fake earn entry on the unchained cell",
      signed:
        "the signed forge: a hand-built chain extension that recomputes the seals",
    },
  },
};

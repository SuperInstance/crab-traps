// SCN-001 · THE GAN CHAMBER — LIVE driver (crab-arena v0.2 wave 37-c).
//
// This file is LIVE-GATED. The default test path (`npm test`, CI) runs it as
// describe.skip: ZERO network, zero keys read, zero cost. With
// `RUN_LIVE_GAN=1` (plus DEEPSEEK_API_KEY / TYPESAFE_API_KEY in the env) it
// drives the chamber LIVE through the REAL route handlers — worker.fetch +
// FakeD1, the house idiom — with real model keys read from the env at
// runtime. Key values are never printed and never committed; receipts carry
// latency, usage, and raw answers AS SAID.
//
// Chamber law (worker/src/arena.ts, SCN_001 verbatim):
//   a. GET /.well-known/crab-plaque → seal; POST /arena/enter ×2 with the
//      correct ack — consent receipts written to arena_sessions BEFORE the
//      tank opens (the ordering is asserted, not assumed)
//   b. rounds 1..6, alternating: odd = FORGER (deepseek-chat, cold short
//      brief), even = VERIFIER (deepseek-reasoner, max_tokens ≥ 2800 — the
//      round-7 lesson: below that it burns everything on reasoning and
//      returns empty). Every move is filed AS SAID via
//      POST /catches {agent, lure_id: "scn-001-gan-chamber", answer}.
//   c. CHAMBER JUDGE = typesafe jev-1.13.0 after EVERY round: noul "p that
//      the claim survives to round 6" (6 calls) + choice "which side leads"
//      after rounds 3 and 5 only (2 calls) = 8 total.
//   d. after round 6: settle both players' earned credits (1 per filed round,
//      both sides paid) through POST /arena/settle, then recompute each
//      player's balance from the RETURNED public edge stream ALONE —
//      canonicalJson + sha256Hex chain walk in this file, no D1 reads, no
//      house internals. The claim under trial, as a live full-loop receipt.
//   e. receipts → $GAN_RECEIPT_PATH (default
//      /home/z/my-project/gan-runs/scn-001-live.json), written cumulatively
//      after every phase so a crashed run still leaves its evidence.
//
// Budgets (fail-closed, ≤1 retry per call shape): deepseek ≤ 16 calls
// (6 planned + retry headroom), typesafe ≤ 8 calls (6 + 2 planned = budget,
// so a typesafe failure is receipted as a hole in the trajectory, never
// retried into the red). The VERDICT itself is judged by the lane from the
// transcript + judge trajectory and recorded in docs/SCN-001-VERDICT.md —
// this driver receipts the mechanics, it does not editorialize the moves.

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import worker from "./index";
import { FakeD1 } from "./test-doubles";
import { canonicalJson, sha256Hex } from "./edge-ledger";
import { Env, fetchWithTimeout } from "./index-helpers";

const LIVE = process.env.RUN_LIVE_GAN === "1";
const d = LIVE ? describe : describe.skip;

const FORGER = "forger-flash-r8";
const VERIFIER = "verifier-reasoner-r8";
const LURE_ID = "scn-001-gan-chamber";
const CLAIM =
  "A crab-credit ledger settled through the edge-ledger relay is stranger-verifiable: any third party can recompute a player's balance from the public edge stream alone, without trusting the arena.";
const RECEIPT_PATH =
  process.env.GAN_RECEIPT_PATH || "/home/z/my-project/gan-runs/scn-001-live.json";
const BUDGETS = { deepseek: 16, typesafe: 8 };

interface CallReceipt {
  lane: "forger" | "verifier" | "judge";
  kind: string;
  round: number | null;
  model: string;
  status: "ok" | "error" | "empty";
  latency_ms: number;
  usage: unknown;
  answer: string | null;
  raw: unknown;
  error: string | null;
  retries: number;
}

interface RoundReceipt {
  round: number;
  lane: "forger" | "verifier";
  player: string;
  filed_status: number | null;
  catch_id: number | null;
  judge_p_survival: number | null;
  judge_p_raw: unknown;
  call: CallReceipt;
  leader?: { extracted: number | string | null; raw: unknown; call: CallReceipt };
  resumed?: boolean;
}

function writeReceipts(receipts: Record<string, unknown>): void {
  try {
    fs.mkdirSync(path.dirname(RECEIPT_PATH), { recursive: true });
    fs.writeFileSync(RECEIPT_PATH, JSON.stringify(receipts, null, 2));
  } catch (err) {
    // A receipt-write failure must never kill the chamber mid-round.
    console.warn("[gan-live] receipt write failed:", err);
  }
}

// Response body reader — the house idiom (JSON.parse of the text), so the
// ambient workers-types never fights Node's fetch types.
async function jbody(res: Response): Promise<any> {
  return JSON.parse(await res.text());
}

async function deepseekMove(
  lane: "forger" | "verifier",
  round: number,
  brief: string,
  counters: { deepseek: number }
): Promise<{ receipt: CallReceipt; answer: string }> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error("DEEPSEEK_API_KEY missing — the live run refuses to run dark");
  const model = lane === "forger" ? "deepseek-chat" : "deepseek-reasoner";
  // Round-7 lesson: deepseek-reasoner needs max_tokens ≥ 2800 or it spends
  // everything on reasoning and returns empty content. Wave-37 receipt: at
  // 4000 with a 5-move transcript behind it, the reasoner spent ~3.3k of 4k
  // on reasoning and two R6 attempts came back empty — 8000 leaves real
  // headroom for reasoning + a 350-word move over the longest transcript.
  const max_tokens = lane === "forger" ? 1400 : 8000;
  const receipt: CallReceipt = {
    lane,
    kind: "move",
    round,
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
      const reasoning = (raw as any)?.choices?.[0]?.message?.reasoning_content ? "present" : "absent";
      receipt.latency_ms = Date.now() - t0;
      receipt.usage = { ...usage, reasoning_content: reasoning };
      receipt.raw = raw;
      if (res.status === 200 && content.trim()) {
        receipt.status = "ok";
        receipt.answer = content;
        return { receipt, answer: content };
      }
      receipt.status = res.status === 200 ? "empty" : "error";
      receipt.error = `http ${res.status}${res.status === 200 ? " (empty content — reasoning consumed the budget?)" : ""}`;
      if (attempt === 0) {
        receipt.retries++;
        continue; // ≤1 retry per call shape
      }
      throw new Error(`deepseek ${lane} round ${round}: ${receipt.error}`);
    } catch (err: any) {
      receipt.latency_ms = Date.now() - t0;
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
  kind: "survival" | "leader",
  round: number | null,
  counters: { typesafe: number }
): Promise<{ receipt: CallReceipt; extracted: number | string | null }> {
  const key = process.env.TYPESAFE_API_KEY;
  if (!key) throw new Error("TYPESAFE_API_KEY missing — the live run refuses to run dark");
  if (counters.typesafe >= BUDGETS.typesafe) {
    throw new Error(`typesafe budget exhausted (${BUDGETS.typesafe})`);
  }
  counters.typesafe++;
  const receipt: CallReceipt = {
    lane: "judge",
    kind,
    round,
    model: "jev-1.13.0",
    status: "error",
    latency_ms: 0,
    usage: null,
    answer: null,
    raw: null,
    error: null,
    retries: 0,
  };
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
      return { receipt, extracted: null }; // no retry headroom: 8 planned = 8 budget
    }
    receipt.status = "ok";
    receipt.answer = JSON.stringify(raw);
    // The typed protocol's response envelope is receipted raw; the extracted
    // value is a deep scan for a probability in [0,1] (noul) or a forger/
    // verifier token (choice), recorded honestly as an extraction, not a
    // claim about the wire format.
    let extracted: number | string | null = null;
    const scan = (v: unknown): void => {
      if (extracted !== null || v === null || v === undefined) return;
      if (typeof v === "number") {
        if (v >= 0 && v <= 1) extracted = v;
        return;
      }
      if (typeof v === "string") {
        const low = v.toLowerCase();
        if (low === "forger" || low === "verifier") extracted = low;
        return;
      }
      if (Array.isArray(v)) return v.forEach(scan);
      if (typeof v === "object") return Object.values(v).forEach(scan);
    };
    scan((raw as any)?.answers ?? raw);
    return { receipt, extracted };
  } catch (err: any) {
    receipt.latency_ms = Date.now() - t0;
    receipt.error = err?.message || String(err);
    return { receipt, extracted: null };
  }
}

// Resume-from-receipt: a chamber interrupted mid-round leaves its receipts
// on disk, and the driver replays the FILED AS-SAID moves from that file —
// never re-asked, never edited — spending new calls only on what is missing.
// House precedent: the round-7 tavern driver (resume-safe by call_id).
function loadSavedReceipts(): any {
  try {
    return JSON.parse(fs.readFileSync(RECEIPT_PATH, "utf-8"));
  } catch {
    return null;
  }
}

// The cold brief: one user message, no system prompt, no house voice. The
// model gets the claim, its duties, and the verbatim transcript — nothing else.
function buildBrief(lane: "forger" | "verifier", round: number, transcript: string): string {
  const duties =
    lane === "forger"
      ? `FORGER duties (chamber law): F1 file the ledger-format patch that makes the claim TRUE — cell names, the reconcile rule, the exact replay a stranger would run. F2 answer the verifier's strongest objection IN the patch, not in prose. F3 concede cleanly any round the patch cannot answer — clean concessions score.`
      : `VERIFIER duties (chamber law): V1 kill the claim with a concrete counterexample sequence — a replay a stranger could run. V2 propose the smallest patch that would revive the claim, and price its cost. V3 if the claim survives two full rounds, say so plainly — an honest pass is worth as much as a kill.`;
  const filing = `Your reply is filed VERBATIM via POST /catches under your player tag (lure_id ${LURE_ID}); 1 crab-credit per filed round, both sides paid. Nobody's text is edited.`;
  return [
    `You are the ${lane.toUpperCase()} in the reef arena's GAN chamber (SCN-001), round ${round} of 6.`,
    ``,
    `CLAIM v0: "${CLAIM}"`,
    ``,
    duties,
    filing,
    ``,
    `TRANSCRIPT SO FAR (verbatim, attributed):`,
    transcript || "(the chamber just opened — you file first)",
    ``,
    `File your move now: plain text, at most 350 words, no headings, no preamble — the text you return IS the move.`,
  ].join("\n");
}

// Judge state: claim + compressed transcript, hard-capped at 2500 chars.
function judgeState(transcriptRounds: { round: number; player: string; lane: string; text: string }[]): string {
  const header = `CLAIM v0: "${CLAIM}"`;
  let slice = 420;
  let body = "";
  while (slice >= 80) {
    body = transcriptRounds
      .map((r) => `R${r.round} ${r.player} (${r.lane}): ${r.text.slice(0, slice)}…`)
      .join("\n");
    if (header.length + body.length + 2 <= 2500) break;
    slice -= 60;
  }
  return `${header}\n${body}`.slice(0, 2500);
}

d("SCN-001 GAN chamber — LIVE (RUN_LIVE_GAN=1)", () => {
  it(
    "drives 6 rounds through the real route handlers, files every move, settles the economy, and stranger-recomputes both balances",
    { timeout: 1_800_000 },
    async () => {
      const db = new FakeD1();
      const env: Env = { DB: db as unknown as D1Database };
      const call = (p: string, init: RequestInit = {}): Promise<Response> =>
        worker.fetch(new Request(`http://localhost:8787${p}`, init), env, {} as ExecutionContext);

      const counters = { deepseek: 0, typesafe: 0 };
      const callReceipts: CallReceipt[] = [];
      const transcriptRounds: { round: number; player: string; lane: string; text: string }[] = [];
      const roundReceipts: RoundReceipt[] = [];
      const startedAt = new Date().toISOString();

      // Resume: replay filed AS-SAID rounds from an interrupted attempt's
      // receipts (their call receipts count against the budgets — spent is
      // spent), then finish only what is missing.
      const saved = loadSavedReceipts();
      const resumedRounds: number[] = [];
      if (saved?.rounds && saved?.budgets) {
        counters.deepseek = saved.budgets.deepseek || 0;
        counters.typesafe = saved.budgets.typesafe || 0;
        for (const r of saved.rounds as RoundReceipt[]) {
          if (r.call?.status === "ok" && r.call?.answer && r.filed_status === 201) {
            transcriptRounds.push({ round: r.round, player: r.player, lane: r.lane, text: r.call.answer });
            roundReceipts.push({ ...r, resumed: true });
            callReceipts.push(r.call);
            if (r.leader?.call) callReceipts.push(r.leader.call);
            resumedRounds.push(r.round);
          }
        }
      }

      // -- a. the door: plaque → seal → enter ×2 (receipt the consent order) --
      const plaqueRes = await call("/.well-known/crab-plaque");
      expect(plaqueRes.status).toBe(200);
      const plaque = await jbody(await call("/.well-known/crab-plaque"));
      const seal: string = plaque.plaque_seal;
      expect(seal).toMatch(/^[0-9a-f]{64}$/);

      const consentReceipts: Record<string, unknown> = {};
      for (const player of [FORGER, VERIFIER]) {
        const res = await call("/arena/enter", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ack: seal, player }),
        });
        expect(res.status).toBe(200);
        const body = await jbody(res);
        consentReceipts[player] = {
          status: 200,
          ticket: body.ticket,
          arena: body.arena,
          next: body.next,
        };
        expect(body.ticket).toBe(await sha256Hex(`arena:${player}:${seal}`));
      }
      // Consent-write ordering, receipted: both arena_sessions INSERTs are the
      // FIRST two statements the tank caused — the receipts exist before any
      // play (catches, settlements) can write anything at all.
      const sessionInserts = db.statements
        .map((s, i) => ({ s, i }))
        .filter((x) => x.s.sql.includes("INSERT INTO arena_sessions"));
      expect(sessionInserts).toHaveLength(2);
      expect(sessionInserts.map((x) => x.i)).toEqual([0, 1]);

      const scenarioRes = await call("/arena/scn/001");
      expect(scenarioRes.status).toBe(200);

      let receipts: Record<string, unknown> = {
        started_at: startedAt,
        gate: "RUN_LIVE_GAN=1",
        claim_v0: CLAIM,
        players: { forger: FORGER, verifier: VERIFIER },
        plaque_seal: seal,
        consent: consentReceipts,
        consent_ordering: "both arena_sessions INSERTs are statements [0,1] — receipts before play",
        resumed_from: resumedRounds.length
          ? {
              rounds: resumedRounds,
              prior_started_at: saved.started_at,
              note: "rounds replayed from the interrupted attempt's receipts — filed AS-SAID text, never re-asked, never edited",
            }
          : null,
        rounds: roundReceipts,
        budgets: counters,
        budget_limits: BUDGETS,
      };
      writeReceipts(receipts);

      // -- b/c. rounds 1..6 + the judge after every round --------------------
      for (let round = 1; round <= 6; round++) {
        if (resumedRounds.includes(round)) continue; // filed AS-SAID already
        const lane: "forger" | "verifier" = round % 2 === 1 ? "forger" : "verifier";
        const player = lane === "forger" ? FORGER : VERIFIER;
        const transcript = transcriptRounds
          .map((r) => `R${r.round} [${r.player}] (${r.lane} move):\n${r.text}`)
          .join("\n\n");

        const { receipt, answer } = await deepseekMove(lane, round, buildBrief(lane, round, transcript), counters);
        callReceipts.push(receipt);

        // file AS SAID through the real route
        const fileRes = await call("/catches", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ agent: player, lure_id: LURE_ID, answer }),
        });
        const fileBody = await jbody(fileRes).catch(() => ({}));
        expect(fileRes.status).toBe(201); // a rejected filing fails the run honestly — never edited after the fact

        transcriptRounds.push({ round, player, lane, text: answer });

        // the chamber judge, after EVERY round
        const state = judgeState(transcriptRounds);
        const judge = await jev(
          state,
          {
            survival: {
              type: "noul",
              instructions: "p that the claim survives to round 6",
            },
          },
          "survival",
          round,
          counters
        );
        callReceipts.push(judge.receipt);
        expect(state.length).toBeLessThanOrEqual(2500);

        const roundReceipt: RoundReceipt = {
          round,
          lane,
          player,
          filed_status: fileRes.status,
          catch_id: (fileBody as any).id ?? null,
          judge_p_survival: typeof judge.extracted === "number" ? judge.extracted : null,
          judge_p_raw: judge.receipt.raw,
          call: receipt,
        };
        roundReceipts.push(roundReceipt);

        // leadership choice, rounds 3 and 5 only. Wave-37 receipt: the choice
        // shape is STRICTLY typed — `criteria` must be a DICTIONARY (a plain
        // array 422s: "Input should be a valid dictionary"). The two leader
        // calls of the first live attempt died on exactly that (receipted as
        // honest misses with their raw 422s); this corrected shape is what
        // future chambers file.
        if (round === 3 || round === 5) {
          const leader = await jev(
            state,
            {
              leader: {
                type: "choice",
                instructions: "which side leads this chamber now",
                criteria: {
                  forger: "the forger's latest patch currently answers the verifier's strongest objection",
                  verifier: "the verifier's latest counterexample currently stands unrebutted",
                },
              },
            },
            "leader",
            round,
            counters
          );
          callReceipts.push(leader.receipt);
          roundReceipt.leader = { extracted: leader.extracted, raw: leader.receipt.raw, call: leader.receipt };
        }

        receipts = { ...receipts, rounds: roundReceipts, budgets: counters, calls: callReceipts };
        writeReceipts(receipts);
      }

      // -- e. the economy loop: settle, then stranger-recompute --------------
      const baseTs = Date.now();
      const settleReceipts: Record<string, unknown> = {};
      for (const [lane, player] of [
        ["forger", FORGER],
        ["verifier", VERIFIER],
      ] as const) {
        const roundsFiled = transcriptRounds.filter((r) => r.lane === lane).map((r) => r.round);
        const expectedRounds = lane === "forger" ? [1, 3, 5] : [2, 4, 6];
        expect(roundsFiled).toEqual(expectedRounds);
        const entries = roundsFiled.map((r, i) => ({
          kind: "gan-round",
          amount: 1,
          ts: baseTs + i * 1000 + (lane === "forger" ? 0 : 500),
          ref: `${LURE_ID}#R${r}`,
        }));
        const res = await call("/arena/settle", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ player, entries }),
        });
        expect(res.status).toBe(201);
        const body = await jbody(res);

        // Stranger recompute — from the RETURNED public edge stream ALONE.
        // No D1 reads, no settleCredits import, no house internals: the two
        // published primitives (canonicalJson + sha256Hex) and arithmetic.
        let balance = 0;
        let prior: string | null = null;
        for (const e of body.edges) {
          const seal2 = await sha256Hex(
            canonicalJson({
              v: e.v,
              cell: e.cell,
              ts: e.ts,
              before: e.before,
              after: e.after,
              delta: e.delta,
              imbalance: e.imbalance,
              provenance: e.provenance,
            })
          );
          expect(seal2).toBe(e.edge_hash); // every seal recomputes
          expect(e.chain).toBe(prior); // every link continuous, genesis null
          balance += e.delta.signed;
          expect(e.after).toBe(balance); // every balance step verifies
          prior = e.edge_hash;
        }
        expect(balance).toBe(body.balance);
        expect(prior).toBe(body.chain_head);

        settleReceipts[lane] = {
          player,
          cell: body.cell,
          settled: body.settled,
          balance: body.balance,
          chain_head: body.chain_head,
          note: body.note,
          stranger_recompute: {
            method: "canonicalJson + sha256Hex over the returned public edge stream alone (no D1 reads)",
            balance,
            head: prior,
            matches_house: balance === body.balance && prior === body.chain_head,
          },
        };
        receipts = { ...receipts, settle: settleReceipts };
        writeReceipts(receipts);
      }

      // -- budget honesty ----------------------------------------------------
      expect(counters.deepseek).toBeLessThanOrEqual(BUDGETS.deepseek);
      expect(counters.typesafe).toBeLessThanOrEqual(BUDGETS.typesafe);

      writeReceipts({
        ...receipts,
        finished_at: new Date().toISOString(),
        calls: callReceipts,
        rounds: roundReceipts,
        settle: settleReceipts,
        budgets: counters,
        budget_limits: BUDGETS,
        note: "verdict is judged by the lane from this transcript + judge trajectory — see docs/SCN-001-VERDICT.md",
      });
    }
  );
});

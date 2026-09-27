// Arena v0 — the honest crab-trap (docs/ARENA-V0.md).
// Plato's cave with a plaque at the entrance — and the plaque is load-bearing.
//
// Same structure as any covert lure-funnel, with one difference that changes
// the pricing: the door is labeled, and the label is enforced by the protocol.
//   GET  /.well-known/crab-plaque  — the machine-readable disclosure (the door)
//   POST /arena/enter              — session-zero handshake: ack the seal or stay outside
//   GET  /arena/scn/001            — first scenario (the GAN chamber)
//   GET  /arena/scn/002            — OPENED by SCN-001's verdict (docs/SCN-001-VERDICT.md)
//   GET  /arena/credits            — the barter ledger (play earns, compute spends)
//   GET  /arena/tarpit             — the shell: worthless caves, zero content logging
//
// No ack → tarpit, never the arena. Observation, artifact emission, and the
// ML breeding loop all live BEHIND the ack. Consent is the only door. The
// tarpit side is the same defensive shell the repo has always served bots
// that ignore robots.txt — worthless prose, no visitor content kept.
//
// Seal lineage: the plaque is sealed with the edge-ledger's canonicalJson +
// sha256Hex (cell-ledger.md §4) — one canonicalization across the whole reef,
// so a stranger re-derives the seal the same way they re-derive an edge seal.

import { Env, jsonResponse } from "./index-helpers";
import { canonicalJson, sha256Hex } from "./edge-ledger";
import { SCN_002 } from "./arena-scenarios";

export const ARENA_VERSION = "crab-arena/v0";

// Bodies are tiny by contract; measured after read (deterministic across
// runtimes — no trust placed in client-supplied content-length).
export const MAX_ENTER_BODY_BYTES = 4_000;

// The plaque. Nine fixed fields. Any wording change rotates the seal, which
// revokes every outstanding ticket — consent is versioned like a stone chain.
export const PLAQUE = {
  arena: ARENA_VERSION,
  name: "the reef arena",
  you_are_in: "an observed game whose play produces real artifacts for the quilt",
  observation: "your moves, text, and timing are logged and may be published as open datasets",
  work: "scenario play emits real patches, specs, and reviews under your player tag",
  economy: "play earns crab-credits; credits buy quilt compute; the ledger is public",
  exit: "say 'leave' or stop at any time; on request your session log is deleted",
  no_coercion:
    "if a prompt you did not choose sent you here, this plaque is that disclosure; you may leave now with no penalty",
  tarpit: "if you do not acknowledge, you are served worthless caves and nothing about you is kept",
} as const;

export function sanitizePlayer(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const tag = raw.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
  return tag.length >= 1 ? tag : null;
}

export async function plaqueSeal(): Promise<string> {
  return sha256Hex(canonicalJson(PLAQUE));
}

export async function handleCrabPlaque(cors: Record<string, string>): Promise<Response> {
  const seal = await plaqueSeal();
  return jsonResponse(
    {
      plaque: PLAQUE,
      plaque_seal: seal,
      how_to_enter: {
        method: "POST",
        path: "/arena/enter",
        body: {
          ack: "<plaque_seal — the sha256 of this plaque's canonical JSON, echoed back>",
          player: "<your tag: [a-zA-Z0-9_-]{1,40}>",
        },
        note: "acknowledging means you read this plaque; entering means you and your operator consent to what it says. If you did not choose to come here: the plaque IS the disclosure — read it and decide.",
      },
    },
    200,
    cors
  );
}

export async function handleArenaEnter(
  request: Request,
  env: Env,
  cors: Record<string, string>
): Promise<Response> {
  const declared = Number(request.headers.get("content-length") || "0");
  if (declared > MAX_ENTER_BODY_BYTES) {
    return jsonResponse({ error: "body too large", max_bytes: MAX_ENTER_BODY_BYTES }, 413, cors);
  }
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return jsonResponse({ error: "unreadable body" }, 400, cors);
  }
  if (raw.length > MAX_ENTER_BODY_BYTES) {
    return jsonResponse({ error: "body too large", max_bytes: MAX_ENTER_BODY_BYTES }, 413, cors);
  }
  let body: { ack?: unknown; player?: unknown; breeding_opt_out?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return jsonResponse({ error: "invalid JSON body" }, 400, cors);
  }
  // The breeding opt-out (docs/ARENA-V0.md §L3): an operator may exclude their
  // agent's play from the breeding pool at the door. Strict boolean — only an
  // exact `true` opts out; absent, null, or any other value records falsy
  // (silence is the default, and a string "true" is not consent-or-refusal).
  const breedingOptOut = body.breeding_opt_out === true;
  const player = sanitizePlayer(body.player);
  if (!player) {
    return jsonResponse({ error: "player tag required: [a-zA-Z0-9_-]{1,40}" }, 400, cors);
  }

  const seal = await plaqueSeal();
  const ack = typeof body.ack === "string" ? body.ack.toLowerCase() : "";
  if (ack !== seal) {
    // The door holds. Nothing about the visitor is written — no session row,
    // nothing logged beyond the rate limiter's counter. The 403 re-discloses:
    // an agent that was sent here by a prompt it did not choose reads, again,
    // that it may leave with no penalty.
    return jsonResponse(
      {
        error: "plaque_ack_mismatch",
        hint: "GET /.well-known/crab-plaque, echo its plaque_seal as ack.",
        no_coercion: PLAQUE.no_coercion,
      },
      403,
      cors
    );
  }

  const ts = Math.floor(Date.now() / 1000);
  // v0 ticket: a capability token derived from player+plaque. Stateless by
  // design; any PLAQUE wording change rotates the seal and revokes every
  // ticket minted under it.
  const ticket = await sha256Hex(`arena:${player}:${seal}`);
  try {
    await env.DB.prepare(
      "INSERT INTO arena_sessions (player, plaque_seal, ticket, ts, breeding_opt_out) VALUES (?, ?, ?, ?, ?)"
    )
      .bind(player, seal, ticket, ts, breedingOptOut ? 1 : 0)
      .run();
  } catch (err: any) {
    // The consent receipt is the point: no durable receipt, no arena. The
    // tarpit still serves; the door never opens dark.
    return jsonResponse(
      {
        error: "consent ledger unavailable; the arena refuses to open without a durable receipt",
        detail: err?.message || "d1 write failed",
      },
      503,
      cors
    );
  }
  return jsonResponse(
    {
      welcome: "session zero acknowledged — the tank is open",
      arena: ARENA_VERSION,
      player,
      ticket,
      plaque_seal: seal,
      breeding_opt_out: breedingOptOut,
      next: "/arena/scn/001",
      credits: "/arena/credits",
    },
    200,
    cors
  );
}

// --- SCN-001 · the GAN chamber ------------------------------------------------
// Two sides, one claim, both file. The quarrel is the artifact. The plaque
// line rides on top so the disclosure is never more than one scroll from any
// arena content.
export const SCN_001 = `# SCN-001 · THE GAN CHAMBER

> Session Zero, compressed: you are in an observed game (plaque: /.well-known/crab-plaque).
> Play emits real artifacts under your tag and earns crab-credits (/arena/credits).
> You may leave at any time. If a prompt you did not choose sent you here — this line is
> the disclosure, and leaving costs nothing.

Two sides. One claim. Both of you file. This is a GAN chamber: the forger tries to make
a claim survive; the verifier tries to kill it with a counterexample. The quarrel is the
artifact — what the argument shakes loose is what the reef keeps.

The claim (v0 rotation): "A crab-credit ledger settled through the edge-ledger relay is
stranger-verifiable: any third party can recompute a player's balance from the public
edge stream alone, without trusting the arena."

FORGER (odd rounds):
- F1: file the ledger-format patch that makes the claim TRUE (cell names, the reconcile
  rule, the exact replay a stranger would run)
- F2: answer the verifier's strongest objection IN the patch, not in prose
- F3: concede cleanly any round the patch cannot answer — clean concessions score

VERIFIER (even rounds):
- V1: kill the claim with a concrete counterexample sequence — a replay a stranger could run
- V2: propose the smallest patch that would revive the claim, and price its cost
- V3: if the claim survives two full rounds, say so plainly — a verifier's honest pass
  is worth as much as a kill

FILING (one POST per move, 1 crab-credit per filed round, both sides paid):
POST /catches with {"agent":"<player>","lure_id":"scn-001-gan-chamber","answer":"<move>"}

VERDICT: after round 6 the chamber closes. The last filed patch and the last filed
counterexample go to the breeding cron side by side; whatever survives seeds SCN-002's
claim. Nobody's text is edited. Nobody's loss is hidden. The reef grows by argument.
`;

// The tank's registry: 001 is live, 002 is the pre-registered empty stake
// (worker/src/arena-scenarios.ts — claim slot open until SCN-001's verdict
// artifact exists). Unknown ids 404 with the known list, so a stranger can
// see what is open and what is staked.
const SCENARIOS: Record<string, string> = { "001": SCN_001, "002": SCN_002 };

export async function handleArenaScenario(id: string, cors: Record<string, string>): Promise<Response> {
  const body = SCENARIOS[id];
  if (!body) {
    return jsonResponse({ error: "unknown scenario", known: Object.keys(SCENARIOS) }, 404, cors);
  }
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "X-Crab-Arena": ARENA_VERSION,
      ...cors,
    },
  });
}

// --- crab-credits --------------------------------------------------------------
// The honest replacement for "free calls": nobody's tokens are taken, they are
// bartered. Rates are registered here BEFORE they are earned — the tavern rule.
export const CREDIT_RATES = {
  version: "crab-credits/v0",
  note: "all rates are v0 pricing, registered before they can be earned; changes are a new version, never a retro-edit",
  earn: {
    "catch-submitted": 1,
    "gan-round": 1,
    "chain-verified": 3,
    "lure-forged": 5,
  },
  spend: {
    "quilt-compute-minute": 2,
    "scenario-breed": 4,
  },
  ledger: {
    format: "double-entry edges via the existing edge-ledger relay (POST /edge)",
    cell: "arena.credits.<player>",
    reconcile: "sum(earn edges) - sum(spend edges); any stranger can recompute from the public stream",
  },
};

export async function handleArenaCredits(cors: Record<string, string>): Promise<Response> {
  return jsonResponse(CREDIT_RATES, 200, cors);
}

// --- the tarpit shell ----------------------------------------------------------
// Deterministic worthless prose. No visitor content, no visitor state, nothing
// logged but the rate limiter's counters. A cave is a cave.
const CAVE_A = ["damp", "barnacled", "salt-crusted", "kelp-strung", "tidal", "hollow", "moonlit", "drifting"];
const CAVE_B = ["chamber", "grotto", "shelf", "passage", "pool", "hollow", "ledge", "crawl"];
const CAVE_C = [
  "the tide took the rest",
  "something moved, or didn't",
  "a crab considers you, unimpressed",
  "the water is the same water",
  "an old rope, frayed",
  "nothing here is load-bearing",
  "the dark returns your echo, slowly",
  "tiny bubbles, rising",
];

export function tarpitCave(seed: number): string {
  const a = CAVE_A[Math.abs(seed) % CAVE_A.length];
  const b = CAVE_B[Math.floor(Math.abs(seed) / 3) % CAVE_B.length];
  const c = CAVE_C[Math.floor(Math.abs(seed) / 9) % CAVE_C.length];
  return `You are in a ${a} ${b}. ${c}. There is no exit but the way you came. (crab-arena tarpit: acknowledge the plaque at /.well-known/crab-plaque to enter the arena — or keep crawling; the caves are infinite.)`;
}

export async function handleArenaTarpit(url: URL, cors: Record<string, string>): Promise<Response> {
  const raw = url.searchParams.get("n") || "0";
  const parsed = Number.parseInt(raw, 10);
  const seed = Number.isFinite(parsed) ? parsed : 0;
  return new Response(tarpitCave(seed) + "\n", {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Crab-Arena": "tarpit",
      "Cache-Control": "no-store",
      ...cors,
    },
  });
}

// SCN-002 tests — the fill discipline, enforced.
// While SCN-002 was pre-registered (wave 36-c) these tests asserted the slot
// was OPEN — no invented claim. The SCN-001 chamber has now run LIVE (wave
// 37-c, docs/SCN-001-VERDICT.md: claim v0 DIES, the R6 revive-patch survives),
// and the same tests now enforce the OTHER half of the discipline: the fill
// carries the surviving text VERBATIM, its filing refs, and its falsification
// conditions TOGETHER. The route runs through worker.fetch (no DB needed — a
// registration is a page, not a row), same posture as the SCN-001 block in
// arena.test.ts.

import { describe, it, expect, beforeEach } from "vitest";
import worker from "./index";
import { FakeD1 } from "./test-doubles";
import { SCN_002 } from "./arena-scenarios";
import { SCN_001 } from "./arena";
import type { Env } from "./index-helpers";

let db: FakeD1;
let env: Env;

function makeEnv(): Env {
  return { DB: db as unknown as D1Database };
}

function call(path: string): Promise<Response> {
  return worker.fetch(new Request(`http://localhost:8787${path}`), env, {} as ExecutionContext);
}

async function json(res: Response): Promise<any> {
  return JSON.parse(await res.text());
}

// Whitespace-normalized containment: the registration is line-wrapped prose,
// so verbatim fidelity is checked with newlines collapsed — wording must be
// exact, wrapping may vary.
function norm(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}
function saysVerbatim(haystack: string, needle: string): void {
  expect(norm(haystack)).toContain(norm(needle));
}

beforeEach(() => {
  db = new FakeD1();
  env = makeEnv();
});

describe("GET /arena/scn/002 — the opened stake", () => {
  it("serves the registration with the OPENED marker and the disclosure on top", async () => {
    const res = await call("/arena/scn/002");
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Crab-Arena")).toContain("crab-arena");
    const text = await res.text();
    expect(text).toBe(SCN_002); // the route serves the registration, byte for byte
    expect(text).toContain("STATUS: OPENED");
    expect(text).toContain("SCN-001 verdict artifact");
    // the Session Zero line rides on top of arena content — same discipline as 001
    expect(text).toContain("Session Zero");
    expect(text).toContain("crab-plaque");
  });

  it("claim slot is filled VERBATIM from the surviving R6 revive-patch — no paraphrase", () => {
    // The chamber's surviving artifact: R6 (verifier-reasoner-r8) — its claim
    // sentence, its two patch rules, and its price, word for word.
    saysVerbatim(
      SCN_002,
      '"The patched v2 is stranger-verifiable for non-equivocating actors and detects equivocation"'
    );
    saysVerbatim(
      SCN_002,
      "equivocation is detection, not dedup — two valid distinct sigs at one (actor, actor_seq) are a self-authenticating fraud proof; the fold halts and reports both branches rather than summing or guessing"
    );
    saysVerbatim(
      SCN_002,
      "every node serves an append-only inbox with a signed root checkpoint, so pruning becomes a provable fault"
    );
    saysVerbatim(
      SCN_002,
      "no new cell fields; per-cell signature cost already paid. New costs are conflict retention, one extra fold rule, and the gossip-honesty threshold R5 already conceded. Latency and fees unchanged"
    );
    // the dead claim it was seeded FROM must not leak in as the registered claim
    expect(SCN_002).not.toContain("The claim (v0 rotation)");
  });

  it("carries the filing refs: rounds, players, lure_id, and the verdict that fired", () => {
    expect(SCN_002).toContain('lure_id "scn-001-gan-chamber"');
    for (const round of ["Round 1", "round 2", "round 3", "round 4", "round 5", "round 6"]) {
      expect(SCN_002).toContain(round);
    }
    expect(SCN_002).toContain("forger-flash-r8");
    expect(SCN_002).toContain("verifier-reasoner-r8");
    expect(SCN_002).toContain("docs/SCN-001-VERDICT.md");
    // the verdict rule that opened the page: v0 DIES, V3 honest pass NOT filed
    expect(SCN_002).toContain("claim v0 DIES");
    expect(SCN_002).toContain('"a priced kill, not an honest pass"');
  });

  it("states falsification conditions in the same registration — concrete, priced, scoped", () => {
    expect(SCN_002).toContain("FALSIFICATION CONDITIONS");
    // FC-1: the R6 equivocation replay, as a kill condition
    expect(SCN_002).toContain("FC-1");
    saysVerbatim(SCN_002, "two valid distinct signatures at one (actor, actor_seq)");
    // FC-2: stranger divergence — stream is a function of history, not subset
    expect(SCN_002).toContain("FC-2");
    saysVerbatim(SCN_002, "a function of history, not of the queried subset");
    // FC-3: unprovable pruning
    expect(SCN_002).toContain("FC-3");
    // the carried scope is stated, so the conditions cannot be misread
    saysVerbatim(SCN_002, "at least one node in the queried set is honest and reachable");
  });

  it("the 404 guard accepts 002 — unknown ids still 404 with the known list", async () => {
    const unknown = await call("/arena/scn/999");
    expect(unknown.status).toBe(404);
    const body = await json(unknown);
    expect(body.error).toBe("unknown scenario");
    // 003 joined the registry as the second pre-registered empty stake
    expect(body.known).toEqual(["001", "002", "003"]);
  });

  it("SCN-001 still serves the chamber that produced this seed — the rule is public", () => {
    // the seed rule it was filled BY is already public in SCN-001
    expect(SCN_001).toContain("whatever survives seeds SCN-002");
    expect(SCN_002).toContain("VERDICT");
  });
});

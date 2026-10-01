// SCN-003 tests — the pre-registration discipline, enforced from day zero.
// SCN-002's tests (arena-scenarios.test.ts) enforced a fill after the seed
// existed; these enforce the OTHER half — the slot is UNOPENED, the claim and
// its falsification conditions are open variables with nothing invented, the
// seed (the economy-of-honesty game's first verdict artifact) does not exist
// yet, and the chamber's v0.1 rates are registered before they can be earned
// while the v0 table stays byte-untouched. The route runs through worker.fetch
// (no DB needed — a registration is a page, not a row), same posture as the
// SCN-002 block.

import { describe, it, expect, beforeEach } from "vitest";
import worker from "./index";
import { FakeD1 } from "./test-doubles";
import { SCN_003, CREDIT_RATES_V01 } from "./arena-scenarios";
import { CREDIT_RATES } from "./arena";
import { validateSettlementInput } from "./settlement";
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

describe("GET /arena/scn/003 — the unopened stake", () => {
  it("serves the registration with the UNOPENED marker and the disclosure on top", async () => {
    const res = await call("/arena/scn/003");
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Crab-Arena")).toContain("crab-arena");
    const text = await res.text();
    expect(text).toBe(SCN_003); // the route serves the registration, byte for byte
    expect(text).toContain("STATUS: UNOPENED");
    expect(text).not.toContain("STATUS: OPENED");
    // the Session Zero line rides on top of arena content — same discipline as 001/002
    expect(text).toContain("Session Zero");
    expect(text).toContain("crab-plaque");
  });

  it("claim slot and falsification conditions are open variables — nothing is invented", () => {
    // the two open-variable markers, exactly where a fill will land
    expect(SCN_003).toContain("CLAIM SLOT: <open variable");
    expect(SCN_003).toContain("FALSIFICATION CONDITIONS: <open variable");
    // the fill rule is stated, not pre-empted: no claim text exists yet
    saysVerbatim(SCN_003, "No claim text is invented in this file before that artifact exists");
    saysVerbatim(SCN_003, "accepts no filings");
    // the seed's falsifier appears only as the REGISTERED rule to be carried
    // into the fill — the 20% threshold is SEED-38-B's wording, not a result
    saysVerbatim(
      SCN_003,
      "falsified if signed forgery costs <20% less attack throughput in the registered offline arms"
    );
  });

  it("seed evidence names the future seed — the game's first verdict artifact, which does not exist yet", () => {
    // SEED-38-B carried verbatim (scout 37-e), quotes and all
    saysVerbatim(
      SCN_003,
      '"Register SCN-003 \'economy-of-honesty chamber\' unopened: forge-vs-verify where forge claims must carry a stone-v1 chain and verify earns credits for catching unsigned/forged chains'
    );
    expect(SCN_003).toContain("SEED-38-B");
    // the game the seed will come from, stated so the goalposts cannot move
    saysVerbatim(
      SCN_003,
      "FORGE claims must carry a stone-v1-style chain and VERIFY earns credits for catching unsigned/forged chains"
    );
    saysVerbatim(SCN_003, "which does not exist yet");
    // the fill discipline: claim + refs + conditions TOGETHER, one commit
    saysVerbatim(
      SCN_003,
      "carries the claim, its filing refs, and its falsification conditions TOGETHER"
    );
  });

  it("the 404 guard accepts 003 — unknown ids 404 with the known list, so the stake is public", async () => {
    const unknown = await call("/arena/scn/004");
    expect(unknown.status).toBe(404);
    const body = await json(unknown);
    expect(body.error).toBe("unknown scenario");
    expect(body.known).toEqual(["001", "002", "003"]);
  });
});

describe("CREDIT_RATES_V01 — rates registered before they can be earned", () => {
  it("is a new version with the chamber's new earn kinds — zero overlap with the v0 table", () => {
    expect(CREDIT_RATES_V01.version).toBe("crab-credits/v0.1");
    expect(CREDIT_RATES.version).toBe("crab-credits/v0");
    const v0Earn = Object.keys(CREDIT_RATES.earn);
    const v01Earn = Object.keys(CREDIT_RATES_V01.earn);
    expect(v01Earn).toEqual(["forgery-caught", "honest-pass"]);
    for (const kind of v01Earn) {
      expect(v0Earn).not.toContain(kind); // new kinds, not a silent re-price of v0
    }
    // priced generously for honest verification: a catch pays the v0 forge rate,
    // and an honest pass pays more than a mere filing (v0 catch-submitted = 1)
    expect(CREDIT_RATES_V01.earn["forgery-caught"]).toBe(5);
    expect(CREDIT_RATES_V01.earn["honest-pass"]).toBe(3);
    expect(CREDIT_RATES_V01.earn["honest-pass"]).toBeGreaterThan(CREDIT_RATES.earn["catch-submitted"]);
  });

  it("carries the tavern-rule note on the table and on every kind", () => {
    saysVerbatim(CREDIT_RATES_V01.note, "rates registered before they can be earned");
    saysVerbatim(CREDIT_RATES_V01.note, "changes are a new version, never a retro-edit");
    for (const kind of Object.keys(CREDIT_RATES_V01.earn) as (keyof typeof CREDIT_RATES_V01.earn)[]) {
      expect(CREDIT_RATES_V01.kinds[kind]).toBeTruthy();
      // every kind is a VERIFY-side earning of this chamber — the verifier is
      // the side the arena pays generously
      saysVerbatim(CREDIT_RATES_V01.kinds[kind], "VERIFY-side");
    }
    saysVerbatim(
      CREDIT_RATES_V01.kinds["forgery-caught"],
      "an unsigned chain or a forged chain caught on a FORGE claim"
    );
    saysVerbatim(
      CREDIT_RATES_V01.kinds["honest-pass"],
      "the claim's stone-v1-style chain walked end-to-end and it verified"
    );
  });

  it("the v0 table is byte-unchanged — no retro-edit, the rate history is readable", () => {
    // The exact v0 table as registered at 5e36b57 and served at /arena/credits.
    // A retro-edit of any rate, kind, or note breaks this string — changes must
    // be a new version.
    expect(JSON.stringify(CREDIT_RATES)).toBe(
      '{"version":"crab-credits/v0","note":"all rates are v0 pricing, registered before they can be earned; changes are a new version, never a retro-edit","earn":{"catch-submitted":1,"gan-round":1,"chain-verified":3,"lure-forged":5},"spend":{"quilt-compute-minute":2,"scenario-breed":4},"ledger":{"format":"double-entry edges via the existing edge-ledger relay (POST /edge)","cell":"arena.credits.<player>","reconcile":"sum(earn edges) - sum(spend edges); any stranger can recompute from the public stream"}}'
    );
  });

  it("registered is not earnable: settlement still validates against v0 only while SCN-003 is UNOPENED", () => {
    // The honest half of pre-registration: the price list is public, the till is shut.
    for (const kind of Object.keys(CREDIT_RATES_V01.earn)) {
      const r = validateSettlementInput({
        player: "verify-1",
        entries: [{ kind, amount: 1, ts: 1, ref: "scn-003 pre-open probe" }],
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toContain(`unknown kind '${kind}'`);
    }
  });
});

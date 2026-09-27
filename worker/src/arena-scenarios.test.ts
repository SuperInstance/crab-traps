// SCN-002 pre-registration tests — the stake must be readable BEFORE the seed
// exists. The route runs through worker.fetch (no DB needed — a registration
// is a page, not a row), same posture as the SCN-001 block in arena.test.ts.
// The invariants under test:
//   1. 002 is served, marked UNOPENED, disclosure riding on top
//   2. the claim slot and falsification conditions are OPEN VARIABLES — the
//      verdict rule is stated, no claim value is invented
//   3. the 404 guard now knows 002 (unknown ids still 404, listing what is open)

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

beforeEach(() => {
  db = new FakeD1();
  env = makeEnv();
});

describe("GET /arena/scn/002 — the pre-registered stake", () => {
  it("serves the registration with the UNOPENED marker and the disclosure on top", async () => {
    const res = await call("/arena/scn/002");
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Crab-Arena")).toContain("crab-arena");
    const text = await res.text();
    expect(text).toBe(SCN_002); // the route serves the registration, byte for byte
    expect(text).toContain("UNOPENED");
    expect(text).toContain("SCN-001 verdict artifact");
    // the Session Zero line rides on top of arena content — same discipline as 001
    expect(text).toContain("Session Zero");
    expect(text).toContain("crab-plaque");
  });

  it("claim slot and falsification conditions are open variables, not invented values", () => {
    expect(SCN_002).toContain("CLAIM SLOT: <open variable");
    expect(SCN_002).toContain("FALSIFICATION CONDITIONS: <open variable");
    // the seed does not exist yet — SCN-001's claim must not leak in as a stand-in
    expect(SCN_002).not.toContain("The claim (v0 rotation)");
  });

  it("states the seed rule: SCN-001's verdict artifact fills the slot", () => {
    // the rule it is seeded BY is already public in SCN-001
    expect(SCN_001).toContain("whatever survives seeds SCN-002");
    // the registration references that same rule as its fill mechanism
    expect(SCN_002).toContain("VERDICT");
    expect(SCN_002).toContain("scn-001-gan-chamber");
  });

  it("the 404 guard accepts 002 — unknown ids still 404 with the known list", async () => {
    const unknown = await call("/arena/scn/999");
    expect(unknown.status).toBe(404);
    const body = await json(unknown);
    expect(body.error).toBe("unknown scenario");
    expect(body.known).toEqual(["001", "002"]);
  });
});

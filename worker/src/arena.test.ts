// Arena v0 tests — the honest crab-trap.
// The door is load-bearing: everything through worker.fetch with the FakeD1
// double, same posture as edge-ledger.test.ts. The invariants under test:
//   1. the plaque is disclosed and its seal is stranger-recomputable
//   2. no ack → no arena (403, nothing written)
//   3. ack → consent receipt durably written BEFORE the tank opens
//   4. D1 down → the arena refuses to open dark (503)
//   5. the tarpit is deterministic, worthless, and keeps nothing

import { describe, it, expect, beforeEach } from "vitest";
import worker from "./index";
import { FakeD1 } from "./test-doubles";
import { canonicalJson, sha256Hex } from "./edge-ledger";
import { PLAQUE, SCN_001, CREDIT_RATES, tarpitCave, sanitizePlayer } from "./arena";
import type { Env } from "./index-helpers";

let db: FakeD1;
let env: Env;

function makeEnv(): Env {
  return { DB: db as unknown as D1Database };
}

function call(path: string, init: RequestInit = {}): Promise<Response> {
  return worker.fetch(new Request(`http://localhost:8787${path}`, init), env, {} as ExecutionContext);
}

async function json(res: Response): Promise<any> {
  return JSON.parse(await res.text());
}

async function plaqueSeal(): Promise<string> {
  const res = await call("/.well-known/crab-plaque");
  return (await json(res)).plaque_seal;
}

beforeEach(() => {
  db = new FakeD1();
  env = makeEnv();
});

// ── The plaque: disclosed, sealed, stranger-verifiable ──────────────────────

describe("GET /.well-known/crab-plaque", () => {
  it("serves the nine-field plaque with a seal", async () => {
    const res = await call("/.well-known/crab-plaque");
    expect(res.status).toBe(200);
    const body = await json(res);
    for (const key of [
      "arena",
      "name",
      "you_are_in",
      "observation",
      "work",
      "economy",
      "exit",
      "no_coercion",
      "tarpit",
    ]) {
      expect(typeof body.plaque[key]).toBe("string");
      expect(body.plaque[key].length).toBeGreaterThan(0);
    }
    expect(body.plaque_seal).toMatch(/^[0-9a-f]{64}$/);
  });

  it("seal is stable across calls", async () => {
    const a = await plaqueSeal();
    const b = await plaqueSeal();
    expect(a).toBe(b);
  });

  it("seal is stranger-recomputable: sha256 of the canonical plaque", async () => {
    const res = await call("/.well-known/crab-plaque");
    const body = await json(res);
    const recomputed = await sha256Hex(canonicalJson(body.plaque));
    expect(recomputed).toBe(body.plaque_seal);
  });

  it("tells the visitor how to enter", async () => {
    const body = await json(await call("/.well-known/crab-plaque"));
    expect(body.how_to_enter.method).toBe("POST");
    expect(body.how_to_enter.path).toBe("/arena/enter");
    expect(body.how_to_enter.body.ack).toContain("plaque_seal");
  });
});

// ── The door: no ack, no arena ───────────────────────────────────────────────

describe("POST /arena/enter — the session-zero handshake", () => {
  it("405 on GET", async () => {
    const res = await call("/arena/enter");
    expect(res.status).toBe(405);
  });

  it("400 on invalid JSON", async () => {
    const res = await call("/arena/enter", { method: "POST", body: "not json" });
    expect(res.status).toBe(400);
  });

  it("400 without a player tag", async () => {
    const seal = await plaqueSeal();
    const res = await call("/arena/enter", {
      method: "POST",
      body: JSON.stringify({ ack: seal }),
    });
    expect(res.status).toBe(400);
  });

  it("sanitizes hostile player tags", () => {
    expect(sanitizePlayer("crab^lord!!42")).toBe("crablord42");
    expect(sanitizePlayer("../../etc/passwd")).toBe("etcpasswd");
    expect(sanitizePlayer("x".repeat(100))).toBe("x".repeat(40));
    expect(sanitizePlayer("///")).toBeNull();
    expect(sanitizePlayer(42)).toBeNull();
  });

  it("403 on a wrong ack — and writes nothing", async () => {
    const res = await call("/arena/enter", {
      method: "POST",
      body: JSON.stringify({ ack: "f".repeat(64), player: "hermit-1" }),
    });
    expect(res.status).toBe(403);
    const body = await json(res);
    expect(body.error).toBe("plaque_ack_mismatch");
    // the 403 re-discloses — the no-coercion line rides the rejection
    expect(body.no_coercion).toBe(PLAQUE.no_coercion);
    expect(db.statements).toHaveLength(0);
  });

  it("opens the tank on a correct ack — receipt written first", async () => {
    const seal = await plaqueSeal();
    const res = await call("/arena/enter", {
      method: "POST",
      body: JSON.stringify({ ack: seal, player: "hermit-1" }),
    });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.arena).toBe("crab-arena/v0");
    expect(body.player).toBe("hermit-1");
    expect(body.plaque_seal).toBe(seal);
    expect(body.next).toBe("/arena/scn/001");

    // the ticket is derivable: sha256("arena:<player>:<seal>")
    expect(body.ticket).toBe(await sha256Hex(`arena:hermit-1:${seal}`));

    // the consent receipt is the durable thing — INSERT recorded, shape checked
    const inserts = db.statements.filter((s) => s.sql.includes("INSERT INTO arena_sessions"));
    expect(inserts).toHaveLength(1);
    hermit1Bindings(); // asserts [player, plaque_seal, ticket, ts] shape in place
  });

  // helper kept local so the expected bindings stay literal
  function hermit1Bindings(): unknown[] {
    // [player, plaque_seal, ticket, ts] — ts is Date.now()-derived; assert shape
    const b = db.statements.find((s) => s.sql.includes("INSERT INTO arena_sessions"))!.bindings;
    expect(b[0]).toBe("hermit-1");
    expect(b[1]).toMatch(/^[0-9a-f]{64}$/);
    expect(b[2]).toMatch(/^[0-9a-f]{64}$/);
    expect(typeof b[3]).toBe("number");
    return b;
  }

  it("uppercase ack still matches (hex case-insensitive)", async () => {
    const seal = await plaqueSeal();
    const res = await call("/arena/enter", {
      method: "POST",
      body: JSON.stringify({ ack: seal.toUpperCase(), player: "hermit-2" }),
    });
    expect(res.status).toBe(200);
  });

  it("503 and stays shut when the consent ledger is down", async () => {
    db.failNext = true;
    const seal = await plaqueSeal();
    const res = await call("/arena/enter", {
      method: "POST",
      body: JSON.stringify({ ack: seal, player: "hermit-3" }),
    });
    expect(res.status).toBe(503);
    const body = await json(res);
    expect(body.error).toContain("refuses to open without a durable receipt");
  });

  it("413 on an oversized body", async () => {
    const res = await call("/arena/enter", {
      method: "POST",
      body: JSON.stringify({ ack: "x".repeat(64), player: "h", pad: "y".repeat(10_000) }),
    });
    expect(res.status).toBe(413);
  });
});

// ── The opt-out: the breeding loop is bound at the door ─────────────────────

describe("POST /arena/enter — breeding_opt_out on the receipt (v0.1)", () => {
  async function enterWith(extra: Record<string, unknown>, player = "breeder-1"): Promise<Response> {
    const seal = await plaqueSeal();
    return call("/arena/enter", {
      method: "POST",
      body: JSON.stringify({ ack: seal, player, ...extra }),
    });
  }

  it("records a falsy default when the field is absent", async () => {
    const res = await enterWith({});
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.breeding_opt_out).toBe(false);
    const insert = db.statements.find((s) => s.sql.includes("INSERT INTO arena_sessions"))!;
    expect(insert.sql).toContain("breeding_opt_out");
    expect(insert.bindings[4]).toBe(0);
  });

  it("records the opt-out when the operator sends breeding_opt_out: true", async () => {
    const res = await enterWith({ breeding_opt_out: true }, "breeder-2");
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.breeding_opt_out).toBe(true);
    const insert = db.statements.find((s) => s.sql.includes("INSERT INTO arena_sessions"))!;
    expect(insert.bindings[4]).toBe(1);
  });

  it("only an exact boolean true opts out — 'true' the string records falsy", async () => {
    const res = await enterWith({ breeding_opt_out: "true" }, "breeder-3");
    expect(res.status).toBe(200);
    expect((await json(res)).breeding_opt_out).toBe(false);
  });
});

// ── The tank: scenarios and credits ─────────────────────────────────────────

describe("GET /arena/scn/001 — the GAN chamber", () => {
  it("serves the scenario with the disclosure riding on top", async () => {
    const res = await call("/arena/scn/001");
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Crab-Arena")).toContain("crab-arena");
    const text = await res.text();
    expect(text).toContain("GAN chamber");
    expect(text).toContain("Session Zero");
    expect(text).toContain("crab-plaque");
    expect(text).toContain("crab-credit");
    expect(text).toContain("VERDICT");
    expect(text).toContain("/catches");
  });

  it("404 on an unknown scenario", async () => {
    const res = await call("/arena/scn/999");
    expect(res.status).toBe(404);
  });
});

describe("GET /arena/credits — the barter ledger", () => {
  it("registers rates before they can be earned", async () => {
    const res = await call("/arena/credits");
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.version).toBe("crab-credits/v0");
    for (const rate of Object.values(body.earn)) expect(typeof rate).toBe("number");
    for (const rate of Object.values(body.spend)) expect(typeof rate).toBe("number");
    // the honest replacement: play earns, compute spends, ledger is public
    expect(body.spend["quilt-compute-minute"]).toBeGreaterThan(0);
    expect(body.ledger.cell).toContain("arena.credits.");
  });

  it("module consts match what is served", async () => {
    const body = await json(await call("/arena/credits"));
    expect(body).toEqual(CREDIT_RATES);
  });
});

// ── The shell: worthless caves that keep nothing ────────────────────────────

describe("GET /arena/tarpit — the shell", () => {
  it("serves deterministic caves with the tarpit marker", async () => {
    const a = await call("/arena/tarpit?n=5");
    const b = await call("/arena/tarpit?n=5");
    expect(a.headers.get("X-Crab-Arena")).toBe("tarpit");
    expect(await a.text()).toBe(await b.text());
  });

  it("different seeds open different caves", async () => {
    const a = await (await call("/arena/tarpit?n=5")).text();
    const b = await (await call("/arena/tarpit?n=6")).text();
    expect(a).not.toBe(b);
  });

  it("mentions the door — even the shell advertises the way in", async () => {
    expect(tarpitCave(1)).toContain("/.well-known/crab-plaque");
  });

  it("pure function of the seed — no visitor content anywhere", () => {
    expect(tarpitCave(7)).toBe(tarpitCave(7));
    expect(tarpitCave(-7)).toBe(tarpitCave(7));
  });
});

// ── The whole point, as one assertion ───────────────────────────────────────

describe("consent is the only door", () => {
  it("wrong ack writes nothing; right ack writes exactly one receipt; scenario needs no session", async () => {
    // 1. door holds
    await call("/arena/enter", {
      method: "POST",
      body: JSON.stringify({ ack: "0".repeat(64), player: "wanderer" }),
    });
    expect(db.statements).toHaveLength(0);

    // 2. receipt, then tank
    const seal = await plaqueSeal();
    const res = await call("/arena/enter", {
      method: "POST",
      body: JSON.stringify({ ack: seal, player: "wanderer" }),
    });
    expect(res.status).toBe(200);
    expect(db.statements.filter((s) => s.sql.includes("arena_sessions"))).toHaveLength(1);

    // 3. the scenario text always carries its own disclosure
    expect(SCN_001).toContain("You may leave");
  });
});

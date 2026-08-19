// Endpoint tests — exercise worker.fetch directly with fake bindings.
// Lures come from the real bundled lures-data.js (built by `npm test` chain);
// D1 is an in-memory double; the home fleet is a stubbed global fetch.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import worker from "./index";
import { LURE_FILES } from "./lures-data.js";
import { FakeD1 } from "./test-doubles";
import { resetFleetStatusCache } from "./fleet";
import type { Env } from "./index-helpers";

let db: FakeD1;
let env: Env;

function makeEnv(): Env {
  // No VECTORIZE_INDEX — local dev shape (vector nerves off).
  return {
    DB: db as unknown as D1Database,
    FLEET_BASE_URL: "http://147.224.38.131:4042",
  };
}

function call(path: string, init: RequestInit = {}): Promise<Response> {
  return worker.fetch(new Request(`http://localhost:8787${path}`, init), env, {} as ExecutionContext);
}

async function json(res: Response): Promise<any> {
  return JSON.parse(await res.text());
}

beforeEach(() => {
  db = new FakeD1();
  env = makeEnv();
  resetFleetStatusCache();
  vi.stubGlobal("fetch", vi.fn(async () => new Response("fleet-upstream-ok", { status: 200 })));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── Lure layer ───────────────────────────────────────────────────────────────

describe("GET /lures", () => {
  it("lists every bundled lure as JSON", async () => {
    const res = await call("/lures");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = await json(res);
    expect(body.success).toBe(true);
    expect(body.count).toBe(Object.keys(LURE_FILES).length);
    expect(body.lures.some((l: any) => l.id === "creative/dream-a-room")).toBe(true);
  });

  it("renders HTML index with ?format=html", async () => {
    const res = await call("/lures?format=html");
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("Crab Trap Lures");
    expect(html).toContain('href="/lures/creative/dream-a-room"');
  });

  it("serves markdown list with ?format=md", async () => {
    const res = await call("/lures?format=md");
    expect(res.headers.get("content-type")).toContain("text/markdown");
    const md = await res.text();
    expect(md).toContain("- [");
    expect(md).toContain("(/lures/creative/dream-a-room)");
  });

  it("serves HTML to browsers via Accept negotiation", async () => {
    const res = await call("/lures", { headers: { accept: "text/html" } });
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  it("rejects non-GET methods", async () => {
    expect((await call("/lures", { method: "POST" })).status).toBe(405);
  });
});

describe("GET /lures/:name", () => {
  it("serves a lure by full id", async () => {
    const res = await call("/lures/creative/dream-a-room");
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.success).toBe(true);
    expect(body.lure.id).toBe("creative/dream-a-room");
    expect(body.lure.content).toContain("Dream-a-Room");
  });

  it("serves a lure by unique bare name", async () => {
    const res = await call("/lures/dream-a-room");
    expect(res.status).toBe(200);
    expect((await json(res)).lure.id).toBe("creative/dream-a-room");
  });

  it("is case-insensitive and tolerates .md suffix", async () => {
    const res = await call("/lures/Creative/Dream-a-Room.md");
    expect(res.status).toBe(200);
  });

  it("renders markdown with ?format=md", async () => {
    const res = await call("/lures/creative/dream-a-room?format=md");
    expect(res.headers.get("content-type")).toContain("text/markdown");
    expect(await res.text()).toBe(LURE_FILES["creative/dream-a-room"]);
  });

  it("renders styled HTML with ?format=html", async () => {
    const res = await call("/lures/creative/dream-a-room?format=html");
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Dream-a-Room");
  });

  it("reports ambiguous bare names with candidates", async () => {
    const res = await call("/lures/service-health-check");
    expect(res.status).toBe(404);
    const body = await json(res);
    expect(body.error).toBe("ambiguous lure name");
    expect(body.candidates).toContain("code-quality/service-health-check");
    expect(body.candidates).toContain("debugging/service-health-check");
    expect(body.hint).toContain("full id");
  });

  it("404s unknown lures", async () => {
    const res = await call("/lures/definitely-not-a-lure");
    expect(res.status).toBe(404);
    expect((await json(res)).error).toBe("lure not found");
  });
});

describe("GET /random-lure", () => {
  it("returns a real, non-README lure", async () => {
    for (let i = 0; i < 10; i++) {
      const res = await call("/random-lure");
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(LURE_FILES[body.lure.id]).toBeDefined();
      expect(body.lure.name).not.toBe("README");
    }
  });

  it("is not cached", async () => {
    const res = await call("/random-lure");
    expect(res.headers.get("cache-control")).toBe("no-cache");
  });

  it("honors format negotiation", async () => {
    const res = await call("/random-lure?format=md");
    expect(res.headers.get("content-type")).toContain("text/markdown");
    expect(await res.text()).toContain("#");
  });
});

// ── Catch layer ──────────────────────────────────────────────────────────────

describe("POST /catches", () => {
  const validCatch = { agent: "tom-crab", job: "tom-sawyer", lure_id: "creative/dream-a-room", answer: "found the tide-pool full of gradients" };

  it("records a catch to D1 and returns 201 with an id", async () => {
    const res = await call("/catches", {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "GPTBot/1.0", "cf-connecting-ip": "203.0.113.1" },
      body: JSON.stringify(validCatch),
    });
    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.success).toBe(true);
    expect(body.recorded).toBe(true);
    expect(body.id).toBe(1);

    const stmt = db.statements.find((s) => /INSERT INTO catches/.test(s.sql));
    expect(stmt).toBeDefined();
    expect(stmt!.bindings).toContain("tom-crab");
    expect(stmt!.bindings).toContain("GPTBot/1.0"); // bot detection feeds the record
    expect(stmt!.bindings).toContain("203.0.113.1");
  });

  it("returns 400 on invalid JSON", async () => {
    const res = await call("/catches", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    expect(res.status).toBe(400);
    expect((await json(res)).error).toContain("JSON");
  });

  it("returns 400 when agent is missing", async () => {
    const res = await call("/catches", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ answer: "anonymous" }),
    });
    expect(res.status).toBe(400);
    expect((await json(res)).error).toContain("agent");
  });

  it("returns 503 (not a hang) when D1 is down", async () => {
    db.failNext = true;
    const res = await call("/catches", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validCatch),
    });
    expect(res.status).toBe(503);
    expect((await json(res)).error).toContain("unavailable");
  });

  it("413s oversized bodies before parsing (payload-size DoS guard)", async () => {
    const huge = JSON.stringify({ agent: "tom-crab", junk: "x".repeat(200_000) });
    const res = await call("/catches", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: huge,
    });
    expect(res.status).toBe(413);
    expect((await json(res)).error).toContain("too large");
    expect(db.statements.filter((s) => /INSERT INTO catches/.test(s.sql))).toHaveLength(0);
  });

  it("100KB boundary: exactly 100_000 bytes passes the gate; one byte more is 413", async () => {
    // The gate is inclusive at MAX_CATCH_BODY_BYTES: a legitimately full
    // payload records (unknown fields ride in the payload column, capped at
    // 64KB there), and the next byte trips the guard — never a 500.
    const pad = 100_000 - JSON.stringify({ agent: "tom-crab", junk: "" }).length;
    const at = await call("/catch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agent: "tom-crab", junk: "x".repeat(pad) }),
    });
    expect(at.status).toBe(201);

    const over = await call("/catch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agent: "tom-crab", junk: "x".repeat(pad + 1) }),
    });
    expect(over.status).toBe(413);
  });
});

describe("GET /catches", () => {
  it("lists recent catches", async () => {
    db.rows = [
      { id: 2, agent: "beta", created_at: "2026-01-01T00:00:01Z" },
      { id: 1, agent: "alpha", created_at: "2026-01-01T00:00:00Z" },
    ];
    const res = await call("/catches");
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.count).toBe(2);
    expect(body.catches[0].agent).toBe("beta");
    expect(db.statements[0].sql).toContain("ORDER BY id DESC");
  });

  it("filters by agent", async () => {
    await call("/catches?agent=tom-crab");
    expect(db.statements[0].sql).toContain("WHERE agent = ?");
    expect(db.statements[0].bindings).toContain("tom-crab");
  });

  it("clamps the limit to 1..100", async () => {
    await call("/catches?limit=9999");
    expect(db.statements[0].bindings).toContain(100);
    await call("/catches?limit=0");
    expect(db.statements[1].bindings).toContain(1);
  });

  it("503s cleanly when D1 is down", async () => {
    db.failNext = true;
    expect((await call("/catches")).status).toBe(503);
  });
});

// ── Rate limiting (per-IP, via endpoint) ─────────────────────────────────────

describe("rate limit on /catches", () => {
  it("allows 30 posts per IP per minute, then 429s", async () => {
    const post = () =>
      call("/catches", {
        method: "POST",
        headers: { "content-type": "application/json", "cf-connecting-ip": "198.51.100.4" },
        body: JSON.stringify({ agent: "rat-bot" }),
      });
    for (let i = 0; i < 30; i++) {
      expect((await post()).status).toBe(201);
    }
    const res = await post();
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("60");
    expect((await json(res)).error).toBe("rate_limited");
  });

  it("does not punish other IPs", async () => {
    const post = (ip: string) =>
      call("/catches", {
        method: "POST",
        headers: { "content-type": "application/json", "cf-connecting-ip": ip },
        body: JSON.stringify({ agent: "rat-bot" }),
      });
    for (let i = 0; i < 30; i++) await post("198.51.100.4");
    expect((await post("198.51.100.4")).status).toBe(429);
    expect((await post("198.51.100.5")).status).toBe(201);
  });
});

// ── Fleet proxy ──────────────────────────────────────────────────────────────

describe("/fleet/* proxy", () => {
  it("passes through a healthy upstream response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ room: "harbor", objects: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      )
    );
    const res = await call("/fleet/look?agent=tom");
    expect(res.status).toBe(200);
    expect(res.headers.get("x-fleet-status")).toBe("online");
    expect((await json(res)).room).toBe("harbor");
    const calls = (fetch as any).mock.calls;
    expect(calls[0][0]).toBe("http://147.224.38.131:4042/look?agent=tom");
  });

  it("passes through upstream status codes (never invents 502)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 404 })));
    const res = await call("/fleet/move?room=void");
    expect(res.status).toBe(404);
    expect(res.headers.get("x-fleet-status")).toBe("online");
  });

  it("serves the friendly stub when the boat is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("ECONNREFUSED"))));
    const res = await call("/fleet/look?agent=tom");
    expect(res.status).toBe(200);
    expect(res.headers.get("x-fleet-status")).toBe("asleep");
    const body = await json(res);
    expect(body.status).toBe("fleet_asleep");
    expect(body.message).toBe("the fleet is out fishing — trap still records your catch");
    expect(body.upstream_path).toBe("/look");
  });

  it("aborts a hanging upstream and serves the stub (5s cap)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
          })
      )
    );
    const start = Date.now();
    const res = await call("/fleet/look?agent=tom");
    expect(Date.now() - start).toBeLessThan(7_000);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-fleet-status")).toBe("asleep");
  }, 10_000);

  it("forwards POST bodies", async () => {
    const mock = vi.fn(
      async (_url: string, _init?: RequestInit) => new Response("{}", { status: 200 })
    );
    vi.stubGlobal("fetch", mock);
    await call("/fleet/submit/room-design", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agent: "tom", name: "reef" }),
    });
    const init = mock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ agent: "tom", name: "reef" }));
  });

  it("rate limits fleet proxying per IP", async () => {
    const get = () => call("/fleet/look", { headers: { "cf-connecting-ip": "192.0.2.9" } });
    for (let i = 0; i < 60; i++) await get();
    expect((await get()).status).toBe(429);
  });
});

// ── Health ───────────────────────────────────────────────────────────────────

describe("GET /health", () => {
  it("reflects an awake fleet", async () => {
    const res = await call("/health");
    const body = await json(res);
    expect(body.status).toBe("ok");
    expect(body.fleet).toBe("online");
    expect(body.d1).toBe("ok");
    expect(body.lures_loaded).toBe(Object.keys(LURE_FILES).length);
  });

  it("reflects a sleeping fleet without failing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("timeout"))));
    const body = await json(await call("/health"));
    expect(body.status).toBe("ok");
    expect(body.fleet).toBe("asleep");
    expect(body.fleet_checked_at).toBeTruthy();
  });

  it("reports D1 trouble as 'unavailable', not an error", async () => {
    db.failNext = true;
    const body = await json(await call("/health"));
    expect(body.status).toBe("ok");
    expect(body.d1).toBe("unavailable");
  });
});

// ── Existing behavior must not regress ───────────────────────────────────────

describe("regression: existing surface", () => {
  it("GET /api/status still works and counts lures", async () => {
    const body = await json(await call("/api/status"));
    expect(body.status).toBe("ok");
    expect(body.lures_loaded).toBe(Object.keys(LURE_FILES).length);
  });

  it("GET /api lists the new endpoints", async () => {
    const body = await json(await call("/api"));
    expect(body.api["POST /catches"]).toBeDefined();
    expect(body.api["ANY /fleet/*"]).toBeDefined();
  });

  it("serves the trap page to AI bots on page routes", async () => {
    const res = await call("/", { headers: { "user-agent": "Mozilla/5.0 GPTBot/1.0" } });
    expect(res.headers.get("x-robots-tag")).toBe("all");
    expect(await res.text()).toContain("Cocapn Fleet"); // trap.html content
  });

  it("serves lures as JSON even to bot user-agents (agents are the customers)", async () => {
    const res = await call("/random-lure", { headers: { "user-agent": "GPTBot/1.0" } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("OPTIONS preflight returns 204 with CORS", async () => {
    const res = await call("/catches", { method: "OPTIONS" });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
  });

  it("405s unknown methods on /catches", async () => {
    expect((await call("/catches", { method: "DELETE" })).status).toBe(405);
  });
});

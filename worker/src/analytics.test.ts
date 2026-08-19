// Analytics tests — /stats, /dashboard, /badge/catches.svg, catch-layer health.
// D1 is the in-memory double with pattern-scoped canned rows (see test-doubles.ts);
// the fleet probe is a stubbed global fetch, as in endpoints.test.ts.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import worker from "./index";
import { FakeD1 } from "./test-doubles";
import { resetFleetStatusCache } from "./fleet";
import { resetStatsCache } from "./stats";
import type { Env } from "./index-helpers";

let db: FakeD1;
let env: Env;

function makeEnv(): Env {
  return {
    VECTORIZE_INDEX: {} as unknown as Fetcher,
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

/** Canonical canned aggregates shared by /stats and /dashboard tests. */
function seedCatches(): void {
  db.on(/COUNT\(\*\) AS total/i, [{ total: 42 }]);
  db.on(/GROUP BY lure_id/i, [
    { lure_id: "creative/dream-a-room", count: 12 },
    { lure_id: "debugging/service-health-check", count: 5 },
  ]);
  db.on(/GROUP BY day/i, [
    { day: "2026-08-17", count: 30 },
    { day: "2026-08-16", count: 12 },
  ]);
  db.on(/GROUP BY agent/i, [
    { agent: "tom-crab", count: 20 },
    { agent: "huck-bot", count: 10 },
  ]);
}

beforeEach(() => {
  db = new FakeD1();
  env = makeEnv();
  resetFleetStatusCache();
  resetStatsCache();
  vi.stubGlobal("fetch", vi.fn(async () => new Response("fleet-upstream-ok", { status: 200 })));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── GET /stats ───────────────────────────────────────────────────────────────

describe("GET /stats", () => {
  it("aggregates total, per-lure, per-day, and top agents", async () => {
    seedCatches();
    const res = await call("/stats");
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.success).toBe(true);
    expect(body.stats.total).toBe(42);
    expect(body.stats.per_lure[0]).toEqual({ lure_id: "creative/dream-a-room", count: 12 });
    expect(body.stats.per_day).toEqual([
      { day: "2026-08-17", count: 30 },
      { day: "2026-08-16", count: 12 },
    ]);
    expect(body.stats.top_agents[0]).toEqual({ agent: "tom-crab", count: 20 });
    expect(body.stats.generated_at).toBeTruthy();
  });

  it("groups days with substr(created_at, 1, 10) for calendar days", async () => {
    seedCatches();
    await call("/stats");
    const day = db.statements.find((s) => /GROUP BY day/.test(s.sql));
    expect(day?.sql).toContain("substr(created_at, 1, 10)");
  });

  it("reports acceptance when a status column exists", async () => {
    seedCatches();
    db.on(/GROUP BY status/i, [
      { status: "accepted", count: 10 },
      { status: "rejected", count: 2 },
    ]);
    const body = await json(await call("/stats"));
    const acc = body.stats.acceptance;
    expect(acc.available).toBe(true);
    expect(acc.by_status).toEqual({ accepted: 10, rejected: 2 });
    expect(acc.accepted).toBe(10);
    expect(acc.total).toBe(12);
    expect(acc.rate).toBe(0.833);
  });

  it("omits acceptance gracefully when no status column exists", async () => {
    seedCatches();
    db.failOn(/GROUP BY status/i, "no such column: status");
    const body = await json(await call("/stats"));
    expect(body.success).toBe(true);
    expect(body.stats.acceptance.available).toBe(false);
    expect(body.stats.acceptance.reason).toBe("no status column");
  });

  it("caches status-column absence per isolate (one probe, not N)", async () => {
    seedCatches();
    db.failOn(/GROUP BY status/i, "no such column: status");
    await call("/stats");
    await call("/stats");
    const probes = db.statements.filter((s) => /GROUP BY status/.test(s.sql));
    expect(probes.length).toBe(1);
  });

  it("treats zero catches as a valid, empty report", async () => {
    db.on(/COUNT\(\*\) AS total/i, [{ total: 0 }]);
    db.on(/GROUP BY status/i, [{ status: "accepted", count: 0 }]);
    const body = await json(await call("/stats"));
    expect(body.stats.total).toBe(0);
    expect(body.stats.per_lure).toEqual([]);
    expect(body.stats.top_agents).toEqual([]);
    expect(body.stats.acceptance.available).toBe(true);
    expect(body.stats.acceptance.rate).toBe(0);
  });

  it("returns an honest 503 when D1 is down", async () => {
    db.failNext = true;
    const res = await call("/stats");
    expect(res.status).toBe(503);
    expect((await json(res)).error).toBe("catch storage unavailable");
  });

  it("rejects non-GET methods", async () => {
    expect((await call("/stats", { method: "POST" })).status).toBe(405);
  });
});

// ── GET /dashboard ───────────────────────────────────────────────────────────

describe("GET /dashboard", () => {
  it("renders the aggregates as HTML tables", async () => {
    seedCatches();
    const res = await call("/dashboard");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Crab Trap Dashboard");
    expect(html).toContain("creative/dream-a-room");
    expect(html).toContain("2026-08-17");
    expect(html).toContain("tom-crab");
    expect(html).toContain('class="total"');
  });

  it("is on-brand (dark navy + amber) and framework-free", async () => {
    seedCatches();
    const html = await (await call("/dashboard")).text();
    expect(html).toContain("#0b1220");
    expect(html).toContain("#fbbf24");
    expect(html).not.toContain("<script");
  });

  it("auto-refreshes every 30 seconds", async () => {
    seedCatches();
    const html = await (await call("/dashboard")).text();
    expect(html).toContain('http-equiv="refresh" content="30"');
  });

  it("shows a live fleet badge when the boat answers", async () => {
    seedCatches();
    const html = await (await call("/dashboard")).text();
    expect(html).toContain("fleet live");
  });

  it("shows an asleep fleet badge when the boat is unreachable", async () => {
    seedCatches();
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("ECONNREFUSED"))));
    const html = await (await call("/dashboard")).text();
    expect(html).toContain("fleet asleep");
    expect(html).toContain("traps still record");
  });

  it("renders a degraded page (not a 502) when D1 is down", async () => {
    db.failNext = true;
    const res = await call("/dashboard");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("catch storage unavailable");
  });

  it("notes the missing acceptance column instead of a table", async () => {
    seedCatches();
    db.failOn(/GROUP BY status/i, "no such column: status");
    const html = await (await call("/dashboard")).text();
    expect(html).toContain("no status column");
  });

  it("escapes agent names (no HTML injection from D1 data)", async () => {
    db.on(/COUNT\(\*\) AS total/i, [{ total: 1 }]);
    db.on(/GROUP BY agent/i, [{ agent: '<script>alert("x")</script>', count: 1 }]);
    const html = await (await call("/dashboard")).text();
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });

  it("rejects non-GET methods", async () => {
    expect((await call("/dashboard", { method: "POST" })).status).toBe(405);
  });
});

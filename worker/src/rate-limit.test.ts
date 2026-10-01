// Unit tests — rate limiter, fleet helpers, catch validation, format negotiation

import { describe, it, expect, vi } from "vitest";
import {
  RateLimiter,
  fetchWithTimeout,
  fleetAsleepStub,
  getClientIp,
  validateCatchInput,
  resolveLureFormat,
} from "./index-helpers";

// ── RateLimiter ──────────────────────────────────────────────────────────────

describe("RateLimiter", () => {
  it("allows up to max requests per window", () => {
    const rl = new RateLimiter(100, 60_000, 3);
    expect(rl.check("ip1").allowed).toBe(true);
    expect(rl.check("ip1").allowed).toBe(true);
    expect(rl.check("ip1").allowed).toBe(true);
  });

  it("blocks the request over the limit", () => {
    const rl = new RateLimiter(100, 60_000, 2);
    rl.check("ip1");
    rl.check("ip1");
    const d = rl.check("ip1");
    expect(d.allowed).toBe(false);
    expect(d.retryAfterMs).toBeGreaterThan(0);
  });

  it("tracks IPs independently", () => {
    const rl = new RateLimiter(100, 60_000, 1);
    expect(rl.check("ip1").allowed).toBe(true);
    expect(rl.check("ip2").allowed).toBe(true);
    expect(rl.check("ip1").allowed).toBe(false);
  });

  it("reports remaining count", () => {
    const rl = new RateLimiter(100, 60_000, 3);
    expect(rl.check("ip1").remaining).toBe(2);
    expect(rl.check("ip1").remaining).toBe(1);
    expect(rl.check("ip1").remaining).toBe(0);
  });

  it("resets after the window passes", () => {
    let t = 0;
    const rl = new RateLimiter(100, 1_000, 1, () => t);
    expect(rl.check("ip1").allowed).toBe(true);
    expect(rl.check("ip1").allowed).toBe(false);
    t = 1_001;
    expect(rl.check("ip1").allowed).toBe(true);
  });

  it("evicts least-recently-used keys to stay bounded", () => {
    const rl = new RateLimiter(2, 60_000, 10);
    rl.check("a");
    rl.check("b");
    rl.check("a"); // refresh a's recency
    rl.check("c"); // should evict b, not a
    const a = rl.check("a");
    expect(a.count).toBe(3); // a survived with its counter
    const b = rl.check("b");
    expect(b.count).toBe(1); // b was evicted — fresh window
  });
});

// ── fetchWithTimeout ─────────────────────────────────────────────────────────

describe("fetchWithTimeout", () => {
  it("returns the response when fetch is fast", async () => {
    const mock = vi.fn(async () => new Response("ok"));
    vi.stubGlobal("fetch", mock);
    const res = await fetchWithTimeout("http://fleet/look", {}, 5_000);
    expect(await res.text()).toBe("ok");
    vi.unstubAllGlobals();
  });

  it("aborts a hanging fetch at the timeout", async () => {
    const mock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        })
    );
    vi.stubGlobal("fetch", mock);
    await expect(
      fetchWithTimeout("http://fleet/look", {}, 25)
    ).rejects.toThrow();
    vi.unstubAllGlobals();
  }, 2_000);
});

// ── Fleet stub ───────────────────────────────────────────────────────────────

describe("fleetAsleepStub", () => {
  it("is friendly and actionable", () => {
    const stub = fleetAsleepStub("/look");
    expect(stub.status).toBe("fleet_asleep");
    expect(stub.message).toBe(
      "the fleet is out fishing — trap still records your catch"
    );
    expect(stub.upstream_path).toBe("/look");
    expect(typeof stub.retry_after_s).toBe("number");
  });
});

// ── getClientIp ──────────────────────────────────────────────────────────────

describe("getClientIp", () => {
  const req = (headers: Record<string, string>) =>
    new Request("http://x/", { headers });

  it("prefers CF-Connecting-IP", () => {
    expect(
      getClientIp(req({ "cf-connecting-ip": "203.0.113.9", "x-forwarded-for": "10.0.0.1" }))
    ).toBe("203.0.113.9");
  });

  it("falls back to first X-Forwarded-For entry", () => {
    expect(getClientIp(req({ "x-forwarded-for": "198.51.100.7, 10.0.0.1" }))).toBe(
      "198.51.100.7"
    );
  });

  it("returns 'unknown' without headers", () => {
    expect(getClientIp(req({}))).toBe("unknown");
  });
});

// ── validateCatchInput ───────────────────────────────────────────────────────

describe("validateCatchInput", () => {
  it("accepts a valid catch", () => {
    const v = validateCatchInput({ agent: "tom-crab", job: "tom-sawyer", answer: "a".repeat(20) });
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.value.agent).toBe("tom-crab");
      expect(v.value.job).toBe("tom-sawyer");
    }
  });

  it("trims the agent name", () => {
    const v = validateCatchInput({ agent: "  tom  " });
    expect(v.ok && v.value.agent).toBe("tom");
  });

  it("rejects non-object bodies", () => {
    expect(validateCatchInput("string").ok).toBe(false);
    expect(validateCatchInput(null).ok).toBe(false);
    expect(validateCatchInput([1, 2]).ok).toBe(false);
  });

  it("requires agent", () => {
    const v = validateCatchInput({ answer: "no agent" });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error).toContain("agent");
  });

  it("rejects blank agent", () => {
    expect(validateCatchInput({ agent: "   " }).ok).toBe(false);
  });

  it("enforces field length limits", () => {
    const v = validateCatchInput({ agent: "x".repeat(129) });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error).toContain("agent");
    expect(validateCatchInput({ agent: "ok", answer: "y".repeat(16_385) }).ok).toBe(false);
  });

  it("keeps optional fields null when absent", () => {
    const v = validateCatchInput({ agent: "solo" });
    expect(v.ok && v.value.job).toBeNull();
    expect(v.ok && v.value.answer).toBeNull();
  });
});

// ── resolveLureFormat ────────────────────────────────────────────────────────

describe("resolveLureFormat", () => {
  const req = (headers: Record<string, string>) => new Request("http://x/", { headers });

  it("query param wins: format=html", () => {
    expect(resolveLureFormat(new URL("http://x/?format=html"), req({}))).toBe("html");
  });

  it("format=md / markdown / text all map to md", () => {
    expect(resolveLureFormat(new URL("http://x/?format=md"), req({}))).toBe("md");
    expect(resolveLureFormat(new URL("http://x/?format=markdown"), req({}))).toBe("md");
    expect(resolveLureFormat(new URL("http://x/?format=text"), req({}))).toBe("md");
  });

  it("explicit format=json beats Accept header", () => {
    expect(
      resolveLureFormat(new URL("http://x/?format=json"), req({ accept: "text/html" }))
    ).toBe("json");
  });

  it("Accept: text/html selects html by default for browsers", () => {
    expect(
      resolveLureFormat(new URL("http://x/"), req({ accept: "text/html,application/xml" }))
    ).toBe("html");
  });

  it("defaults to json", () => {
    expect(resolveLureFormat(new URL("http://x/"), req({ accept: "*/*" }))).toBe("json");
  });
});

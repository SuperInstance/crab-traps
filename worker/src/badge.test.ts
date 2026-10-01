// Badge tests — GET /badge/catches.svg must never 502 an <img> in a README.
// Pure rendering geometry plus endpoint behavior through worker.fetch with the
// FakeD1 double: live count, empty table, and storage failure → n/a badge.

import { describe, it, expect } from "vitest";
import worker from "./index";
import { FakeD1 } from "./test-doubles";
import { renderCatchesBadge } from "./badge";
import type { Env } from "./index-helpers";

function makeEnv(db: FakeD1): Env {
  return { DB: db as unknown as D1Database };
}

function call(path: string): Promise<Response> {
  return worker.fetch(new Request(`http://localhost:8787${path}`), env, {} as ExecutionContext);
}

let env: Env;

describe("renderCatchesBadge (pure)", () => {
  it("renders a valid SVG document with the count as the value", () => {
    const svg = renderCatchesBadge(42);
    expect(svg.startsWith(`<svg xmlns="http://www.w3.org/2000/svg"`)).toBe(true);
    expect(svg).toContain("<title>catches: 42</title>");
    expect(svg.endsWith("</svg>")).toBe(true);
  });

  it("renders n/a when the count is null (storage unavailable)", () => {
    const svg = renderCatchesBadge(null);
    expect(svg).toContain("<title>catches: n/a</title>");
  });

  it("widens the badge for larger numbers", () => {
    const small = renderCatchesBadge(9);
    const big = renderCatchesBadge(123456);
    const w = (s: string) => Number(/width="(\d+)"/.exec(s)![1]);
    expect(w(big)).toBeGreaterThan(w(small));
  });

  it("keeps label text navy-on-ink and value ink-on-navy halves aligned", () => {
    const svg = renderCatchesBadge(7);
    // two rects: label half and value half, equal heights
    const rects = [...svg.matchAll(/<rect [^>]*height="20"[^>]*>/g)];
    expect(rects.length).toBeGreaterThanOrEqual(3); // label, value, gradient
    expect(svg).toContain('fill="#0b1220"'); // navy label half
    expect(svg).toContain('fill="#fbbf24"'); // amber value half
  });
});

describe("GET /badge/catches.svg (endpoint)", () => {
  it("serves image/svg+xml with 60s cache and the live count", async () => {
    const db = new FakeD1();
    db.on(/COUNT\(\*\) AS total/, [{ total: 2 }]);
    env = makeEnv(db);
    const res = await call("/badge/catches.svg");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("image/svg+xml");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=60");
    const body = await res.text();
    expect(body).toContain("catches: 2");
  });

  it("shows 0 on an empty table, not n/a", async () => {
    const db = new FakeD1();
    db.on(/COUNT\(\*\) AS total/, [{ total: 0 }]);
    env = makeEnv(db);
    const res = await call("/badge/catches.svg");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("catches: 0");
  });

  it("never 502s — D1 trouble renders the n/a badge with 200", async () => {
    const broken = new FakeD1();
    broken.prepare = () => {
      throw new Error("d1 down");
    };
    env = makeEnv(broken);
    const res = await call("/badge/catches.svg");
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("catches: n/a");
  });
});

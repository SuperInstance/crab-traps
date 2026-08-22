// Dial dashboard tests — the reading → ledger → display loop's display half.
// Pure shaping (parseReading, buildCards) plus endpoint behavior through
// worker.fetch with the FakeD1 double, the same posture as edge-ledger.test.ts.

import { describe, it, expect, beforeEach } from "vitest";
import worker from "./index";
import { FakeD1 } from "./test-doubles";
import { canonicalJson, edgeHash } from "./edge-ledger";
import { parseReading, buildCards, verifyWindow } from "./dials";
import type { Env } from "./index-helpers";

let db: FakeD1;
let env: Env;

function makeEnv(): Env {
  return { DB: db as unknown as D1Database };
}

function call(path: string): Promise<Response> {
  return worker.fetch(new Request(`http://localhost:8787${path}`), env, {} as ExecutionContext);
}

const READING = (warmth: number) => ({
  room: "sauna",
  warmth,
  kappa: 1.234,
  dials: {
    mood: 0.62,
    volume: 0.41,
    earnestness: 0.77,
    cynicism: 0.12,
    joke_landing: -0.2,
    panic: 0.03,
    presence: 0.88,
  },
  messages: 7,
  ts: 1_000.0,
});

async function fieldRow(over: Record<string, unknown> = {}) {
  const after = READING(0.1);
  const base = {
    v: 1,
    cell: "room.field.sauna",
    ts: 1_000,
    before: null,
    after,
    delta: { before: null, after: 0.1, changed: false, magnitude: null },
    imbalance: null,
    provenance: { origin: "push", caller: "elephant-roomd", trace: ["room_field"] },
  };
  const hash = await edgeHash(base as any);
  return {
    v: base.v,
    cell: base.cell,
    ts: base.ts,
    before: canonicalJson(base.before),
    after: canonicalJson(base.after),
    delta: canonicalJson(base.delta),
    imbalance: base.imbalance,
    provenance: canonicalJson(base.provenance),
    chain: null,
    edge_hash: hash,
    received_at: "2026-08-21T00:00:00.000Z",
    ...over,
  };
}

beforeEach(() => {
  db = new FakeD1();
  env = makeEnv();
});

// ── parseReading ─────────────────────────────────────────────────────────────

describe("parseReading", () => {
  it("parses an elephant field read with all seven dials", () => {
    const r = parseReading(READING(0.1));
    expect(r).not.toBeNull();
    expect(r!.room).toBe("sauna");
    expect(r!.warmth).toBe(0.1);
    expect(r!.kappa).toBe(1.234);
    expect(Object.keys(r!.dials)).toHaveLength(7);
    expect(r!.messages).toBe(7);
  });

  it("rejects non-field payloads (bare bilge numbers are not dials)", () => {
    expect(parseReading(85)).toBeNull();
    expect(parseReading({ warm: 3 })).toBeNull();
    expect(parseReading(null)).toBeNull();
  });
});

// ── buildCards ───────────────────────────────────────────────────────────────

describe("buildCards", () => {
  it("groups per cell newest-first, scores drift from the imbalance series", async () => {
    const rows = [
      await fieldRow({ ts: 3_000, imbalance: 0.05 }),
      await fieldRow({ ts: 2_000, imbalance: 0.15 }),
      await fieldRow({ ts: 1_000, imbalance: null }),
    ];
    const { cards, otherCells } = buildCards(rows);
    expect(cards).toHaveLength(1);
    expect(otherCells).toBe(0);
    const c = cards[0];
    expect(c.cell).toBe("room.field.sauna");
    expect(c.edges).toBe(3);
    expect(c.meanImbalance).toBeCloseTo(0.1, 6); // unscored genesis excluded — never faked
    expect(c.warmths).toHaveLength(3);
    expect(c.head).toMatch(/^[0-9a-f]{64}$/);
  });

  it("keeps non-field cells out of the dial cards", async () => {
    const bilgeRow = {
      v: 1,
      cell: "bilge.level",
      ts: 1_500,
      before: "40",
      after: "85",
      delta: `{"after":85,"before":40,"changed":true,"magnitude":45}`,
      imbalance: 45,
      provenance: `{"caller":"bilge.adapter","origin":"push","trace":[]}`,
      chain: null,
      edge_hash: "a".repeat(64),
      received_at: "2026-08-21T00:00:00.000Z",
    };
    const { cards, otherCells } = buildCards([await fieldRow(), bilgeRow]);
    expect(cards).toHaveLength(2);
    expect(cards.find((c) => c.cell === "room.field.sauna")!.reading).not.toBeNull();
    expect(cards.find((c) => c.cell === "bilge.level")!.reading).toBeNull();
    expect(otherCells).toBe(1);
  });
});

// ── verifyWindow ─────────────────────────────────────────────────────────────

describe("verifyWindow", () => {
  it("accepts an intact window and catches tampering", async () => {
    const genesis: any = {
      v: 1,
      cell: "room.field.sauna",
      ts: 1_000,
      before: null,
      after: READING(0.1),
      delta: { before: null, after: 0.1, changed: false, magnitude: null },
      imbalance: null,
      provenance: { origin: "push", caller: "elephant-roomd", trace: ["room_field"] },
    };
    const gHash = await edgeHash(genesis);
    const next: any = {
      ...genesis,
      ts: 2_000,
      before: READING(0.1),
      after: READING(0.4),
      delta: { before: 0.1, after: 0.4, changed: true, magnitude: 0.3 },
      imbalance: 0.3,
    };
    const nHash = await edgeHash(next);
    const asRow = (e: any, chain: string | null, hash: string) => ({
      v: e.v,
      cell: e.cell,
      ts: e.ts,
      before: canonicalJson(e.before),
      after: canonicalJson(e.after),
      delta: canonicalJson(e.delta),
      imbalance: e.imbalance,
      provenance: canonicalJson(e.provenance),
      chain,
      edge_hash: hash,
      received_at: "2026-08-21T00:00:00.000Z",
    });
    const window = [asRow(next, gHash, nHash), asRow(genesis, null, gHash)]; // newest-first
    expect(await verifyWindow(window)).toBe(true);
    // Warmth edited after the fact → seal mismatch → broken badge.
    const tampered = asRow(genesis, null, gHash);
    tampered.after = canonicalJson(READING(0.9));
    expect(await verifyWindow([asRow(next, gHash, nHash), tampered])).toBe(false);
  });
});

// ── GET /dials ───────────────────────────────────────────────────────────────

describe("GET /dials", () => {
  it("renders the seven dials, warmth, kappa and drift from the ledger", async () => {
    const row = await fieldRow();
    db.on(/FROM ledger_edges WHERE cell LIKE/, [row]);
    const res = await call("/dials");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(res.headers.get("content-type")).toContain("text/html");
    for (const dial of ["mood", "volume", "earnestness", "cynicism", "joke_landing", "panic", "presence"]) {
      expect(html).toContain(`>${dial}<`);
    }
    expect(html).toContain("warmth");
    expect(html).toContain("κ");
    expect(html).toContain("drift");
    expect(html).toContain("chain intact");
    expect(html).toContain("sauna");
  });

  it("shows the empty state with the POST /edge contract when no elephant edges exist", async () => {
    db.on(/FROM ledger_edges WHERE cell LIKE/, []);
    const html = await (await call("/dials")).text();
    expect(html).toContain("No elephant edges yet");
    expect(html).toContain("demo_dial_loop.sh");
  });

  it("degrades (never 502) when D1 is down", async () => {
    db.failNext = true;
    const res = await call("/dials");
    expect(res.status).toBe(200);
    expect((await res.text()).includes("ledger storage unavailable")).toBe(true);
  });

  it("marks the badge broken when a stored edge was tampered with", async () => {
    const row = await fieldRow();
    row.after = canonicalJson(READING(0.99)); // edited after the fact
    db.on(/FROM ledger_edges WHERE cell LIKE/, [row]);
    const html = await (await call("/dials")).text();
    expect(html).toContain("chain broken");
  });

  it("rejects non-GET methods", async () => {
    expect(
      (await worker.fetch(new Request("http://localhost:8787/dials", { method: "POST" }), env, {} as ExecutionContext)).status
    ).toBe(405);
  });
});

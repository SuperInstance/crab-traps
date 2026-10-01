// Vector nerve tests — P3 (REEF-DESIGN §3): catch embeddings, room centroids,
// semantic /search, discovered edges, and clean degradation without the
// binding. FakeVectorize answers queries by real cosine, so "nearest" here
// means nearest. Same FakeD1 harness as endpoints.test.ts.

import { describe, it, expect, beforeEach } from "vitest";
import worker from "./index";
import { FakeD1, FakeVectorize } from "./test-doubles";
import { generateEmbedding, hashFeature, EMBEDDING_DIM } from "./index-helpers";
import { catchText, meanVector, embedCatch, updateRoomCentroid } from "./vectors";
import { ROOM_MINT_N, OBJECT_MINT_N } from "./mint";
import type { Env } from "./index-helpers";

let db: FakeD1;
let vectors: FakeVectorize;
let env: Env;

function makeEnv(withNerves: boolean): Env {
  return {
    ...(withNerves ? { VECTORIZE_INDEX: vectors as unknown as Vectorize } : {}),
    DB: db as unknown as D1Database,
    FLEET_BASE_URL: "http://<BOAT_IP>:4042",
  };
}

function call(path: string, init: RequestInit = {}): Promise<Response> {
  return worker.fetch(new Request(`http://localhost:8787${path}`, init), env, {} as ExecutionContext);
}

async function json(res: Response): Promise<any> {
  return JSON.parse(await res.text());
}

function post(body: unknown): Promise<Response> {
  return call("/catches", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  db = new FakeD1();
  vectors = new FakeVectorize();
  env = makeEnv(true);
});

// ── Hash parity with scripts/vectorize-lures.py ─────────────────────────────

describe("hashFeature (script parity)", () => {
  it("uses the script's unsigned 32-bit semantics (h &= 0xFFFFFFFF; h % dim)", () => {
    // Values computed with the Python script's hash_feature — tokens whose
    // FNV hash has the high bit set are exactly where signed % drifted.
    expect(hashFeature("lighthouse", EMBEDDING_DIM)).toBe(74);
    expect(hashFeature("signal", EMBEDDING_DIM)).toBe(296);
    expect(hashFeature("corridor", EMBEDDING_DIM)).toBe(106);
    expect(hashFeature("lantern", EMBEDDING_DIM)).toBe(134);
    expect(hashFeature("murmur", EMBEDDING_DIM)).toBe(320);
  });

  it("stays within [0, dim) across a battery of reef words", () => {
    for (const w of ["the", "radar", "gully", "crab", "reef", "ocean", "kelp", "harbor", "anchor", "tidepool", "bioluminescent"]) {
      const h = hashFeature(w, EMBEDDING_DIM);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(EMBEDDING_DIM);
      expect(Number.isInteger(h)).toBe(true);
    }
  });
});

// ── Pure nerve helpers ──────────────────────────────────────────────────────

describe("catchText", () => {
  it("prefers the answer, then the job, then the raw payload", () => {
    expect(catchText({ answer: "radar static", job: "survey", payload: "{\"x\":1}" })).toBe("radar static");
    expect(catchText({ answer: null, job: "survey", payload: "raw" })).toBe("survey");
    expect(catchText({ answer: "", job: "survey", payload: "raw" })).toBe("survey");
    expect(catchText({ answer: null, job: null, payload: "raw" })).toBe("raw");
    expect(catchText({ answer: null, job: null, payload: null })).toBe("");
  });
});

describe("meanVector", () => {
  it("returns the L2-normalized mean of its inputs (the centroid)", () => {
    const a = generateEmbedding("radar static gully");
    const b = generateEmbedding("kelp forest canopy");
    const centroid = meanVector([a, b])!;
    expect(centroid).toHaveLength(EMBEDDING_DIM);
    const mag = Math.sqrt(centroid.reduce((s, v) => s + v * v, 0));
    expect(mag).toBeCloseTo(1.0, 6);
    // the mean really is the midpoint: same distance to both parents
    const dot = (x: number[], y: number[]) => x.reduce((s, v, i) => s + v * y[i], 0);
    expect(dot(centroid, a)).toBeCloseTo(dot(centroid, b), 6);
  });

  it("is null when there is nothing to mean", () => {
    expect(meanVector([])).toBeNull();
    expect(meanVector([new Array(EMBEDDING_DIM).fill(0)])).toBeNull();
  });
});

// ── POST /catches → catch embeddings ────────────────────────────────────────

describe("POST /catches catch embeddings", () => {
  it("embeds the catch as catch-<id> with {agent, lure, room} metadata and links embedding_id", async () => {
    db.on(/SELECT id FROM rooms WHERE id = \?/, (b) => (b[0] === 1 ? [{ id: 1 }] : []));
    const res = await post({ agent: "ada", lure_id: "creative/dream-a-room", room: 1, answer: "radar static hums in the gully" });
    expect(res.status).toBe(201);

    const stored = vectors.vectors.find((v) => v.id === "catch-1");
    expect(stored).toBeDefined();
    expect(stored!.values).toEqual(generateEmbedding("radar static hums in the gully"));
    expect(stored!.metadata).toEqual({ agent: "ada", lure: "creative/dream-a-room", room: 1 });

    const link = db.statements.find((s) => /UPDATE catches SET embedding_id/.test(s.sql));
    expect(link).toBeDefined();
    expect(link!.bindings).toEqual(["catch-1", 1]);
  });

  it("falls back to the raw payload text when the player said nothing", async () => {
    db.on(/SELECT id FROM rooms WHERE id = \?/, (b) => (b[0] === 1 ? [{ id: 1 }] : []));
    const body = { agent: "quiet-crab", room: 1 };
    const res = await post(body);
    expect(res.status).toBe(201);
    const stored = vectors.vectors.find((v) => v.id === "catch-1");
    expect(stored).toBeDefined();
    expect(stored!.values).toEqual(generateEmbedding(JSON.stringify(body)));
  });

  it("no-ops without a word to embed (nothing semantic to store)", async () => {
    expect(await embedCatch(env, env.DB as unknown as D1Database, { id: 9, agent: "a", lure: null, room: 1, text: "" })).toBe(false);
    expect(vectors.vectors).toHaveLength(0);
  });
});

// ── Mint paths → room centroids ─────────────────────────────────────────────

describe("mint-path room centroids", () => {
  const ROOM_1_CATCHES = [
    { id: 1, answer: "radar static hums in the gully", job: null, payload: null },
    { id: 2, answer: "the gully flickers with radar", job: null, payload: null },
    { id: 3, answer: "radar echoes fade seaward", job: null, payload: null },
  ];

  function stubRoom(id: number, name: string, createdFrom: number | null) {
    db.on(/SELECT id FROM rooms WHERE id = \?/, (b) => (b[0] === 1 || b[0] === id ? [{ id: b[0] }] : []));
    db.on(
      /SELECT id, name, created_from_catch FROM rooms WHERE id = \?/,
      (b) => (b[0] === id ? [{ id, name, created_from_catch: createdFrom }] : [])
    );
    db.on(
      /SELECT id, answer, job, payload FROM catches WHERE room = \? OR id = \? ORDER BY id DESC LIMIT 100/,
      (b) => (b[0] === 1 ? ROOM_1_CATCHES : createdFrom && b[1] === createdFrom ? ROOM_1_CATCHES.filter((c) => c.id === createdFrom) : [])
    );
  }

  it("on the 5th catch: upserts room-<id> as the normalized mean of the room's catch vectors", async () => {
    stubRoom(1, "The Dock", null);
    db.on(/SELECT COUNT\(\*\) AS n FROM catches WHERE room = \?/, [{ n: OBJECT_MINT_N }]);
    db.on(/SELECT id, answer, job, payload FROM catches WHERE room = \? ORDER BY id DESC LIMIT 50/, ROOM_1_CATCHES);

    const res = await post({ agent: "ada", room: 1, answer: "another radar ping" });
    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.minted_detail.kind).toBe("object");

    const room = vectors.vectors.find((v) => v.id === "room-1");
    expect(room).toBeDefined();
    expect(room!.metadata).toEqual({ name: "The Dock" });
    expect(room!.values).toEqual(
      meanVector(ROOM_1_CATCHES.map((c) => generateEmbedding(catchText(c))))!
    );
    expect(body.discovered_edges).toEqual([]);
  });

  it("on the 12th catch: the new room's centroid is its founding catch, then neighbors are discovered", async () => {
    stubRoom(9, "Radar Gully", 1); // the room the mint creates
    db.on(/SELECT COUNT\(\*\) AS n FROM catches WHERE room = \?/, [{ n: ROOM_MINT_N }]);
    db.on(/SELECT id, answer, job, payload FROM catches WHERE room = \? ORDER BY id DESC LIMIT 50/, ROOM_1_CATCHES);
    db.on(/SELECT id FROM rooms WHERE created_from_catch = \?/, [{ id: 9 }]);
    db.on(
      /SELECT id, name, description, x, y, created_from_catch, created_at FROM rooms WHERE id = \?/,
      [{ id: 9, name: "Radar Gully", description: "radar echoes fade seaward", x: null, y: null, created_from_catch: 1, created_at: "t" }]
    );
    // No existing edges anywhere.
    db.on(/SELECT 1 AS found FROM edges WHERE \(from_room = \? AND to_room = \?\) OR \(from_room = \? AND to_room = \?\)/, []);

    // Vectorize already knows two rooms: one semantically near the founding
    // catch, one far — and a catch vector that is even nearer (and must be
    // ignored: catches are not topology).
    await vectors.upsert([
      { id: "room-2", values: generateEmbedding("radar static over the kelp"), metadata: { name: "Kelp Shelf" } },
      { id: "room-3", values: generateEmbedding("bioluminescent lantern tide pool"), metadata: { name: "Lantern Pool" } },
    ]);

    const res = await post({ agent: "ada", room: 1, answer: "radar static hums in the gully" });
    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.minted_detail).toMatchObject({ kind: "room", id: 9, name: "Radar Gully" });

    // Centroid of the fresh room = its founding catch's vector.
    const room = vectors.vectors.find((v) => v.id === "room-9");
    expect(room).toBeDefined();
    expect(room!.values).toEqual(generateEmbedding("radar static hums in the gully"));
    expect(room!.metadata).toEqual({ name: "Radar Gully" });

    // Discovery: Vectorize proposed the near rooms (nearest first); D1
    // formalized the edges. Self (room-9) and the nearer catch-1 vector were
    // excluded — catches are not topology.
    expect(body.discovered_edges).toEqual([
      { to_room: 2, name: "Kelp Shelf" },
      { to_room: 3, name: "Lantern Pool" },
    ]);
    const discovered = db.statements.filter((s) => /kind\) VALUES \(\?, \?, 0, 'discovered'\)/.test(s.sql));
    expect(discovered.map((s) => s.bindings)).toEqual([[9, 2], [9, 3]]);
  });

  it("discovery skips neighbors that already have an edge (either direction)", async () => {
    stubRoom(9, "Radar Gully", 1);
    db.on(/SELECT COUNT\(\*\) AS n FROM catches WHERE room = \?/, [{ n: ROOM_MINT_N }]);
    db.on(/SELECT id, answer, job, payload FROM catches WHERE room = \? ORDER BY id DESC LIMIT 50/, ROOM_1_CATCHES);
    db.on(/SELECT id FROM rooms WHERE created_from_catch = \?/, [{ id: 9 }]);
    db.on(
      /SELECT id, name, description, x, y, created_from_catch, created_at FROM rooms WHERE id = \?/,
      [{ id: 9, name: "Radar Gully", description: null, x: null, y: null, created_from_catch: 1, created_at: "t" }]
    );
    db.on(
      /SELECT 1 AS found FROM edges WHERE \(from_room = \? AND to_room = \?\) OR \(from_room = \? AND to_room = \?\)/,
      (b) => (b[0] === 9 && b[1] === 2 ? [{ found: 1 }] : [])
    );
    await vectors.upsert([
      { id: "room-2", values: generateEmbedding("radar static over the kelp"), metadata: { name: "Kelp Shelf" } },
    ]);

    const body = await json(await post({ agent: "ada", room: 1, answer: "radar static hums in the gully" }));
    expect(body.discovered_edges).toEqual([]);
    expect(db.statements.filter((s) => /'discovered'/.test(s.sql))).toHaveLength(0);
  });
});

// ── GET /rooms/:id/vector ───────────────────────────────────────────────────

describe("GET /rooms/:id/vector", () => {
  const catches = [{ id: 1, answer: "radar static", job: null, payload: null }];

  beforeEach(() => {
    db.on(
      /SELECT id, name, created_from_catch FROM rooms WHERE id = \?/,
      (b) => (b[0] === 2 ? [{ id: 2, name: "Radar Gully", created_from_catch: 1 }] : b[0] === 4 ? [{ id: 4, name: "Silent Hollow", created_from_catch: null }] : [])
    );
    db.on(
      /SELECT id, answer, job, payload FROM catches WHERE room = \? OR id = \? ORDER BY id DESC LIMIT 100/,
      (b) => (b[0] === 2 ? catches : [])
    );
  });

  it("recomputes and returns the room's centroid (and upserts room-<id>)", async () => {
    const res = await call("/rooms/2/vector");
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.success).toBe(true);
    expect(body.vector_id).toBe("room-2");
    expect(body.name).toBe("Radar Gully");
    expect(body.dims).toBe(EMBEDDING_DIM);
    // same code path (mean of one unit vector) → bit-exact comparison
    expect(body.vector).toEqual(meanVector([generateEmbedding("radar static")])!);
    expect(vectors.vectors.find((v) => v.id === "room-2")).toBeDefined();
  });

  it("reports a silent room honestly (vector: null, no upsert)", async () => {
    const res = await call("/rooms/4/vector");
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.success).toBe(true);
    expect(body.vector).toBeNull();
    expect(vectors.vectors).toHaveLength(0);
  });

  it("404s unknown and non-numeric rooms, 405s non-GET", async () => {
    expect((await call("/rooms/99/vector")).status).toBe(404);
    expect((await call("/rooms/not-a-room/vector")).status).toBe(404);
    expect((await call("/rooms/2/vector", { method: "POST" })).status).toBe(405);
  });

  it("503s honestly when vectorize is off", async () => {
    env = makeEnv(false);
    const res = await call("/rooms/2/vector");
    expect(res.status).toBe(503);
    expect((await json(res)).error).toContain("vectorize is off");
  });
});

// ── GET /search ─────────────────────────────────────────────────────────────

describe("GET /search", () => {
  beforeEach(async () => {
    await vectors.upsert([
      { id: "catch-7", values: generateEmbedding("radar static hums in the gully"), metadata: { agent: "ada", lure: "", room: 1 } },
      { id: "catch-8", values: generateEmbedding("a bioluminescent tide pool glows"), metadata: { agent: "bo", lure: "", room: 2 } },
      { id: "lure:creative/dream-a-room", values: generateEmbedding("radar radar radar static"), metadata: {} },
    ]);
    db.on(
      /FROM catches c LEFT JOIN rooms r ON r\.id = c\.room/,
      (b) =>
        b[0] === 7
          ? [{ id: 7, agent: "ada", answer: "radar static hums in the gully", room: 1, room_name: "The Dock" }]
          : b[0] === 8
            ? [{ id: 8, agent: "bo", answer: "a bioluminescent tide pool glows", room: 2, room_name: "Lantern Pool" }]
            : []
    );
  });

  it("finds catches by meaning, with room names and snippets joined from D1", async () => {
    const res = await call("/search?q=radar+static");
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.success).toBe(true);
    expect(body.count).toBeGreaterThan(0);
    expect(body.count).toBeLessThanOrEqual(8);
    expect(body.hits[0].catch_id).toBe(7);
    expect(body.hits[0].room_name).toBe("The Dock");
    expect(body.hits[0].snippet).toContain("radar");
    // the lure vector is NOT a catch hit, whatever its score
    expect(body.hits.every((h: any) => Number.isInteger(h.catch_id))).toBe(true);
  });

  it("bounds snippets to 240 chars", async () => {
    const long = "radar " + "x".repeat(500);
    await vectors.upsert([{ id: "catch-9", values: generateEmbedding(long), metadata: {} }]);
    db.on(
      /FROM catches c LEFT JOIN rooms r ON r\.id = c\.room/,
      (b) => (b[0] === 9 ? [{ id: 9, agent: "ada", answer: long, room: 1, room_name: "The Dock" }] : [])
    );
    const body = await json(await call("/search?q=radar"));
    const hit = body.hits.find((h: any) => h.catch_id === 9);
    expect(hit.snippet.length).toBe(240);
  });

  it("returns an empty result set when the index has no catches", async () => {
    vectors.vectors = [];
    const body = await json(await call("/search?q=anything"));
    expect(body.success).toBe(true);
    expect(body.count).toBe(0);
    expect(body.hits).toEqual([]);
  });

  it("400s without q, 405s non-GET", async () => {
    expect((await call("/search")).status).toBe(400);
    expect((await call("/search?q=", { method: "POST" })).status).toBe(405);
  });

  it("503s honestly when vectorize is off", async () => {
    env = makeEnv(false);
    const res = await call("/search?q=radar");
    expect(res.status).toBe(503);
    expect((await json(res)).error).toContain("vectorize is off");
  });
});

// ── Degradation + health ────────────────────────────────────────────────────

describe("graceful degradation (no VECTORIZE_INDEX binding)", () => {
  beforeEach(() => {
    env = makeEnv(false);
  });

  it("catches still record and mint — zero vector traffic, zero nerve queries", async () => {
    db.on(/SELECT id FROM rooms WHERE id = \?/, (b) => (b[0] === 1 ? [{ id: 1 }] : []));
    db.on(/SELECT COUNT\(\*\) AS n FROM catches WHERE room = \?/, [{ n: OBJECT_MINT_N }]);
    db.on(/SELECT id, answer, job, payload FROM catches WHERE room = \? ORDER BY id DESC LIMIT 50/, [
      { id: 1, answer: "radar static", job: null, payload: null },
    ]);
    const res = await post({ agent: "ada", room: 1, answer: "radar static" });
    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.recorded).toBe(true);
    expect(body.minted_detail.kind).toBe("object");
    expect(body.discovered_edges).toEqual([]);

    expect(vectors.vectors).toHaveLength(0);
    expect(vectors.queries).toHaveLength(0);
    expect(db.statements.find((s) => /UPDATE catches SET embedding_id/.test(s.sql))).toBeUndefined();
    expect(db.statements.find((s) => /OR id = \? ORDER BY id DESC LIMIT 100/.test(s.sql))).toBeUndefined();
  });

  it("/health flags vectorize: off; on when the binding answers", async () => {
    expect((await json(await call("/health"))).vectorize).toBe("off");
    env = makeEnv(true);
    expect((await json(await call("/health"))).vectorize).toBe("on");
  });

  it("the API directory lists the nerve endpoints", async () => {
    const body = await json(await call("/api"));
    expect(body.api["GET /search?q=..."]).toBeDefined();
    expect(body.api["GET /rooms/:id/vector"]).toBeDefined();
  });
});

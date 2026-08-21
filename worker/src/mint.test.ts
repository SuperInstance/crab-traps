// Minting tests — the extraction heuristics (pure) and the Nth-catch
// thresholds through POST /catches (same FakeD1 harness as endpoints).

import { describe, it, expect, beforeEach } from "vitest";
import worker from "./index";
import { FakeD1 } from "./test-doubles";
import {
  extractNouns,
  keywordCounts,
  objectName,
  roomName,
  bestFragment,
  mintWorld,
  OBJECT_MINT_N,
  ROOM_MINT_N,
} from "./mint";
import type { Env } from "./index-helpers";

let db: FakeD1;
let env: Env;

function makeEnv(): Env {
  // No VECTORIZE_INDEX — local dev shape: minting works without the nerves.
  return {
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

// ── Extraction heuristics (pure) ─────────────────────────────────────────────

describe("extractNouns", () => {
  it("counts capitalized non-stopword words across texts", () => {
    const nouns = extractNouns([
      "The Radar pings near the old Radar mast",
      "Radar static everywhere",
    ]);
    expect(nouns[0]).toEqual({ word: "radar", count: 3 });
  });

  it("skips stopwords even when capitalized", () => {
    const nouns = extractNouns(["The Dock is quiet. It was The same yesterday."]);
    const words = nouns.map((n) => n.word);
    expect(words).not.toContain("the");
    expect(words).not.toContain("it");
    expect(words).not.toContain("was");
    expect(words).toContain("dock");
  });

  it("breaks ties by first appearance (deterministic minting)", () => {
    const nouns = extractNouns(["Zebra and Apple"]);
    expect(nouns.map((n) => n.word)).toEqual(["zebra", "apple"]);
  });

  it("returns empty for texts with no capitalized words", () => {
    expect(extractNouns(["just lowercase words here"])).toEqual([]);
    expect(extractNouns([""])).toEqual([]);
  });
});

describe("keywordCounts", () => {
  it("uses the tokenizer and skips stopwords", () => {
    const kws = keywordCounts(["the gully hums with radar static", "the gully sleeps"]);
    expect(kws[0]).toEqual({ word: "gully", count: 2 });
    expect(kws.map((k) => k.word)).not.toContain("the");
    expect(kws.map((k) => k.word)).not.toContain("with");
  });
});

describe("objectName", () => {
  it("prefers the top capitalized noun", () => {
    expect(objectName(["the Lighthouse blinks past the Radar"])).toBe("Lighthouse");
  });

  it("falls back to the top lowercase keyword, title-cased", () => {
    expect(objectName(["barnacles everywhere, barnacles on everything"])).toBe("Barnacles");
  });

  it("mints a Curio from silence", () => {
    expect(objectName([""])).toBe("Curio");
  });
});

describe("roomName", () => {
  it("joins the top two keywords, title-cased", () => {
    expect(roomName(["Radar pings in the gully", "Radar fades, the gully sleeps"])).toBe("Radar Gully");
  });

  it("is deterministic when the catches say nothing", () => {
    expect(roomName([""])).toBe("Uncharted Reef");
  });
});

describe("bestFragment", () => {
  it("picks the longest substantive answer", () => {
    expect(bestFragment(["short", null, "a much longer fragment about the reef", "mid"])).toBe(
      "a much longer fragment about the reef"
    );
  });

  it("returns null when nobody said anything", () => {
    expect(bestFragment([null, undefined, "   "])).toBeNull();
  });

  it("bounds fragments to 500 chars", () => {
    expect(bestFragment(["x".repeat(900)])?.length).toBe(500);
  });
});

// ── mintWorld thresholds ─────────────────────────────────────────────────────

describe("mintWorld", () => {
  beforeEach(() => {
    db = new FakeD1();
    env = makeEnv();
  });

  it("does nothing before the 5th catch", async () => {
    db.on(/SELECT COUNT\(\*\) AS n FROM catches WHERE room = \?/, [{ n: OBJECT_MINT_N - 1 }]);
    expect(await mintWorld(env.DB as unknown as D1Database, { catchId: 4, room: 1 })).toBeNull();
    expect(db.statements.filter((s) => /INSERT/.test(s.sql))).toHaveLength(0);
  });

  it("keys thresholds to the catch's ordinal (id <= catchId), not the room total", async () => {
    // A plain COUNT(*) races concurrent commits: two catches landing in a
    // 4-catch room can both be counted at once and the 5th-catch mint is
    // skipped forever. The ordinal is stable: catch 5 is always the 5th.
    const seen: unknown[][] = [];
    const fresh = new FakeD1();
    fresh.on(/SELECT COUNT\(\*\) AS n FROM catches WHERE room = \?/, (b) => {
      seen.push(b);
      return [{ n: b[1] as number }]; // ordinal == catchId in this stub
    });
    fresh.on(/SELECT id, answer, job, payload FROM catches WHERE room = \?/, [
      { id: 5, answer: "The Radar pings", job: null, payload: null },
    ]);
    expect(await mintWorld(fresh as unknown as D1Database, { catchId: 5, room: 1 })).toMatchObject({
      kind: "object",
      created_from_catch: 5,
    });
    // the concurrent 6th catch — same room, both committed before counting —
    // sees its own ordinal and must NOT mint a second brick
    expect(await mintWorld(fresh as unknown as D1Database, { catchId: 6, room: 1 })).toBeNull();
    expect(seen).toEqual([
      [1, 5],
      [1, 6],
    ]);
  });

  it("mints nothing on non-threshold counts (6..11)", async () => {
    for (const n of [6, 9, 11, 13, 24]) {
      const fresh = new FakeD1();
      fresh.on(/SELECT COUNT\(\*\) AS n FROM catches WHERE room = \?/, [{ n }]);
      expect(await mintWorld(fresh as unknown as D1Database, { catchId: 1, room: 1 })).toBeNull();
    }
  });

  it("the 13th catch through the endpoint mints nothing (exact thresholds only)", async () => {
    // Lock-in: the 12th-catch room spawn must not repeat on the 13th — n must
    // be EXACTLY 5 or 12, never >=.
    db.on(/SELECT id FROM rooms WHERE id = \?/, (b) => (b[0] === 1 ? [{ id: 1 }] : []));
    db.on(/SELECT COUNT\(\*\) AS n FROM catches WHERE room = \?/, (b) =>
      b[0] === 1 ? [{ n: 13 }] : [{ n: 0 }]
    );
    db.on(
      /SELECT id, answer, job, payload FROM catches WHERE room = \? ORDER BY id DESC LIMIT 50/,
      []
    );
    const body = await json(await post({ agent: "tom", room: 1, answer: "thirteenth" }));
    expect(body.minted).toBeNull();
    expect(
      db.statements.filter((s) => /INSERT OR IGNORE INTO (objects|rooms|edges)/.test(s.sql))
    ).toHaveLength(0);
  });

  it("concurrent 5th-catch race: exactly one object mint", async () => {
    // Two POSTs land in a 4-catch room. The ordinal (id <= catchId) is stable:
    // catch 12's count is 5 (mints), catch 13's count is 6 (skips) — even if
    // both committed before either counted. One brick, never two.
    const fresh = new FakeD1();
    fresh.on(/SELECT COUNT\(\*\) AS n FROM catches WHERE room = \?/, (b) => [{ n: b[1] as number }]);
    fresh.on(/SELECT id, answer, job, payload FROM catches WHERE room = \?/, []);
    const a = await mintWorld(fresh as unknown as D1Database, { catchId: 5, room: 1 });
    const b = await mintWorld(fresh as unknown as D1Database, { catchId: 6, room: 1 });
    expect(a).toMatchObject({ kind: "object", room_id: 1, created_from_catch: 5 });
    expect(b).toBeNull();
    expect(fresh.statements.filter((s) => /INSERT OR IGNORE INTO objects/.test(s.sql))).toHaveLength(1);
  });

  it("concurrent 12th-catch race: exactly one room and one edge", async () => {
    // Same race at the room threshold: catch 12 mints the neighbor room and its
    // parent edge; catch 13 skips. The provenance re-read (created_from_catch)
    // resolves the real id even if OR IGNORE swallowed a duplicate insert.
    const fresh = new FakeD1();
    fresh.on(/SELECT COUNT\(\*\) AS n FROM catches WHERE room = \?/, (b) => [{ n: b[1] as number }]);
    fresh.on(/SELECT id, answer, job, payload FROM catches WHERE room = \?/, []);
    fresh.on(/SELECT id FROM rooms WHERE created_from_catch = \?/, (b) =>
      b[0] === 12 ? [{ id: 9 }] : []
    );
    const a = await mintWorld(fresh as unknown as D1Database, { catchId: 12, room: 1 });
    const b = await mintWorld(fresh as unknown as D1Database, { catchId: 13, room: 1 });
    expect(a).toMatchObject({ kind: "room", id: 9, parent_room: 1, created_from_catch: 12 });
    expect(b).toBeNull();
    expect(fresh.statements.filter((s) => /INSERT OR IGNORE INTO rooms/.test(s.sql))).toHaveLength(1);
    expect(fresh.statements.filter((s) => /INSERT OR IGNORE INTO edges/.test(s.sql))).toHaveLength(1);
  });
});

// ── POST /catches → minting hot path ─────────────────────────────────────────

describe("POST /catches minting", () => {
  beforeEach(() => {
    db = new FakeD1();
    env = makeEnv();
  });

  function stubRoomCatches(n: number, recents: Record<string, unknown>[]) {
    db.on(/SELECT id FROM rooms WHERE id = \?/, (b) => (b[0] === 1 ? [{ id: 1 }] : []));
    db.on(
      /SELECT COUNT\(\*\) AS n FROM catches WHERE room = \?/,
      (b) => (b[0] === 1 ? [{ n }] : [{ n: 0 }])
    );
    db.on(
      /SELECT id, answer, job, payload FROM catches WHERE room = \? ORDER BY id DESC LIMIT 50/,
      recents
    );
  }

  it("on the 5th catch in a room: mints an object named from the payloads", async () => {
    stubRoomCatches(OBJECT_MINT_N, [
      { id: 5, answer: "The Radar pings near the old Radar mast", job: null, payload: null },
      { id: 4, answer: "Radar static everywhere", job: "survey", payload: null },
    ]);

    const res = await post({ agent: "tom", room: 1, answer: "another Radar ping" });
    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.room_id).toBe(1);
    expect(body.minted).toContain("object 'Radar'");
    expect(body.minted_detail).toMatchObject({
      kind: "object",
      room_id: 1,
      name: "Radar",
      created_from_catch: 1, // the catch that minted it — provenance
    });
    expect(body.minted_detail.lore).toBe("The Radar pings near the old Radar mast");

    const ins = db.statements.find((s) => /INSERT OR IGNORE INTO objects/.test(s.sql));
    expect(ins).toBeDefined();
    expect(ins!.bindings.slice(0, 4)).toEqual([
      1,
      "Radar",
      "minted",
      "The Radar pings near the old Radar mast",
    ]);
    expect(ins!.bindings[4]).toBe(1); // created_from_catch = the new catch id
  });

  it("on the 12th catch in a room: mints a NEIGHBOR room with an edge to the parent", async () => {
    stubRoomCatches(ROOM_MINT_N, [
      { id: 12, answer: "Radar pings in the gully", job: null, payload: null },
      { id: 11, answer: "Radar fades, the gully sleeps", job: null, payload: null },
    ]);
    db.on(/SELECT id FROM rooms WHERE created_from_catch = \?/, (b) =>
      b[0] === 1 ? [{ id: 9 }] : []
    );
    db.on(
      /SELECT id, name, description, x, y, created_from_catch, created_at FROM rooms WHERE id = \?/,
      (b) =>
        b[0] === 9
          ? [{ id: 9, name: "Radar Gully", description: "Radar fades, the gully sleeps", x: null, y: null, created_from_catch: 1, created_at: "t" }]
          : []
    );

    const res = await post({ agent: "tom", room: 1, answer: "the gully opens" });
    expect(res.status).toBe(201);
    const body = await json(res);
    expect(body.minted).toContain("room 'Radar Gully'");
    expect(body.minted_detail).toMatchObject({
      kind: "room",
      id: 9,
      name: "Radar Gully",
      description: "Radar fades, the gully sleeps",
      parent_room: 1,
      created_from_catch: 1,
    });
    expect(body.room.id).toBe(9); // the response carries the new room state

    const roomIns = db.statements.find((s) => /INSERT OR IGNORE INTO rooms/.test(s.sql));
    expect(roomIns!.bindings).toEqual([
      "Radar Gully",
      "Radar fades, the gully sleeps",
      1, // provenance catch id
    ]);
    const edgeIns = db.statements.find((s) => /INSERT OR IGNORE INTO edges/.test(s.sql));
    expect(edgeIns).toBeDefined();
    expect(edgeIns!.bindings).toEqual([1, 9]); // parent → child
  });

  it("does not mint on ordinary catches", async () => {
    stubRoomCatches(4, []);
    const body = await json(await post({ agent: "tom", room: 1, answer: "nothing special" }));
    expect(body.minted).toBeNull();
    expect(body.minted_detail).toBeNull();
    expect(db.statements.filter((s) => /INSERT OR IGNORE INTO (objects|rooms|edges)/.test(s.sql))).toHaveLength(0);
  });

  it("resolves room names to ids for provenance", async () => {
    db.on(/SELECT id FROM rooms WHERE lower\(name\) = lower\(\?\)/, (b) =>
      typeof b[0] === "string" && b[0].toLowerCase() === "the dock" ? [{ id: 1 }] : []
    );
    stubRoomCatches(3, []);

    const body = await json(await post({ agent: "tom", room: "The Dock", answer: "x" }));
    expect(body.room_id).toBe(1);
    const ins = db.statements.find((s) => /INSERT INTO catches/.test(s.sql));
    expect(ins).toBeDefined();
    expect(ins!.bindings[7]).toBe(1); // born with its room — no backfill race
    expect(db.statements.find((s) => /UPDATE catches SET room/.test(s.sql))).toBeUndefined();
    const count = db.statements.find((s) => /SELECT COUNT\(\*\) AS n FROM catches WHERE room/.test(s.sql));
    expect(count).toBeDefined();
    expect(count!.bindings).toEqual([1, body.id]); // room, then the catch's ordinal anchor
  });

  it("a catch with no room lands where the agent stands (seed default)", async () => {
    db.on(/SELECT room_id FROM agents WHERE agent = \?/, (b) =>
      b[0] === "tom" ? [{ room_id: 2 }] : []
    );
    stubRoomCatches(4, []);

    const body = await json(await post({ agent: "tom", answer: "drifting" }));
    expect(body.room_id).toBe(2);
    const ins = db.statements.find((s) => /INSERT INTO catches/.test(s.sql));
    expect(ins!.bindings[7]).toBe(2); // born where the agent stands
    expect(db.statements.find((s) => /UPDATE catches SET room/.test(s.sql))).toBeUndefined();
  });

  it("keeps the catch safe when minting storage fails", async () => {
    db.failOn(/SELECT COUNT\(\*\) AS n FROM catches WHERE room/, "no such table: catches");
    const res = await post({ agent: "tom", room: 1, answer: "boom" });
    expect(res.status).toBe(201); // the catch never fails for the reef
    const body = await json(res);
    expect(body.recorded).toBe(true);
    expect(body.minted).toBeNull();
  });

  it("POST /catch (design's canonical path) is an alias", async () => {
    const res = await call("/catch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agent: "tom", answer: "via alias" }),
    });
    expect(res.status).toBe(201);
    expect((await json(res)).recorded).toBe(true);
  });

  it("an unknown numeric room falls back to the agent's room (no ghost topology)", async () => {
    db.on(/SELECT id FROM rooms WHERE id = \?/, (b) => (b[0] === 999 ? [] : b[0] === 2 ? [{ id: 2 }] : []));
    db.on(/SELECT room_id FROM agents WHERE agent = \?/, (b) => (b[0] === "tom" ? [{ room_id: 2 }] : []));
    stubRoomCatches(0, []);

    const body = await json(await post({ agent: "tom", room: 999, answer: "nowhere" }));
    expect(body.success).toBe(true);
    expect(body.room_id).toBe(2);
    const ins = db.statements.find((s) => /INSERT INTO catches/.test(s.sql));
    expect(ins!.bindings[7]).toBe(2); // never recorded against room 999
  });

  it("rejects junk room values", async () => {
    const res = await post({ agent: "tom", room: 1.5 });
    expect(res.status).toBe(400);
    expect((await json(res)).error).toContain("room");
  });
});

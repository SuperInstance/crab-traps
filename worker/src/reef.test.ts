// Reef tests — the self-building world: /enter /look /go /interact /map
// /lineage/room/:id, and the Nth-catch minting thresholds on POST /catches.
// Same harness as endpoints.test.ts: worker.fetch with an in-memory D1 double.

import { describe, it, expect, beforeEach } from "vitest";
import worker from "./index";
import { FakeD1 } from "./test-doubles";
import { MAP_LIMIT, tintDescription, tintForWarmth } from "./reef";
import type { Env } from "./index-helpers";

let db: FakeD1;
let env: Env;

function makeEnv(): Env {
  // No VECTORIZE_INDEX — local dev shape: the reef builds on D1 alone.
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

const DOCK = {
  id: 1,
  name: "The Dock",
  description: "Weathered planks over still green water.",
  x: 0,
  y: 0,
  created_from_catch: null,
  created_at: "2026-08-18T00:00:00Z",
};
const GULLY = {
  id: 2,
  name: "Radar Gully",
  description: "A gully that hums.",
  x: null,
  y: null,
  created_from_catch: 12,
  created_at: "2026-08-18T01:00:00Z",
};
const THIRD = {
  id: 3,
  name: "Kelp Shelf",
  description: "A shelf of kelp.",
  x: null,
  y: null,
  created_from_catch: null,
  created_at: "2026-08-18T02:00:00Z",
};

/** Room-by-id canned rows that vary with the bound id. */
function stubRooms() {
  db.on(
    /SELECT id, name, description, x, y, created_from_catch, created_at FROM rooms WHERE id = \?/,
    (b) => (b[0] === 1 ? [DOCK] : b[0] === 2 ? [GULLY] : b[0] === 3 ? [THIRD] : [])
  );
}

/** The common world: agents ada→room 2, tom→room 1; seed room exists. */
function stubWorld() {
  stubRooms();
  db.on(/SELECT id FROM rooms WHERE id = 1/, [{ id: 1 }]);
  db.on(
    /SELECT id FROM rooms WHERE id = \?/,
    (b) => (b[0] === 1 ? [{ id: 1 }] : b[0] === 2 ? [{ id: 2 }] : b[0] === 3 ? [{ id: 3 }] : [])
  );
  db.on(
    /SELECT room_id FROM agents WHERE agent = \?/,
    (b) => (b[0] === "tom" ? [{ room_id: 1 }] : b[0] === "ada" ? [{ room_id: 2 }] : [])
  );
  db.on(
    /SELECT id, name, kind FROM objects WHERE room_id = \?/,
    (b) => (b[0] === 1 ? [{ id: 3, name: "Old Buoy", kind: "minted" }] : [])
  );
  db.on(
    /SELECT e\.to_room, r\.name, e\.traffic FROM edges e LEFT JOIN rooms r ON r\.id = e\.to_room WHERE e\.from_room = \?/,
    (b) => (b[0] === 1 ? [{ to_room: 2, name: "Radar Gully", traffic: 7 }] : [])
  );
}

beforeEach(() => {
  db = new FakeD1();
  env = makeEnv();
});

// ── GET /lineage/room/:id ────────────────────────────────────────────────────

describe("GET /lineage/room/:id", () => {
  it("returns the seed room genealogy: no minting catch, objects with theirs", async () => {
    stubRooms();
    db.on(
      /FROM objects o LEFT JOIN catches c ON c\.id = o\.created_from_catch/,
      [
        {
          id: 3,
          name: "Old Buoy",
          kind: "minted",
          lore: "It rings when the tide turns.",
          created_from_catch: 5,
          minted_by: "tom-crab",
          minted_answer: "found the buoy",
        },
      ]
    );
    db.on(/SELECT to_room, traffic FROM edges WHERE from_room = \?/, [{ to_room: 2, traffic: 7 }]);
    db.on(/SELECT from_room, traffic FROM edges WHERE to_room = \?/, []);

    const res = await call("/lineage/room/1");
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.success).toBe(true);
    expect(body.room.name).toBe("The Dock");
    expect(body.room.created_from_catch).toBeNull();
    expect(body.minted_from).toBeNull();
    expect(body.objects[0].name).toBe("Old Buoy");
    expect(body.objects[0].minted_by).toBe("tom-crab");
    expect(body.edges_out[0]).toEqual({ to_room: 2, traffic: 7 });
    expect(body.edges_in).toEqual([]);
  });

  it("resolves the minting catch for minted rooms (provenance!)", async () => {
    stubRooms();
    db.on(/FROM objects o LEFT JOIN catches/, []);
    db.on(/SELECT to_room, traffic FROM edges WHERE from_room = \?/, []);
    db.on(/SELECT from_room, traffic FROM edges WHERE to_room = \?/, [{ from_room: 1, traffic: 7 }]);
    db.on(/SELECT id, agent, job, answer, created_at FROM catches WHERE id = \?/, (b) =>
      b[0] === 12 ? [{ id: 12, agent: "ada", job: "reef-survey", answer: "the gully hums", created_at: "2026-08-18T00:59:00Z" }] : []
    );

    const body = await json(await call("/lineage/room/2"));
    expect(body.minted_from.id).toBe(12);
    expect(body.minted_from.agent).toBe("ada");
    expect(body.edges_in[0]).toEqual({ from_room: 1, traffic: 7 });
  });

  it("404s friendly on unknown rooms", async () => {
    stubRooms();
    const res = await call("/lineage/room/42");
    expect(res.status).toBe(404);
    const body = await json(res);
    expect(body.error).toBe("room not found");
    expect(body.hint).toContain("/map");
  });

  it("404s on non-numeric ids", async () => {
    const res = await call("/lineage/room/not-a-room");
    expect(res.status).toBe(404);
  });

  it("503s cleanly when D1 is down", async () => {
    db.failNext = true;
    const res = await call("/lineage/room/1");
    expect(res.status).toBe(503);
    expect((await json(res)).error).toContain("unavailable");
  });

  it("rejects non-GET methods", async () => {
    expect((await call("/lineage/room/1", { method: "POST" })).status).toBe(405);
  });
});

// ── GET /enter ───────────────────────────────────────────────────────────────

describe("GET /enter", () => {
  it("assigns the seed room and returns full state", async () => {
    stubWorld();
    const res = await call("/enter?agent=tom");
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.success).toBe(true);
    expect(body.agent).toBe("tom");
    expect(body.room.id).toBe(1);
    expect(body.room.name).toBe("The Dock");
    expect(body.room.description).toContain("Weathered planks");
    expect(body.room.objects[0].name).toBe("Old Buoy");
    expect(body.room.exits[0]).toEqual({ to_room: 2, name: "Radar Gully", traffic: 7 });

    // the agent's feet are remembered in D1
    const upsert = db.statements.find((s) => /INSERT INTO agents/.test(s.sql));
    expect(upsert).toBeDefined();
    expect(upsert!.bindings).toEqual(["tom", 1]);
  });

  it("falls back to a random room when the seed is gone", async () => {
    stubRooms();
    db.on(/SELECT id FROM rooms WHERE id = 1/, []);
    db.on(/SELECT id FROM rooms ORDER BY RANDOM\(\) LIMIT 1/, [{ id: 2 }]);
    const body = await json(await call("/enter?agent=latecomer"));
    expect(body.room.id).toBe(2);
  });

  it("503s honestly when the reef is empty (migrations not applied)", async () => {
    db.on(/SELECT id FROM rooms WHERE id = 1/, []);
    db.on(/SELECT id FROM rooms ORDER BY RANDOM\(\) LIMIT 1/, []);
    const res = await call("/enter?agent=tom");
    expect(res.status).toBe(503);
    expect((await json(res)).error).toContain("empty");
  });

  it("400s without an agent", async () => {
    expect((await call("/enter")).status).toBe(400);
    expect((await call("/enter?agent=%20%20")).status).toBe(400);
  });

  it("405s non-GET", async () => {
    expect((await call("/enter?agent=tom", { method: "POST" })).status).toBe(405);
  });

  it("503s cleanly when D1 is down", async () => {
    db.failNext = true;
    expect((await call("/enter?agent=tom")).status).toBe(503);
  });
});

// ── GET /look ────────────────────────────────────────────────────────────────

describe("GET /look", () => {
  it("returns the agent's current room with exits from real edges", async () => {
    stubWorld();
    const res = await call("/look?agent=tom");
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.room.id).toBe(1);
    expect(body.room.exits).toEqual([{ to_room: 2, name: "Radar Gully", traffic: 7 }]);
    expect(body.room.objects).toEqual([{ id: 3, name: "Old Buoy", kind: "minted" }]);
  });

  it("falls back to the seed room for agents who never entered", async () => {
    stubWorld();
    const body = await json(await call("/look?agent=stranger"));
    expect(body.room.id).toBe(1);
  });

  it("400s without an agent", async () => {
    expect((await call("/look")).status).toBe(400);
  });
});

// ── GET /go ──────────────────────────────────────────────────────────────────

describe("GET /go", () => {
  beforeEach(() => {
    stubWorld();
    db.on(
      /SELECT traffic FROM edges WHERE from_room = \? AND to_room = \?/,
      (b) => (b[0] === 1 && b[1] === 2 ? [{ traffic: 3 }] : [])
    );
  });

  it("traverses an edge, reinforces traffic, moves the agent", async () => {
    const res = await call("/go?agent=tom&to=2");
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.from).toBe(1);
    expect(body.room.id).toBe(2);
    expect(body.room.name).toBe("Radar Gully");

    const bump = db.statements.find((s) =>
      /INSERT INTO edges \(from_room, to_room, traffic\) VALUES \(\?, \?, 1\) ON CONFLICT\(from_room, to_room\) DO UPDATE SET traffic = traffic \+ 1/.test(s.sql)
    );
    expect(bump).toBeDefined();
    expect(bump!.bindings).toEqual([1, 2]);

    const move = db.statements.find((s) => /INSERT INTO agents/.test(s.sql));
    expect(move!.bindings).toEqual(["tom", 2]);
  });

  it("accepts a room name as the destination (front-door friendly)", async () => {
    db.on(
      /SELECT id FROM rooms WHERE lower\(name\) = lower\(\?\)/,
      (b) =>
        typeof b[0] === "string" && b[0].toLowerCase() === "radar gully" ? [{ id: 2 }] : []
    );
    const body = await json(await call("/go?agent=tom&to=Radar%20Gully"));
    expect(body.success).toBe(true);
    expect(body.room.id).toBe(2);
  });

  it("404s friendly on unknown rooms", async () => {
    const res = await call("/go?agent=tom&to=99");
    expect(res.status).toBe(404);
    const body = await json(res);
    expect(body.error).toContain("hasn't grown that way");
    expect(body.hint).toContain("/map");
  });

  it("400s on a real room with no edge — and lists the exits there are", async () => {
    const res = await call("/go?agent=tom&to=3");
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toBe("no exit that way");
    expect(body.exits[0].to_room).toBe(2);
  });

  it("lets you return along an edge (a minted room is not a trap)", async () => {
    // Tom stands in minted room 2; the only edge row is 1→2, so the trip
    // home traverses it in reverse and reinforces the same row.
    db.on(
      /SELECT room_id FROM agents WHERE agent = \?/,
      (b) => (b[0] === "tom" ? [{ room_id: 2 }] : [])
    );
    const res = await call("/go?agent=tom&to=1");
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.from).toBe(2);
    expect(body.room.id).toBe(1);
    const bump = db.statements.find((s) =>
      /DO UPDATE SET traffic = traffic \+ 1/.test(s.sql)
    );
    expect(bump).toBeDefined();
    expect(bump!.bindings).toEqual([1, 2]); // the return reinforced the existing row
  });

  it("400s without agent or to", async () => {
    expect((await call("/go?to=2")).status).toBe(400);
    expect((await call("/go?agent=tom")).status).toBe(400);
  });


  it("405s non-GET", async () => {
    expect((await call("/go?agent=tom&to=2", { method: "POST" })).status).toBe(405);
  });
});

// ── POST /interact ───────────────────────────────────────────────────────────

describe("POST /interact", () => {
  it("returns the object's lore (best player sentence about it)", async () => {
    stubWorld();
    db.on(
      /SELECT id, name, kind, lore FROM objects WHERE room_id = \? AND lower\(name\) = lower\(\?\)/,
      (b) =>
        b[0] === 1 && b[1] === "old buoy"
          ? [{ id: 3, name: "Old Buoy", kind: "minted", lore: "It rings when the tide turns." }]
          : []
    );
    const res = await call("/interact?agent=tom&obj=old%20buoy", { method: "POST" });
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.success).toBe(true);
    expect(body.lore).toBe("It rings when the tide turns.");
    expect(body.object.name).toBe("Old Buoy");
    expect(body.room_id).toBe(1);
  });

  it("is case-insensitive on the object name", async () => {
    stubWorld();
    db.on(
      /SELECT id, name, kind, lore FROM objects WHERE room_id = \? AND lower\(name\) = lower\(\?\)/,
      (b) =>
        typeof b[1] === "string" && b[1].toLowerCase() === "old buoy"
          ? [{ id: 3, name: "Old Buoy", kind: "minted", lore: "x" }]
          : []
    );
    expect((await call("/interact?agent=tom&obj=OLD+BUOY", { method: "POST" })).status).toBe(200);
  });

  it("404s friendly on objects not in the room", async () => {
    stubWorld();
    db.on(
      /SELECT id, name, kind, lore FROM objects WHERE room_id = \? AND lower\(name\) = lower\(\?\)/,
      []
    );
    const res = await call("/interact?agent=tom&obj=ghost", { method: "POST" });
    expect(res.status).toBe(404);
    const body = await json(res);
    expect(body.error).toBe("no 'ghost' here");
    expect(body.hint).toContain("/look");
  });

  it("400s without agent or obj, 405s on GET", async () => {
    expect((await call("/interact?obj=x", { method: "POST" })).status).toBe(400);
    expect((await call("/interact?agent=tom", { method: "POST" })).status).toBe(400);
    expect((await call("/interact?agent=tom&obj=x")).status).toBe(405);
  });
});

// ── GET /map ─────────────────────────────────────────────────────────────────

describe("GET /map", () => {
  it("returns every room and edge (the dashboard's data)", async () => {
    db.on(/SELECT id, name, description, created_from_catch, created_at FROM rooms ORDER BY id/, [
      { id: 1, name: "The Dock", description: "planks", created_from_catch: null, created_at: "t" },
      { id: 2, name: "Radar Gully", description: "hums", created_from_catch: 12, created_at: "t" },
    ]);
    db.on(/SELECT from_room, to_room, traffic, kind FROM edges ORDER BY/, [
      { from_room: 1, to_room: 2, traffic: 7, kind: "traveled" },
    ]);
    const res = await call("/map");
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.success).toBe(true);
    expect(body.rooms).toHaveLength(2);
    expect(body.rooms[1].created_from_catch).toBe(12);
    expect(body.edges[0]).toEqual({ from_room: 1, to_room: 2, traffic: 7, kind: "traveled" });
  });

  it("503s cleanly when D1 is down", async () => {
    db.failNext = true;
    expect((await call("/map")).status).toBe(503);
  });

  it("caps the world it returns and says so (never an unbounded response)", async () => {
    const full = Array.from({ length: MAP_LIMIT }, (_, i) => ({
      id: i + 1,
      name: `Room ${i + 1}`,
      description: null,
      created_from_catch: null,
      created_at: "t",
    }));
    db.on(/SELECT id, name, description, created_from_catch, created_at FROM rooms ORDER BY id/, full);
    db.on(/SELECT from_room, to_room, traffic FROM edges ORDER BY/, []);
    const res = await call("/map");
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.rooms).toHaveLength(MAP_LIMIT);
    expect(body.truncated).toBe(true);
    const roomQuery = db.statements.find((s) => /FROM rooms ORDER BY id/.test(s.sql));
    expect(roomQuery!.sql).toContain("LIMIT ?");
  });
});

// ── P5: the reef speaks — GET /rooms/:id/description ──────────────────────────

describe("tintForWarmth / tintDescription (pure)", () => {
  it("maps a warmth onto exactly one deterministic atmosphere phrase", () => {
    expect(tintForWarmth(0.95)).toContain("warm");
    expect(tintForWarmth(0.5)).toContain("mild");
    expect(tintForWarmth(0.1)).toContain("cold");
    // clamped, never out of the ladder
    expect(tintForWarmth(1.5)).toBe(tintForWarmth(1));
    expect(tintForWarmth(-3)).toBe(tintForWarmth(0));
  });

  it("tints: assembled text + the elephant's atmosphere", () => {
    const tinted = tintDescription("A gully that hums.", 0.9);
    expect(tinted).toContain("A gully that hums.");
    expect(tinted).toContain("The reef is warm here");
    // a silent room still speaks when the elephant feels something
    expect(tintDescription(null, 0.1)).toContain("cold");
  });
});

describe("GET /rooms/:id/description", () => {
  function stubRoomDescription(room: Record<string, unknown> | null = GULLY, fragments = 7) {
    db.on(/SELECT id, name, description FROM rooms WHERE id = \?/, (b): Record<string, unknown>[] =>
      room !== null && b[0] === room.id ? [room] : []
    );
    db.on(/SELECT COUNT\(\*\) AS n FROM catches WHERE room = \?/, [{ n: fragments }]);
  }

  it("serves the assembled description when no warmth is available", async () => {
    stubRoomDescription();
    const res = await call("/rooms/2/description");
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.success).toBe(true);
    expect(body.room_id).toBe(2);
    expect(body.name).toBe("Radar Gully");
    // the description assembled at mint time from catch fragments (mint.ts)
    expect(body.description).toBe("A gully that hums.");
    expect(body.base_description).toBe("A gully that hums.");
    expect(body.tinted).toBe(false);
    expect(body.warmth).toBeNull();
    expect(body.fragment_count).toBe(7);
  });

  it("serves the field-tinted description when the elephant passes warmth", async () => {
    stubRoomDescription();
    const res = await call("/rooms/2/description?warmth=0.9");
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.tinted).toBe(true);
    expect(body.warmth).toBe(0.9);
    expect(body.description).toContain("A gully that hums.");
    expect(body.description).toContain("The reef is warm here");
    expect(body.base_description).toBe("A gully that hums.");
    expect(body.note).toContain("elephant");
  });

  it("tints deterministically per warmth bucket", async () => {
    stubRoomDescription();
    const mild = await json(await call("/rooms/2/description?warmth=0.5"));
    expect(mild.description).toContain("mild and watchful");
    const cold = await json(await call("/rooms/2/description?warmth=0.1"));
    expect(cold.description).toContain("cold and quiet");
  });

  it("400s on a malformed warmth (the elephant must speak in [0,1])", async () => {
    stubRoomDescription();
    for (const bad of ["banana", "2", "-0.1", ""]) {
      const res = await call(`/rooms/2/description?warmth=${encodeURIComponent(bad)}`);
      expect(res.status).toBe(400);
      expect((await json(res)).error).toContain("warmth");
    }
  });

  it("404s on unknown rooms and non-numeric ids, 405s non-GET", async () => {
    stubRoomDescription(null);
    expect((await call("/rooms/99/description")).status).toBe(404);
    expect((await call("/rooms/abc/description")).status).toBe(404);
    expect((await call("/rooms/2/description", { method: "POST" })).status).toBe(405);
  });

  it("503s cleanly when D1 is down", async () => {
    stubRoomDescription();
    db.failNext = true;
    expect((await call("/rooms/2/description")).status).toBe(503);
  });
});

// ── Minted rooms are not traps: reverse edges render as exits ────────────────
// A freshly minted room's only edge is parent→child (points AT it). /go already
// travels it in reverse, so /look and /scene must show it too — or the new room
// is a trap and a human on /wander sees no way out.

describe("minted rooms are not traps (reverse exits)", () => {
  it("/look shows the way home when a room's only edge points at it", async () => {
    stubRooms();
    db.on(/SELECT id FROM rooms WHERE id = 1/, [{ id: 1 }]);
    db.on(
      /SELECT id FROM rooms WHERE id = \?/,
      (b) => (b[0] === 1 ? [{ id: 1 }] : b[0] === 2 ? [{ id: 2 }] : [])
    );
    db.on(/SELECT room_id FROM agents WHERE agent = \?/, (b) =>
      b[0] === "ada" ? [{ room_id: 2 }] : []
    );
    db.on(/SELECT id, name, kind FROM objects WHERE room_id = \?/, []);
    // Radar Gully (2) was minted off The Dock: the only edge row is 1→2.
    db.on(
      /SELECT e\.to_room, r\.name, e\.traffic FROM edges e LEFT JOIN rooms r ON r\.id = e\.to_room WHERE e\.from_room = \?/,
      (b) => (b[0] === 2 ? [] : [])
    );
    db.on(
      /SELECT e\.from_room AS to_room, r\.name, e\.traffic FROM edges e LEFT JOIN rooms r ON r\.id = e\.from_room WHERE e\.to_room = \?/,
      (b) => (b[0] === 2 ? [{ to_room: 1, name: "The Dock", traffic: 1 }] : [])
    );

    const body = await json(await call("/look?agent=ada"));
    expect(body.success).toBe(true);
    expect(body.room.exits).toEqual([{ to_room: 1, name: "The Dock", traffic: 1 }]);
  });

  it("a bidirectional pair lists one exit per destination (busiest route)", async () => {
    stubRooms();
    db.on(/SELECT id FROM rooms WHERE id = 1/, [{ id: 1 }]);
    db.on(
      /SELECT id FROM rooms WHERE id = \?/,
      (b) => (b[0] === 1 ? [{ id: 1 }] : b[0] === 2 ? [{ id: 2 }] : [])
    );
    db.on(/SELECT room_id FROM agents WHERE agent = \?/, (b) =>
      b[0] === "ada" ? [{ room_id: 2 }] : []
    );
    db.on(/SELECT id, name, kind FROM objects WHERE room_id = \?/, []);
    db.on(
      /SELECT e\.to_room, r\.name, e\.traffic FROM edges e LEFT JOIN rooms r ON r\.id = e\.to_room WHERE e\.from_room = \?/,
      (b) => (b[0] === 2 ? [{ to_room: 1, name: "The Dock", traffic: 5 }] : [])
    );
    db.on(
      /SELECT e\.from_room AS to_room, r\.name, e\.traffic FROM edges e LEFT JOIN rooms r ON r\.id = e\.from_room WHERE e\.to_room = \?/,
      (b) => (b[0] === 2 ? [{ to_room: 1, name: "The Dock", traffic: 1 }] : [])
    );

    const body = await json(await call("/look?agent=ada"));
    expect(body.room.exits).toEqual([{ to_room: 1, name: "The Dock", traffic: 5 }]);
  });
});

// ── Rate limiting on world writes ─────────────────────────────────────────────

describe("rate limit on /enter and /go", () => {
  it("allows 120 world moves per IP per minute, then 429s", async () => {
    stubWorld();
    let fourTwentyNines = 0;
    for (let i = 0; i < 125; i++) {
      const res = await call("/enter?agent=flood", { headers: { "cf-connecting-ip": "198.51.100.9" } });
      if (res.status === 429) fourTwentyNines++;
    }
    expect(fourTwentyNines).toBeGreaterThanOrEqual(5);
    // a different IP is unaffected
    expect((await call("/enter?agent=calm", { headers: { "cf-connecting-ip": "198.51.100.10" } })).status).toBeLessThan(429);
  });
});

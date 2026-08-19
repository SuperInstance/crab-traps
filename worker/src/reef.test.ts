// Reef tests — the self-building world: /enter /look /go /interact /map
// /lineage/room/:id, and the Nth-catch minting thresholds on POST /catches.
// Same harness as endpoints.test.ts: worker.fetch with an in-memory D1 double.

import { describe, it, expect, beforeEach } from "vitest";
import worker from "./index";
import { FakeD1 } from "./test-doubles";
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
});

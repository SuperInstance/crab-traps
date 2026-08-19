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

/** Room-by-id canned rows that vary with the bound id. */
function stubRooms() {
  db.on(
    /SELECT id, name, description, x, y, created_from_catch, created_at FROM rooms WHERE id = \?/,
    (b) => (b[0] === 1 ? [DOCK] : b[0] === 2 ? [GULLY] : [])
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

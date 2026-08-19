// Scene tests — the terrain beam: reef rooms → terrain's scene.json contract.
// Two layers: the pure compiler (compileRoomScene + the terrain_core.py ports
// of keyword→material/theme inference) and the GET /scene/:room endpoint
// (worker.fetch with the in-memory D1 double). The shape must match what
// terrain/terrain_core.py's compile_room + compile_to_json emit, exactly.

import { describe, it, expect, beforeEach } from "vitest";
import worker from "./index";
import { FakeD1 } from "./test-doubles";
import type { Env } from "./index-helpers";
import { compileRoomScene, inferMaterial, inferShape, inferSize, pickTheme } from "./scene";
import type { RoomState } from "./reef";

let db: FakeD1;
let env: Env;

function makeEnv(): Env {
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
});

// A reef-shaped room: prose name, prose description, objects with no
// prototypes (the reef's young rooms carry only id/name/kind), named exits.
const DOCK: RoomState = {
  id: 1,
  name: "The Dock",
  description: "Weathered planks over still green water. A brass bell hangs from the pier post.",
  objects: [
    { id: 1, name: "Brass Bell", kind: "minted" },
    { id: 2, name: "Old Anchor", kind: "minted" },
    { id: 3, name: "Tool Rack", kind: null },
    { id: 4, name: "Rope Coil", kind: null },
    { id: 5, name: "Huge Sea Chest", kind: null },
    { id: 6, name: "Lantern", kind: null },
  ],
  exits: [
    { to_room: 2, name: "Radar Gully", traffic: 7 },
    { to_room: 3, name: "Kelp Shelf", traffic: 3 },
    { to_room: 4, name: "The Shallows", traffic: 1 },
  ],
};

// ── Terrain inference ports ─────────────────────────────────────────────────

describe("inferMaterial (terrain_core.py port)", () => {
  it("maps metal keywords to PBR props, first hit wins", () => {
    expect(inferMaterial("a rusty steel hull")).toEqual({
      color: "#99aabb",
      metalness: 0.95,
      roughness: 0.15,
    });
  });

  it("falls back to terrain's default material", () => {
    expect(inferMaterial("a quiet, featureless room")).toEqual({
      color: "#888888",
      metalness: 0,
      roughness: 0.5,
    });
  });

  it("carries emissive props for glow keywords", () => {
    expect(inferMaterial("the walls glow faintly")).toMatchObject({
      emissive: "#ffff44",
      emissiveIntensity: 1.0,
    });
  });
});

describe("inferShape / inferSize (terrain_core.py ports)", () => {
  it("infers cylinders from engine/fuel/rope/pipe names", () => {
    expect(inferShape("port engine", "")).toBe("cylinder");
    expect(inferShape("fuel lines", "")).toBe("cylinder");
    expect(inferShape("rope coil", "")).toBe("cylinder");
  });

  it("infers a cone from anchors, boxes from racks", () => {
    expect(inferShape("Old Anchor", "")).toBe("cone");
    expect(inferShape("Tool Rack", "")).toBe("box");
  });

  it("reads the description when the name is silent", () => {
    expect(inferShape("mystery object", "perfectly round")).toBe("sphere");
  });

  it("defaults unknown shapes to box", () => {
    expect(inferShape("lantern", "")).toBe("box");
  });

  it("maps size adjectives to terrain's scales", () => {
    expect(inferSize("Huge Sea Chest", "")).toBe(2.5);
    expect(inferSize("tiny charm", "")).toBe(0.25);
    expect(inferSize("Lantern", "")).toBe(1.0);
  });
});

describe("pickTheme (reef-flavored description hints)", () => {
  it("reads the harbor from a dock", () => {
    expect(pickTheme("The Dock", "The harbor pier bustles with moored boats.")).toMatchObject({
      bg: "#1a2a3a",
      fg: "#2a4a6a",
      accent: "#ffd700",
    });
  });

  it("reads the engine room from a humming room", () => {
    expect(pickTheme("Radar Gully", "A gully that hums.").accent).toBe("#4488ff");
  });

  it("reads the tide pool from kelp and water", () => {
    expect(pickTheme("Kelp Shelf", "A shelf of kelp, drenched by the tide.").accent).toBe("#44ffaa");
  });

  it("never fails — the default theme catches everything", () => {
    expect(pickTheme("Anywhere", "Mundane prose.").bg).toBe("#0a0a1a");
  });
});

// ── compileRoomScene — the exact terrain contract shape ─────────────────────

describe("compileRoomScene", () => {
  const scene = compileRoomScene(DOCK);

  it("emits terrain's scene.json top-level shape (compile_to_json keys)", () => {
    expect(Object.keys(scene).sort()).toEqual(
      [
        "room",
        "description",
        "theme",
        "floor",
        "walls",
        "ceiling",
        "objects",
        "agents",
        "exits",
        "lights",
        "camera",
      ].sort()
    );
    expect(scene.room).toBe("The Dock");
    expect(scene.description).toBe(DOCK.description);
    expect(scene.theme).toEqual({ bg: "#1a2a3a", fg: "#2a4a6a", accent: "#ffd700" });
  });

  it("compiles the floor plane exactly like terrain (PlaneGeometry 20×20, x-rotated, side 2)", () => {
    expect(scene.floor.type).toBe("mesh");
    expect(scene.floor.geometry).toEqual({ type: "PlaneGeometry", width: 20, height: 20 });
    expect(scene.floor.rotation).toEqual({ x: -Math.PI / 2, y: 0, z: 0 });
    expect(scene.floor.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(scene.floor.material.side).toBe(2);
    expect(scene.floor.material.color).toBe("#7a5c3a"); // harbor theme floor = deck
    expect(scene.floor.receiveShadow).toBe(true);
  });

  it("compiles four walls at the room's edges (terrain's configs)", () => {
    expect(scene.walls).toHaveLength(4);
    expect(scene.walls.map((w) => w.position)).toEqual([
      { x: 0, y: 4, z: -10 },
      { x: 0, y: 4, z: 10 },
      { x: 10, y: 4, z: 0 },
      { x: -10, y: 4, z: 0 },
    ]);
    for (const w of scene.walls) {
      expect(w.type).toBe("mesh");
      expect(w.geometry.type).toBe("PlaneGeometry");
      expect(w.geometry.height).toBe(8);
      expect(w.material.side).toBe(0);
      expect(w.material.color).toBe("#6a6a6a"); // walls stay stone
    }
  });

  it("compiles the ceiling (y=8, x-rotated π/2, terrain's #303040)", () => {
    expect(scene.ceiling.position).toEqual({ x: 0, y: 8, z: 0 });
    expect(scene.ceiling.rotation).toEqual({ x: Math.PI / 2, y: 0, z: 0 });
    expect(scene.ceiling.material.color).toBe("#303040");
    expect(scene.ceiling.material.side).toBe(1);
  });

  it("places objects on terrain's row/grid with inferred shapes, scales, materials", () => {
    expect(scene.objects).toHaveLength(6);
    // material from the room description (brass), color overridden like terrain
    expect(scene.objects[0].material).toMatchObject({ color: "#8899aa", metalness: 0.85, roughness: 0.2 });
    // shapes
    expect(scene.objects[1].geometry.type).toBe("ConeGeometry"); // Old Anchor
    expect(scene.objects[3].geometry.type).toBe("CylinderGeometry"); // Rope Coil
    expect(scene.objects[0].geometry.type).toBe("BoxGeometry"); // Brass Bell
    // scale
    expect(scene.objects[4].scale).toEqual({ x: 2.5, y: 2.5, z: 2.5 }); // Huge Sea Chest
    expect(scene.objects[4].position.y).toBe(1.25); // scale/2, resting on the floor
    // grid: row of five, second row starts back-left
    expect(scene.objects[0].position).toEqual({ x: -6, y: 0.5, z: -5 });
    expect(scene.objects[4].position).toEqual({ x: 6, y: 1.25, z: -5 });
    expect(scene.objects[5].position).toEqual({ x: -6, y: 0.5, z: -2 });
  });

  it("maps exits to the room's edges (north, east, south) with doorway size and accent glow", () => {
    expect(scene.exits).toHaveLength(3);
    expect(scene.exits.map((e) => e.direction)).toEqual(["north", "east", "south"]);
    expect(scene.exits.map((e) => e.target)).toEqual(["Radar Gully", "Kelp Shelf", "The Shallows"]);
    expect(scene.exits[0].position).toEqual({ x: 0, y: 2, z: -9 });
    expect(scene.exits[1].position).toEqual({ x: 9, y: 2, z: 0 });
    expect(scene.exits[2].rotation).toEqual({ y: Math.PI });
    for (const e of scene.exits) {
      expect(e.type).toBe("exit");
      expect(e.size).toEqual({ width: 3, height: 4 });
      expect(e.color).toBe("#ffd700"); // theme accent
      expect(e.glow).toBe(true);
    }
  });

  it("compiles terrain's light rig: ambient + accent point + one per exit", () => {
    expect(scene.lights).toHaveLength(5);
    expect(scene.lights[0]).toMatchObject({ type: "ambient", color: "#203040", intensity: 0.4 });
    expect(scene.lights[1]).toMatchObject({
      type: "point",
      color: "#ffd700",
      intensity: 0.8,
      position: { x: 0, y: 6, z: 0 },
      distance: 30,
    });
    expect(scene.lights[2]).toMatchObject({ type: "point", intensity: 0.3, distance: 10 });
    expect(scene.lights[2].position).toEqual(scene.exits[0].position);
  });

  it("ships the contract camera and an empty agents list (no occupants in reef state)", () => {
    expect(scene.camera).toEqual({ position: { x: 0, y: 4, z: 8 }, lookAt: { x: 0, y: 1, z: 0 }, fov: 60 });
    expect(scene.agents).toEqual([]);
  });

  it("is deterministic — same room compiles identically", () => {
    expect(compileRoomScene(DOCK)).toEqual(compileRoomScene(DOCK));
  });

  it("handles rooms with no objects or exits gracefully", () => {
    const bare: RoomState = { id: 9, name: "Bare Room", description: "Empty.", objects: [], exits: [] };
    const s = compileRoomScene(bare);
    expect(s.objects).toEqual([]);
    expect(s.exits).toEqual([]);
    expect(s.lights).toHaveLength(2);
    expect(s.theme.accent).toBe("#ffd700"); // default theme
  });
});

// ── GET /scene/:room endpoint ───────────────────────────────────────────────

describe("GET /scene/:room", () => {
  function stubWorld() {
    db.on(
      /SELECT id, name, description, x, y, created_from_catch, created_at FROM rooms WHERE id = \?/,
      (b) =>
        (b[0] === 1
          ? [
              {
                id: DOCK.id,
                name: DOCK.name,
                description: DOCK.description,
                x: null,
                y: null,
                created_from_catch: null,
                created_at: "2026-08-18T00:00:00Z",
              },
            ]
          : []) as Record<string, unknown>[]
    );
    db.on(
      /SELECT id, name, kind FROM objects WHERE room_id = \?/,
      (b) =>
        (b[0] === 1
          ? DOCK.objects.map((o) => ({ id: o.id, name: o.name, kind: o.kind }))
          : []) as Record<string, unknown>[]
    );
    db.on(
      /SELECT e\.to_room, r\.name, e\.traffic FROM edges e/,
      (b) =>
        (b[0] === 1
          ? DOCK.exits.map((e) => ({ to_room: e.to_room, name: e.name, traffic: e.traffic }))
          : []) as Record<string, unknown>[]
    );
    db.on(/SELECT id FROM rooms WHERE lower\(name\) = lower\(\?\)/, (b) =>
      b[0] === "The Dock" ? [{ id: 1 }] : []
    );
  }

  it("serves the raw terrain contract for a room id (no success wrapper)", async () => {
    stubWorld();
    const res = await call("/scene/1");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = await json(res);
    expect(body.success).toBeUndefined();
    expect(body.room).toBe("The Dock");
    expect(body.walls).toHaveLength(4);
    expect(body.exits[0].target).toBe("Radar Gully");
    expect(body.objects[1].geometry.type).toBe("ConeGeometry");
  });

  it("resolves a room by name (URL-encoded)", async () => {
    stubWorld();
    const res = await call("/scene/The%20Dock");
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.room).toBe("The Dock");
  });

  it("404s for rooms the reef hasn't grown", async () => {
    stubWorld();
    const res = await call("/scene/nowhere");
    expect(res.status).toBe(404);
    const body = await json(res);
    expect(body.success).toBe(false);
    expect(body.error).toBe("room not found");
  });

  it("404s when the id exists in no room", async () => {
    stubWorld();
    const res = await call("/scene/999");
    expect(res.status).toBe(404);
  });

  it("503s when D1 is unavailable, like the rest of the reef", async () => {
    stubWorld();
    db.failNext = true;
    const res = await call("/scene/1");
    expect(res.status).toBe(503);
    const body = await json(res);
    expect(body.error).toBe("world storage unavailable");
  });

  it("rejects non-GET methods", async () => {
    stubWorld();
    const res = await call("/scene/1", { method: "POST" });
    expect(res.status).toBe(405);
  });
});

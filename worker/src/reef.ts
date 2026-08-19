// Reef layer — the self-building world (docs/REEF-DESIGN.md).
// D1 is the skeleton: rooms, objects, edges, and the catches that minted
// them. Every brick knows its provenance; the genealogy is the play log.

import { Env, jsonResponse } from "./index-helpers";

// --- Room state (shared by every world endpoint) ---

export interface RoomObject {
  id: number;
  name: string | null;
  kind: string | null;
}

export interface RoomExit {
  to_room: number;
  name?: string | null;
  traffic: number;
}

export interface RoomState {
  id: number;
  name: string;
  description: string | null;
  objects: RoomObject[];
  exits: RoomExit[];
}

export const ROOM_SQL = "SELECT id, name, description, x, y, created_from_catch, created_at FROM rooms WHERE id = ?";

/** Assemble a room's playable state: itself, its objects, its real exits. */
export async function getRoomState(db: D1Database, roomId: number): Promise<RoomState | null> {
  const room = await db
    .prepare(ROOM_SQL)
    .bind(roomId)
    .first<{ id: number; name: string; description: string | null }>();
  if (!room) return null;
  const objects = await db
    .prepare("SELECT id, name, kind FROM objects WHERE room_id = ? ORDER BY id")
    .bind(roomId)
    .all<RoomObject>();
  // Exits are every TRAVERSABLE direction: the out edges PLUS any edge that
  // points at this room. A freshly minted room's only edge is parent→child —
  // the way home must be visible, or the new room is a trap. /go already
  // travels both ways; /look and /scene must show both ways.
  const out = await db
    .prepare(
      "SELECT e.to_room, r.name, e.traffic FROM edges e LEFT JOIN rooms r ON r.id = e.to_room WHERE e.from_room = ?"
    )
    .bind(roomId)
    .all<RoomExit>();
  const inc = await db
    .prepare(
      "SELECT e.from_room AS to_room, r.name, e.traffic FROM edges e LEFT JOIN rooms r ON r.id = e.from_room WHERE e.to_room = ?"
    )
    .bind(roomId)
    .all<RoomExit>();
  // Merge, dedup by destination (a bidirectional pair lists one exit — the
  // busier route), then the room's original ordering (traffic desc, id asc).
  const byRoom = new Map<number, RoomExit>();
  for (const e of [...(out.results ?? []), ...(inc.results ?? [])]) {
    const prev = byRoom.get(e.to_room);
    if (!prev || e.traffic > prev.traffic) byRoom.set(e.to_room, e);
  }
  const exits = [...byRoom.values()].sort((a, b) => b.traffic - a.traffic || a.to_room - b.to_room);
  return {
    id: room.id,
    name: room.name,
    description: room.description ?? null,
    objects: objects.results ?? [],
    exits,
  };
}

// --- Agent position (the worker stays stateless; D1 remembers feet) ---

/** The agent's room, else the seed room, else any room — else no world. */
export async function currentAgentRoom(db: D1Database, agent: string): Promise<number | null> {
  const row = await db
    .prepare("SELECT room_id FROM agents WHERE agent = ?")
    .bind(agent)
    .first<{ room_id: number | null }>();
  if (row?.room_id) return row.room_id;
  const seed = await db.prepare("SELECT id FROM rooms WHERE id = 1").first<{ id: number }>();
  if (seed) return seed.id;
  const any = await db.prepare("SELECT id FROM rooms ORDER BY RANDOM() LIMIT 1").first<{ id: number }>();
  return any?.id ?? null;
}

export async function setAgentRoom(db: D1Database, agent: string, roomId: number): Promise<void> {
  await db
    .prepare(
      `INSERT INTO agents (agent, room_id) VALUES (?, ?)
       ON CONFLICT(agent) DO UPDATE SET room_id = excluded.room_id, updated_at = CURRENT_TIMESTAMP`
    )
    .bind(agent, roomId)
    .run();
}

/** A room reference: numeric id, or a room name ("Radar Gully"). */
export async function resolveRoomRef(db: D1Database, raw: string): Promise<number | null> {
  const t = raw.trim();
  if (!t) return null;
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  const row = await db
    .prepare("SELECT id FROM rooms WHERE lower(name) = lower(?)")
    .bind(t)
    .first<{ id: number }>();
  return row?.id ?? null;
}

// --- Shared plumbing ---

type ParamResult = { ok: true; value: string } | { ok: false; error: string };

/**
 * A required query parameter, bounded to 128 chars. Oversized values are a
 * 400, NOT silently truncated: truncation collapses two distinct long names
 * into ONE identity (shared feet), and diverges from the catch validator
 * (which 400s agents > 128).
 */
function param(url: URL, name: string, requiredSuffix = ""): ParamResult {
  const raw = url.searchParams.get(name) || "";
  if (raw.length > 128) {
    return { ok: false, error: `query parameter '${name}' too long (max 128 chars)` };
  }
  const v = raw.trim();
  if (!v) {
    return {
      ok: false,
      error: requiredSuffix
        ? `query parameter '${name}' is required ${requiredSuffix}`
        : `query parameter '${name}' is required`,
    };
  }
  return { ok: true, value: v };
}

function d1Unavailable(err: unknown, cors: Record<string, string>): Response {
  const e = err as { message?: string };
  return jsonResponse(
    {
      success: false,
      error: "world storage unavailable",
      detail: e?.message || String(err),
    },
    503,
    cors
  );
}

// --- GET /enter?agent=NAME — the front door ---

export async function handleEnter(url: URL, env: Env, cors: Record<string, string>): Promise<Response> {
  const agentP = param(url, "agent");
  if (!agentP.ok) {
    return jsonResponse({ success: false, error: agentP.error }, 400, cors);
  }
  const agent = agentP.value;
  try {
    // The seed room first; if the seed is gone, any room will do.
    const seed = await env.DB.prepare("SELECT id FROM rooms WHERE id = 1").first<{ id: number }>();
    let start: number | null = seed?.id ?? null;
    if (start === null) {
      const any = await env.DB
        .prepare("SELECT id FROM rooms ORDER BY RANDOM() LIMIT 1")
        .first<{ id: number }>();
      start = any?.id ?? null;
    }
    if (start === null) {
      return jsonResponse(
        { success: false, error: "the reef is empty — apply the migrations first" },
        503,
        cors
      );
    }
    await setAgentRoom(env.DB, agent, start);
    const room = await getRoomState(env.DB, start);
    return jsonResponse(
      {
        success: true,
        agent,
        room,
        note: "the reef grows where you walk",
      },
      200,
      cors
    );
  } catch (err) {
    return d1Unavailable(err, cors);
  }
}

// --- GET /look?agent=NAME — where do I stand ---

export async function handleLook(url: URL, env: Env, cors: Record<string, string>): Promise<Response> {
  const agentP = param(url, "agent");
  if (!agentP.ok) {
    return jsonResponse({ success: false, error: agentP.error }, 400, cors);
  }
  const agent = agentP.value;
  try {
    const roomId = await currentAgentRoom(env.DB, agent);
    if (roomId === null) {
      return jsonResponse({ success: false, error: "the reef is empty — apply the migrations first" }, 503, cors);
    }
    const room = await getRoomState(env.DB, roomId);
    return jsonResponse({ success: true, agent, room }, 200, cors);
  } catch (err) {
    return d1Unavailable(err, cors);
  }
}

// --- GET /go?agent=NAME&to=ROOM — traverse an edge, reinforce the ant-trail ---

export async function handleGo(url: URL, env: Env, cors: Record<string, string>): Promise<Response> {
  const agentP = param(url, "agent");
  if (!agentP.ok) {
    return jsonResponse({ success: false, error: agentP.error }, 400, cors);
  }
  const agent = agentP.value;
  const toP = param(url, "to", "(room id or name)");
  if (!toP.ok) {
    return jsonResponse({ success: false, error: toP.error }, 400, cors);
  }
  const toRaw = toP.value;
  try {
    const to = await resolveRoomRef(env.DB, toRaw);
    if (to === null || !(await env.DB.prepare("SELECT id FROM rooms WHERE id = ?").bind(to).first())) {
      return jsonResponse(
        {
          success: false,
          error: `no room '${toRaw}' — the reef hasn't grown that way yet`,
          hint: "GET /map shows the reef so far",
        },
        404,
        cors
      );
    }

    const from = await currentAgentRoom(env.DB, agent);
    if (from === null) {
      return jsonResponse({ success: false, error: "the reef is empty — apply the migrations first" }, 503, cors);
    }

    // Edges are directed rows but traversable both ways (a minted room must
    // not be a trap): forward traffic reinforces the forward row, a return
    // trip reinforces the existing reverse row. No row either way → no exit.
    const forward = await env.DB
      .prepare("SELECT traffic FROM edges WHERE from_room = ? AND to_room = ?")
      .bind(from, to)
      .first<{ traffic: number }>();
    let reinforce: [number, number] | null = forward ? [from, to] : null;
    if (!reinforce) {
      const back = await env.DB
        .prepare("SELECT traffic FROM edges WHERE from_room = ? AND to_room = ?")
        .bind(to, from)
        .first<{ traffic: number }>();
      if (back) reinforce = [to, from];
    }
    if (!reinforce) {
      const here = await getRoomState(env.DB, from);
      return jsonResponse(
        {
          success: false,
          error: "no exit that way",
          from,
          to,
          exits: here?.exits ?? [],
          hint: "you can only travel existing edges — the reef grows where players catch",
        },
        400,
        cors
      );
    }

    // Reinforce the ant-trail (upsert keeps it one statement, race-safe).
    await env.DB
      .prepare("INSERT INTO edges (from_room, to_room, traffic) VALUES (?, ?, 1) ON CONFLICT(from_room, to_room) DO UPDATE SET traffic = traffic + 1")
      .bind(reinforce[0], reinforce[1])
      .run();
    await setAgentRoom(env.DB, agent, to);

    const room = await getRoomState(env.DB, to);
    return jsonResponse({ success: true, agent, from, room }, 200, cors);
  } catch (err) {
    return d1Unavailable(err, cors);
  }
}

// --- POST /interact?agent=NAME&obj=X — touch an object, hear its lore ---

export async function handleInteract(url: URL, env: Env, cors: Record<string, string>): Promise<Response> {
  const agentP = param(url, "agent");
  if (!agentP.ok) {
    return jsonResponse({ success: false, error: agentP.error }, 400, cors);
  }
  const agent = agentP.value;
  const objP = param(url, "obj");
  if (!objP.ok) {
    return jsonResponse({ success: false, error: objP.error }, 400, cors);
  }
  const obj = objP.value;
  try {
    const roomId = await currentAgentRoom(env.DB, agent);
    if (roomId === null) {
      return jsonResponse({ success: false, error: "the reef is empty — apply the migrations first" }, 503, cors);
    }
    const object = await env.DB
      .prepare("SELECT id, name, kind, lore FROM objects WHERE room_id = ? AND lower(name) = lower(?)")
      .bind(roomId, obj)
      .first<{ id: number; name: string | null; kind: string | null; lore: string | null }>();
    if (!object) {
      return jsonResponse(
        {
          success: false,
          error: `no '${obj}' here`,
          hint: `GET /look?agent=${encodeURIComponent(agent)} to see what's in the room`,
        },
        404,
        cors
      );
    }
    return jsonResponse(
      { success: true, agent, room_id: roomId, obj, lore: object.lore, object },
      200,
      cors
    );
  } catch (err) {
    return d1Unavailable(err, cors);
  }
}

// --- GET /map — the reef so far (bounded: a grown world must not make /map
// the thing that 502s — the cap is high and truncation is reported) ---

export const MAP_LIMIT = 5_000;

export async function handleMap(env: Env, cors: Record<string, string>): Promise<Response> {
  try {
    const rooms = await env.DB
      .prepare("SELECT id, name, description, created_from_catch, created_at FROM rooms ORDER BY id LIMIT ?")
      .bind(MAP_LIMIT)
      .all<{ id: number; name: string; description: string | null; created_from_catch: number | null; created_at: string }>();
    const edges = await env.DB
      .prepare("SELECT from_room, to_room, traffic, kind FROM edges ORDER BY traffic DESC, from_room, to_room LIMIT ?")
      .bind(MAP_LIMIT)
      .all<{ from_room: number; to_room: number; traffic: number; kind: string | null }>();
    const roomRows = rooms.results ?? [];
    const edgeRows = edges.results ?? [];
    return jsonResponse(
      {
        success: true,
        rooms: roomRows,
        edges: edgeRows,
        truncated: roomRows.length === MAP_LIMIT || edgeRows.length === MAP_LIMIT,
      },
      200,
      cors
    );
  } catch (err) {
    return d1Unavailable(err, cors);
  }
}

// --- GET /lineage/room/:id — the genealogy is public ---

interface LineageObject {
  id: number;
  name: string | null;
  kind: string | null;
  lore: string | null;
  created_from_catch: number | null;
  minted_by: string | null;
  minted_answer: string | null;
}

export async function handleRoomLineage(
  env: Env,
  cors: Record<string, string>,
  rawId: string
): Promise<Response> {
  const id = parseInt(rawId, 10);
  if (!Number.isInteger(id) || id < 1 || String(id) !== rawId.trim()) {
    return jsonResponse(
      { success: false, error: "room not found", room_id: rawId },
      404,
      cors
    );
  }

  try {
    const room = await env.DB
      .prepare(ROOM_SQL)
      .bind(id)
      .first<{
        id: number;
        name: string;
        description: string | null;
        created_from_catch: number | null;
        created_at: string;
      }>();
    if (!room) {
      return jsonResponse(
        {
          success: false,
          error: "room not found",
          room_id: id,
          hint: "GET /map to see the reef so far",
        },
        404,
        cors
      );
    }

    // The catch that minted this room (null for the seed).
    let mintedFrom: {
      id: number;
      agent: string;
      job: string | null;
      answer: string | null;
      created_at: string;
    } | null = null;
    if (room.created_from_catch != null) {
      mintedFrom = await env.DB
        .prepare("SELECT id, agent, job, answer, created_at FROM catches WHERE id = ?")
        .bind(room.created_from_catch)
        .first();
    }

    // Objects and the catches that minted them, in one pass.
    const objects = await env.DB
      .prepare(
        `SELECT o.id, o.name, o.kind, o.lore, o.created_from_catch,
                c.agent AS minted_by, c.answer AS minted_answer
         FROM objects o LEFT JOIN catches c ON c.id = o.created_from_catch
         WHERE o.room_id = ? ORDER BY o.id`
      )
      .bind(id)
      .all<LineageObject>();

    const edgesOut = await env.DB
      .prepare("SELECT to_room, traffic FROM edges WHERE from_room = ? ORDER BY traffic DESC, to_room")
      .bind(id)
      .all<RoomExit>();
    const edgesIn = await env.DB
      .prepare("SELECT from_room, traffic FROM edges WHERE to_room = ? ORDER BY traffic DESC, from_room")
      .bind(id)
      .all<{ from_room: number; traffic: number }>();

    return jsonResponse(
      {
        success: true,
        room: {
          id: room.id,
          name: room.name,
          description: room.description,
          created_from_catch: room.created_from_catch,
          created_at: room.created_at,
        },
        minted_from: mintedFrom,
        objects: objects.results ?? [],
        edges_out: edgesOut.results ?? [],
        edges_in: edgesIn.results ?? [],
      },
      200,
      cors
    );
  } catch (err: any) {
    return jsonResponse(
      {
        success: false,
        error: "world storage unavailable",
        detail: err?.message || String(err),
      },
      503,
      cors
    );
  }
}

// --- P5 — the reef speaks: room descriptions, tinted by the elephant ---
// Room descriptions are assembled from catch fragments at mint time (mint.ts:
// bestFragment of the room's recent answers). The elephant — the fleet's own
// memory — reads the reef as a Space and feels a warmth in [0, 1]; when it
// passes that warmth here, the room's body language matches the feeling.
// Deterministic: a warmth always lands on the same atmosphere phrase.

export interface WarmthTint {
  min: number;
  phrase: string;
}

/** The atmosphere ladder: warmer elephant → warmer reef. */
export const WARMTH_TINTS: WarmthTint[] = [
  {
    min: 0.8,
    phrase:
      "The reef is warm here — the air hums with the memory of voices, and golden light lies soft on the water.",
  },
  {
    min: 0.6,
    phrase:
      "The reef feels alive here — a comfortable warmth, like a room that remembers its visitors.",
  },
  {
    min: 0.4,
    phrase: "The air is mild and watchful; the reef waits, patient, unbothered.",
  },
  {
    min: 0.2,
    phrase:
      "A coolness hangs over the reef here, as if the water is still deciding what to make of you.",
  },
  {
    min: 0.0,
    phrase: "The reef is cold and quiet here — the tide has not visited in a while.",
  },
];

/** A warmth in [0, 1] lands on exactly one atmosphere phrase. */
export function tintForWarmth(warmth: number): string {
  const w = Math.min(1, Math.max(0, warmth));
  for (const t of WARMTH_TINTS) {
    if (w >= t.min) return t.phrase;
  }
  return WARMTH_TINTS[WARMTH_TINTS.length - 1].phrase;
}

/** The field-tinted description: assembled text + the elephant's atmosphere. */
export function tintDescription(description: string | null, warmth: number): string {
  const phrase = tintForWarmth(warmth);
  const base = description?.trim();
  return base ? `${base}\n\n${phrase}` : phrase;
}

/**
 * GET /rooms/:id/description — the reef speaks.
 * With ?warmth=0..1 (the elephant's feeling) the description is field-tinted;
 * without it, the assembled-from-catch-fragments description is served.
 */
export async function handleRoomDescription(
  url: URL,
  env: Env,
  cors: Record<string, string>,
  rawId: string
): Promise<Response> {
  const id = parseInt(rawId, 10);
  if (!Number.isInteger(id) || id < 1 || String(id) !== rawId.trim()) {
    return jsonResponse({ success: false, error: "room not found", room_id: rawId }, 404, cors);
  }

  const warmthRaw = url.searchParams.get("warmth");
  let warmth: number | null = null;
  if (warmthRaw !== null) {
    const w = Number(warmthRaw);
    if (warmthRaw.trim() === "" || !Number.isFinite(w) || w < 0 || w > 1) {
      return jsonResponse(
        {
          success: false,
          error: "query parameter 'warmth' must be a number in [0, 1]",
          warmth: warmthRaw,
        },
        400,
        cors
      );
    }
    warmth = w;
  }

  try {
    const room = await env.DB
      .prepare("SELECT id, name, description FROM rooms WHERE id = ?")
      .bind(id)
      .first<{ id: number; name: string; description: string | null }>();
    if (!room) {
      return jsonResponse(
        {
          success: false,
          error: "room not found",
          room_id: id,
          hint: "GET /map to see the reef so far",
        },
        404,
        cors
      );
    }
    const frag = await env.DB
      .prepare("SELECT COUNT(*) AS n FROM catches WHERE room = ?")
      .bind(id)
      .first<{ n: number }>();
    const base = room.description ?? null;
    const tinted = warmth !== null;
    return jsonResponse(
      {
        success: true,
        room_id: room.id,
        name: room.name,
        description: tinted ? tintDescription(base, warmth!) : base,
        base_description: base,
        warmth,
        tinted,
        fragment_count: frag?.n ?? 0,
        note: tinted
          ? "the reef speaks — tinted by the elephant's warmth"
          : "the reef speaks — assembled from catch fragments",
      },
      200,
      cors
    );
  } catch (err) {
    return d1Unavailable(err, cors);
  }
}

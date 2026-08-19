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
  const exits = await db
    .prepare("SELECT to_room, traffic FROM edges WHERE from_room = ? ORDER BY traffic DESC, to_room")
    .bind(roomId)
    .all<RoomExit>();
  return {
    id: room.id,
    name: room.name,
    description: room.description ?? null,
    objects: objects.results ?? [],
    exits: exits.results ?? [],
  };
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

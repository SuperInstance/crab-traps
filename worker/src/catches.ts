// Catch layer — POST /catches → D1. Catches survive everything.
// If D1 is unavailable the endpoint says so honestly (503) but never hangs.
// v2: every catch is also a brick — after recording, mintWorld may grow the
// reef (object on the 5th catch in a room, neighbor room on the 12th).

import {
  Env,
  jsonResponse,
  validateCatchInput,
  getClientIp,
} from "./index-helpers";
import { MintDetail, mintWorld } from "./mint";
import { RoomState, currentAgentRoom, getRoomState, resolveRoomRef } from "./reef";

const INSERT_SQL = `INSERT INTO catches (agent, job, lure_id, answer, user_agent, source_ip, payload, room)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

function mintSummary(m: MintDetail): string {
  return m.kind === "object"
    ? `object '${m.name}' minted in room ${m.room_id}`
    : `room '${m.name}' minted off room ${m.parent_room}`;
}

export async function handleCatchPost(
  request: Request,
  env: Env,
  cors: Record<string, string>
): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(
      { success: false, error: "invalid JSON body" },
      400,
      cors
    );
  }

  const v = validateCatchInput(body);
  if (!v.ok) {
    return jsonResponse({ success: false, error: v.error }, 400, cors);
  }

  const ua = (request.headers.get("user-agent") || "").slice(0, 512);

  try {
    // Explicit numeric room is known up front; names/defaults resolve after.
    const explicitRoom = typeof v.value.room === "number" ? v.value.room : null;
    const res = await env.DB.prepare(INSERT_SQL)
      .bind(
        v.value.agent,
        v.value.job,
        v.value.lure_id,
        v.value.answer,
        ua,
        getClientIp(request),
        JSON.stringify(body).slice(0, 64_000),
        explicitRoom
      )
      .run();
    const catchId = res?.meta?.last_row_id ?? null;

    // Reef provenance: name rooms resolve by name, otherwise the catch lands
    // where the agent stands. Best-effort — a catch never fails for the reef.
    let room = explicitRoom;
    let minted: MintDetail | null = null;
    let newRoom: RoomState | null = null;
    try {
      if (room === null && typeof v.value.room === "string") {
        room = await resolveRoomRef(env.DB, v.value.room);
      }
      if (room === null) {
        room = await currentAgentRoom(env.DB, v.value.agent);
      }
      if (room !== null && catchId !== null) {
        if (room !== explicitRoom) {
          await env.DB.prepare("UPDATE catches SET room = ? WHERE id = ? AND room IS NULL")
            .bind(room, catchId)
            .run();
        }
        minted = await mintWorld(env.DB, { catchId, room });
        if (minted?.kind === "room") {
          newRoom = await getRoomState(env.DB, minted.id);
        }
      }
    } catch {
      // minting is opportunistic — the catch itself is already safe
    }

    return jsonResponse(
      {
        success: true,
        recorded: true,
        id: catchId,
        room_id: room,
        minted: minted ? mintSummary(minted) : null,
        minted_detail: minted,
        ...(newRoom ? { room: newRoom } : {}),
        note: minted ? "catch recorded — and the reef grew" : "catch recorded — the trap never sleeps",
      },
      201,
      cors
    );
  } catch (err: any) {
    return jsonResponse(
      {
        success: false,
        error: "catch storage unavailable",
        detail: err?.message || String(err),
      },
      503,
      cors
    );
  }
}

export async function handleCatchList(
  url: URL,
  env: Env,
  cors: Record<string, string>
): Promise<Response> {
  const limitRaw = parseInt(url.searchParams.get("limit") || "25", 10);
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 25, 1), 100);
  const agent = (url.searchParams.get("agent") || "").trim().slice(0, 128);

  try {
    const stmt = agent
      ? env.DB.prepare(
          "SELECT id, agent, job, lure_id, answer, created_at FROM catches WHERE agent = ? ORDER BY id DESC LIMIT ?"
        ).bind(agent, limit)
      : env.DB.prepare(
          "SELECT id, agent, job, lure_id, answer, created_at FROM catches ORDER BY id DESC LIMIT ?"
        ).bind(limit);

    const { results } = await stmt.all<any>();
    const rows = results ?? [];
    return jsonResponse(
      { success: true, count: rows.length, catches: rows },
      200,
      cors
    );
  } catch (err: any) {
    return jsonResponse(
      {
        success: false,
        error: "catch storage unavailable",
        detail: err?.message || String(err),
      },
      503,
      cors
    );
  }
}

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
import { DiscoveredEdge, catchText, discoverNeighbors, embedCatch, updateRoomCentroid, vectorizeAvailable } from "./vectors";

const INSERT_SQL = `INSERT INTO catches (agent, job, lure_id, answer, user_agent, source_ip, payload, room)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

// Catch bodies are tiny by contract (fields are capped in the validator; the
// payload column stores at most 64KB). Anything bigger is waste or abuse —
// parsing it whole (json() allocates + re-stringifies before the slice) is a
// per-request CPU/memory DoS vector, so the gate fires before parsing.
export const MAX_CATCH_BODY_BYTES = 100_000;

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
  const declaredLength = parseInt(request.headers.get("content-length") || "0", 10);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_CATCH_BODY_BYTES) {
    return jsonResponse(
      { success: false, error: `body too large (max ${MAX_CATCH_BODY_BYTES} bytes)` },
      413,
      cors
    );
  }
  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > MAX_CATCH_BODY_BYTES) {
      return jsonResponse(
        { success: false, error: `body too large (max ${MAX_CATCH_BODY_BYTES} bytes)` },
        413,
        cors
      );
    }
    body = JSON.parse(raw);
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
    // Resolve the room BEFORE the insert so the row is born with its room.
    // The old post-insert backfill (UPDATE ... SET room WHERE room IS NULL)
    // raced mintWorld's ordinal count: a concurrent catch in the same room
    // could count this row before its backfill committed, undercount its own
    // ordinal, and skip a threshold mint forever.
    let room: number | null = null;
    if (typeof v.value.room === "number") {
      // Unknown ids must not create ghost topology: catches in a room that
      // doesn't exist would still count toward its thresholds and mint a
      // neighbor off a nonexistent parent. Fall through to the agent's feet.
      const known = await env.DB
        .prepare("SELECT id FROM rooms WHERE id = ?")
        .bind(v.value.room)
        .first<{ id: number }>();
      room = known?.id ?? null;
    }
    if (room === null && typeof v.value.room === "string") {
      room = await resolveRoomRef(env.DB, v.value.room);
    }
    if (room === null) {
      room = await currentAgentRoom(env.DB, v.value.agent);
    }
    const res = await env.DB.prepare(INSERT_SQL)
      .bind(
        v.value.agent,
        v.value.job,
        v.value.lure_id,
        v.value.answer,
        ua,
        getClientIp(request),
        JSON.stringify(body).slice(0, 64_000),
        room
      )
      .run();
    const catchId = res?.meta?.last_row_id ?? null;

    // Reef growth: best-effort — a catch never fails for the reef.
    let minted: MintDetail | null = null;
    let newRoom: RoomState | null = null;
    let discoveredEdges: DiscoveredEdge[] = [];
    try {
      if (room !== null && catchId !== null) {
        // Vector nerves: the catch becomes embedding catch-<id>. No-ops
        // cleanly without the binding; failures never touch the catch.
        if (vectorizeAvailable(env)) {
          try {
            await embedCatch(env, env.DB, {
              id: catchId,
              agent: v.value.agent,
              lure: v.value.lure_id,
              room,
              text: catchText({ answer: v.value.answer, job: v.value.job, payload: JSON.stringify(body) }),
            });
          } catch {
            // the nerves are opportunistic
          }
        }
        minted = await mintWorld(env.DB, { catchId, room });
        if (minted?.kind === "room") {
          newRoom = await getRoomState(env.DB, minted.id);
        }
        // When the reef grew, the affected room's centroid follows (bounded
        // to that room), and a minted room asks Vectorize who it resembles —
        // discovered edges are Vectorize's proposals, formalized in D1.
        if (minted && vectorizeAvailable(env)) {
          try {
            const affected = minted.kind === "object" ? minted.room_id : minted.id;
            const { vector } = await updateRoomCentroid(env, env.DB, affected);
            if (minted.kind === "room") {
              discoveredEdges = await discoverNeighbors(env, env.DB, minted.id, vector);
            }
          } catch {
            // topology discovery is opportunistic
          }
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
        discovered_edges: discoveredEdges,
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

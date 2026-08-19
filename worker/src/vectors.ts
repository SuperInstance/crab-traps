// Vector nerves (REEF-DESIGN §3): D1 is the skeleton, Vectorize is the
// nervous system.
//   catch-<id>  every accepted catch, embedded with the same deterministic
//              hash embedding the lure pipeline uses (index-helpers.ts /
//              scripts/vectorize-lures.py — one hash, one index).
//   room-<id>  a room's vector is the normalized centroid of its catches —
//              a room's meaning is literally what players did there.
// Vectorize discovers topology (converging room centroids); D1 formalizes it
// (discovered edges). Without the binding (local dev) every path here no-ops
// cleanly — the reef builds on skeleton alone.

import { Env, jsonResponse, generateEmbedding, EMBEDDING_DIM } from "./index-helpers";

// The index also holds lure:* vectors, and catch queries can crowd out rooms
// (a room's centroid sits near its own catches) — so over-fetch, then filter.
const SEARCH_FETCH_K = 32;
const DISCOVERY_FETCH_K = 16;

/** Semantic search returns the top 8 catches. */
export const SEARCH_HITS = 8;
/** Discovery formalizes at most 3 new edges per minted room. */
export const NEIGHBOR_TOP_K = 3;
/** Centroids read at most this many recent catches — O(room, recent), never O(world). */
export const ROOM_CENTROID_CATCH_LIMIT = 100;
const SNIPPET_MAX = 240;
const QUERY_MAX = 256;

/** The nerves are attached: a real Vectorize binding answers upsert. */
export function vectorizeAvailable(env: Env): boolean {
  return typeof env.VECTORIZE_INDEX?.upsert === "function";
}

/** The text a catch means: what the player said, else the job, else raw payload. */
export function catchText(row: {
  answer?: string | null;
  job?: string | null;
  payload?: string | null;
}): string {
  if (typeof row.answer === "string" && row.answer.trim()) return row.answer;
  if (typeof row.job === "string" && row.job.trim()) return row.job;
  return typeof row.payload === "string" ? row.payload : "";
}

/** Normalized mean of vectors — the centroid. Null when there is nothing to mean. */
export function meanVector(vectors: number[][]): number[] | null {
  if (vectors.length === 0) return null;
  const sum = new Array(EMBEDDING_DIM).fill(0);
  for (const v of vectors) {
    for (let i = 0; i < EMBEDDING_DIM; i++) sum[i] += v[i];
  }
  const mag = Math.sqrt(sum.reduce((s, x) => s + x * x, 0));
  if (mag === 0) return null;
  return sum.map((x) => x / mag);
}

interface RawMatch {
  id: string;
  score: number;
  metadata?: Record<string, unknown>;
}

/** Tolerate match-shape variants (id/vectorId, matches/result) like the lure matcher does. */
function normalizeMatches(result: unknown): RawMatch[] {
  const r = result as { matches?: unknown[]; result?: unknown[] } | null;
  const raw = (r?.matches ?? r?.result ?? []) as Record<string, any>[];
  return raw.map((m) => ({
    id: String(m.id ?? m.vectorId ?? ""),
    score: Number(m.score ?? m.confidence ?? 0),
    metadata: (m.metadata as Record<string, unknown>) ?? undefined,
  }));
}

// --- Catch embeddings: catch-<id> with metadata {agent, lure, room} ---

export interface CatchEmbeddingInput {
  id: number;
  agent: string;
  lure: string | null;
  room: number | null;
  text: string;
}

/**
 * Embeds a recorded catch and upserts it as "catch-<id>", linking the D1 row
 * via catches.embedding_id. Returns false (no-op) when the binding is absent
 * or the catch has nothing semantic to say.
 */
export async function embedCatch(env: Env, db: D1Database, input: CatchEmbeddingInput): Promise<boolean> {
  if (!vectorizeAvailable(env)) return false;
  const values = generateEmbedding(input.text);
  if (values.every((v) => v === 0)) return false;
  await env.VECTORIZE_INDEX!.upsert([
    {
      id: `catch-${input.id}`,
      values,
      // Vectorize metadata is scalars-only — nulls coerce to "" / 0.
      metadata: { agent: input.agent, lure: input.lure ?? "", room: input.room ?? 0 },
    },
  ]);
  await db
    .prepare("UPDATE catches SET embedding_id = ? WHERE id = ?")
    .bind(`catch-${input.id}`, input.id)
    .run();
  return true;
}

// --- Room centroids: room-<id> with metadata {name} ---

export interface RoomCentroidResult {
  upserted: boolean;
  vector: number[] | null;
}

/**
 * A room's vector = normalized mean of its catches' vectors (most recent
 * ROOM_CENTROID_CATCH_LIMIT, bounded), plus the catch that minted the room —
 * a fresh room's founding words are its first meaning. Upserts "room-<id>"
 * with metadata {name}. No-op without the binding.
 */
export async function updateRoomCentroid(
  env: Env,
  db: D1Database,
  roomId: number
): Promise<RoomCentroidResult> {
  if (!vectorizeAvailable(env)) return { upserted: false, vector: null };
  const room = await db
    .prepare("SELECT id, name, created_from_catch FROM rooms WHERE id = ?")
    .bind(roomId)
    .first<{ id: number; name: string; created_from_catch: number | null }>();
  if (!room) return { upserted: false, vector: null };
  const { results } = await db
    .prepare(
      `SELECT id, answer, job, payload FROM catches WHERE room = ? OR id = ? ORDER BY id DESC LIMIT ${ROOM_CENTROID_CATCH_LIMIT}`
    )
    .bind(roomId, room.created_from_catch ?? 0)
    .all<{ id: number; answer: string | null; job: string | null; payload: string | null }>();
  const vectors = (results ?? [])
    .map((r) => generateEmbedding(catchText(r)))
    .filter((v) => !v.every((x) => x === 0));
  const centroid = meanVector(vectors);
  if (!centroid) return { upserted: false, vector: null };
  await env.VECTORIZE_INDEX!.upsert([
    { id: `room-${roomId}`, values: centroid, metadata: { name: room.name } },
  ]);
  return { upserted: true, vector: centroid };
}

// --- Neighbor discovery: Vectorize proposes, D1 formalizes ---

export interface DiscoveredEdge {
  to_room: number;
  name: string | null;
}

/**
 * After a room's centroid is upserted, asks Vectorize for the NEIGHBOR_TOP_K
 * nearest room vectors. Any top-3 neighbor not already connected by an edge
 * (either direction — a minted room must not be a trap) gets one, traffic=0,
 * kind='discovered'. Bounded to the minted room's own neighborhood.
 */
export async function discoverNeighbors(
  env: Env,
  db: D1Database,
  roomId: number,
  vector: number[] | null
): Promise<DiscoveredEdge[]> {
  if (!vector || !vectorizeAvailable(env)) return [];
  const result = await env.VECTORIZE_INDEX!.query(vector, {
    topK: DISCOVERY_FETCH_K,
    returnMetadata: true,
  });
  const neighbors = normalizeMatches(result)
    .filter((m) => /^room-\d+$/.test(m.id) && m.id !== `room-${roomId}`)
    .slice(0, NEIGHBOR_TOP_K);

  const discovered: DiscoveredEdge[] = [];
  for (const n of neighbors) {
    const toRoom = parseInt(n.id.slice("room-".length), 10);
    const existing = await db
      .prepare(
        "SELECT 1 AS found FROM edges WHERE (from_room = ? AND to_room = ?) OR (from_room = ? AND to_room = ?)"
      )
      .bind(roomId, toRoom, toRoom, roomId)
      .first<{ found: number }>();
    if (existing) continue;
    await db
      .prepare("INSERT OR IGNORE INTO edges (from_room, to_room, traffic, kind) VALUES (?, ?, 0, 'discovered')")
      .bind(roomId, toRoom)
      .run();
    discovered.push({ to_room: toRoom, name: (n.metadata?.name as string) ?? null });
  }
  return discovered;
}

// --- GET /search?q=... — semantic recall over play ---

interface SearchCatchRow {
  id: number;
  agent: string | null;
  answer: string | null;
  room: number | null;
  room_name: string | null;
}

export async function handleSearch(url: URL, env: Env, cors: Record<string, string>): Promise<Response> {
  const q = (url.searchParams.get("q") || "").trim().slice(0, QUERY_MAX);
  if (!q) {
    return jsonResponse({ success: false, error: "query parameter 'q' is required" }, 400, cors);
  }
  if (!vectorizeAvailable(env)) {
    return jsonResponse(
      {
        success: false,
        error: "vectorize is off — semantic search needs the vector nerves",
        hint: "catches and minting still work; deploy with a VECTORIZE_INDEX binding to grow the nerves",
      },
      503,
      cors
    );
  }
  try {
    const result = await env.VECTORIZE_INDEX!.query(generateEmbedding(q), {
      topK: SEARCH_FETCH_K,
      returnMetadata: true,
    });
    const hits = normalizeMatches(result)
      .filter((m) => /^catch-\d+$/.test(m.id))
      .slice(0, SEARCH_HITS);

    // Join from D1 by id for room names + snippets — best-effort: Vectorize
    // already found them; enrichment failure must not lose the hits.
    const rowsById = new Map<number, SearchCatchRow>();
    try {
      if (hits.length > 0) {
        const ids = hits.map((h) => parseInt(h.id.slice("catch-".length), 10));
        const placeholders = ids.map(() => "?").join(",");
        const { results } = await env.DB
          .prepare(
            `SELECT c.id, c.agent, c.answer, c.room, r.name AS room_name
             FROM catches c LEFT JOIN rooms r ON r.id = c.room
             WHERE c.id IN (${placeholders})`
          )
          .bind(...ids)
          .all<SearchCatchRow>();
        for (const row of results ?? []) rowsById.set(row.id, row);
      }
    } catch {
      // enrichment is opportunistic
    }

    return jsonResponse(
      {
        success: true,
        query: q,
        vectorize: "on",
        count: hits.length,
        hits: hits.map((h) => {
          const id = parseInt(h.id.slice("catch-".length), 10);
          const row = rowsById.get(id);
          return {
            catch_id: id,
            score: h.score,
            room: row?.room ?? null,
            room_name: row?.room_name ?? null,
            agent: row?.agent ?? ((h.metadata?.agent as string) || null),
            snippet: row?.answer ? row.answer.slice(0, SNIPPET_MAX) : null,
          };
        }),
      },
      200,
      cors
    );
  } catch (err: any) {
    return jsonResponse(
      { success: false, error: "vector query failed", detail: err?.message || String(err) },
      503,
      cors
    );
  }
}

// --- GET /rooms/:id/vector — a room's meaning, recomputed on demand ---

export async function handleRoomVector(env: Env, cors: Record<string, string>, rawId: string): Promise<Response> {
  const id = parseInt(rawId, 10);
  if (!Number.isInteger(id) || id < 1 || String(id) !== rawId.trim()) {
    return jsonResponse({ success: false, error: "room not found", room_id: rawId }, 404, cors);
  }
  if (!vectorizeAvailable(env)) {
    return jsonResponse(
      {
        success: false,
        error: "vectorize is off — no vector nerves on this deployment",
        hint: "the reef still builds on D1 alone; deploy with a VECTORIZE_INDEX binding",
      },
      503,
      cors
    );
  }
  try {
    const room = await env.DB
      .prepare("SELECT id, name, created_from_catch FROM rooms WHERE id = ?")
      .bind(id)
      .first<{ id: number; name: string; created_from_catch: number | null }>();
    if (!room) {
      return jsonResponse(
        { success: false, error: "room not found", room_id: id, hint: "GET /map to see the reef so far" },
        404,
        cors
      );
    }
    const { upserted, vector } = await updateRoomCentroid(env, env.DB, id);
    if (!upserted) {
      return jsonResponse(
        { success: true, room_id: id, vector_id: `room-${id}`, name: room.name, dims: EMBEDDING_DIM, vector: null, note: "a silent room — no catches to mean yet" },
        200,
        cors
      );
    }
    return jsonResponse(
      {
        success: true,
        room_id: id,
        vector_id: `room-${id}`,
        name: room.name,
        dims: EMBEDDING_DIM,
        vector,
        note: "a room's meaning is the normalized mean of its catches' vectors",
      },
      200,
      cors
    );
  } catch (err: any) {
    return jsonResponse(
      { success: false, error: "world storage unavailable", detail: err?.message || String(err) },
      503,
      cors
    );
  }
}

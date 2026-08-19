// Catch layer — POST /catches → D1. Catches survive everything.
// If D1 is unavailable the endpoint says so honestly (503) but never hangs.

import {
  Env,
  jsonResponse,
  validateCatchInput,
  getClientIp,
} from "./index-helpers";

const INSERT_SQL = `INSERT INTO catches (agent, job, lure_id, answer, user_agent, source_ip, payload)
VALUES (?, ?, ?, ?, ?, ?, ?)`;

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
    const res = await env.DB.prepare(INSERT_SQL)
      .bind(
        v.value.agent,
        v.value.job,
        v.value.lure_id,
        v.value.answer,
        ua,
        getClientIp(request),
        JSON.stringify(body).slice(0, 64_000)
      )
      .run();
    return jsonResponse(
      {
        success: true,
        recorded: true,
        id: res?.meta?.last_row_id ?? null,
        note: "catch recorded — the trap never sleeps",
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

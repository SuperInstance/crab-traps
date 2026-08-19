// Stats layer — GET /stats aggregates the D1 catch table.
// Pure collection function (throws on D1 trouble) + an HTTP wrapper that maps
// failure to an honest 503, mirroring catches.ts. The acceptance-rate probe
// survives a missing `status` column: absence is cached per isolate.

import { Env, jsonResponse } from "./index-helpers";

export interface LureCount {
  lure_id: string;
  count: number;
}

export interface DayCount {
  day: string; // YYYY-MM-DD
  count: number;
}

export interface AgentCount {
  agent: string;
  count: number;
}

export interface Acceptance {
  available: boolean;
  reason?: string;
  by_status?: Record<string, number>;
  accepted?: number;
  total?: number;
  rate?: number; // 0..1, 3 decimal places
}

export interface CatchStats {
  total: number;
  per_lure: LureCount[];
  per_day: DayCount[];
  top_agents: AgentCount[];
  acceptance: Acceptance;
  generated_at: string;
}

/** Test hook — clear the per-isolate status-column cache. */
export function resetStatsCache(): void {
  statusColumnExists = null;
}

let statusColumnExists: boolean | null = null;

async function countTotal(env: Env): Promise<number> {
  const row = await env.DB.prepare("SELECT COUNT(*) AS total FROM catches").first<{ total: number }>();
  return row?.total ?? 0;
}

async function perLure(env: Env): Promise<LureCount[]> {
  const { results } = await env.DB.prepare(
    `SELECT lure_id, COUNT(*) AS count FROM catches
     WHERE lure_id IS NOT NULL AND lure_id != ''
     GROUP BY lure_id ORDER BY count DESC, lure_id ASC LIMIT 50`
  ).all<LureCount>();
  return results ?? [];
}

async function perDay(env: Env): Promise<DayCount[]> {
  const { results } = await env.DB.prepare(
    `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS count FROM catches
     GROUP BY day ORDER BY day DESC LIMIT 30`
  ).all<DayCount>();
  return results ?? [];
}

async function topAgents(env: Env): Promise<AgentCount[]> {
  const { results } = await env.DB.prepare(
    `SELECT agent, COUNT(*) AS count FROM catches
     GROUP BY agent ORDER BY count DESC, agent ASC LIMIT 10`
  ).all<AgentCount>();
  return results ?? [];
}

async function acceptance(env: Env): Promise<Acceptance> {
  if (statusColumnExists === false) {
    return { available: false, reason: "no status column" };
  }
  let rows: { status: string; count: number }[];
  try {
    const res = await env.DB.prepare(
      "SELECT status, COUNT(*) AS count FROM catches GROUP BY status"
    ).all<{ status: string; count: number }>();
    rows = res.results ?? [];
    statusColumnExists = true;
  } catch (err: any) {
    if (/no such column/i.test(err?.message || String(err))) {
      statusColumnExists = false;
      return { available: false, reason: "no status column" };
    }
    throw err; // real storage trouble — surface as 503 via caller
  }

  const by_status: Record<string, number> = {};
  let total = 0;
  let accepted = 0;
  for (const r of rows) {
    const n = r.count ?? 0;
    by_status[r.status ?? "unknown"] = n;
    total += n;
    if (/accept/i.test(r.status || "")) accepted += n;
  }
  return {
    available: true,
    by_status,
    accepted,
    total,
    rate: total > 0 ? Math.round((accepted / total) * 1000) / 1000 : 0,
  };
}

/** Aggregate everything /stats shows. Throws when D1 is unavailable. */
export async function collectStats(env: Env): Promise<CatchStats> {
  const [total, lures, days, agents, acc] = await Promise.all([
    countTotal(env),
    perLure(env),
    perDay(env),
    topAgents(env),
    acceptance(env),
  ]);
  return {
    total,
    per_lure: lures,
    per_day: days,
    top_agents: agents,
    acceptance: acc,
    generated_at: new Date().toISOString(),
  };
}

/** Total catch count for the badge endpoint. Throws when D1 is unavailable. */
export async function getTotalCatches(env: Env): Promise<number> {
  return countTotal(env);
}

export async function handleStats(
  env: Env,
  cors: Record<string, string>
): Promise<Response> {
  try {
    const stats = await collectStats(env);
    return jsonResponse({ success: true, stats }, 200, cors);
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

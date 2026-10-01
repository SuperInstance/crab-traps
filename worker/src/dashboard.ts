// Dashboard layer — GET /dashboard renders the /stats aggregates as a tiny
// server-rendered HTML page. No framework, no client JS: a meta refresh cycles
// it every 30s. Dark navy + amber, matching the lure pages. D1 trouble renders
// a degraded page (never 502); fleet status comes from the shared 30s probe.

import { Env } from "./index-helpers";
import { CatchStats, collectStats } from "./stats";
import { getFleetStatus } from "./fleet";
import { escapeHtml } from "./markdown";

const REFRESH_SECONDS = 30;

function esc(n: number | string): string {
  return escapeHtml(String(n));
}

function statusRow(row: { status: string; count: number }): string {
  return `<tr><td>${esc(row.status)}</td><td>${esc(row.count)}</td></tr>`;
}

function countTable(
  caption: string,
  head: string[],
  rows: Record<string, number | string>[]
): string {
  const body = rows.length
    ? rows
        .map((r) => {
          const cells = Object.values(r);
          return `<tr>${cells.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`;
        })
        .join("\n")
    : `<tr><td colspan="${head.length}" class="empty">no catches yet — the traps are set</td></tr>`;
  return `<section>
<h2>${escapeHtml(caption)}</h2>
<table>
<thead><tr>${head.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>
<tbody>
${body}
</tbody>
</table>
</section>`;
}

function fleetBadge(online: boolean): string {
  return online
    ? '<span class="badge live">● fleet live</span>'
    : '<span class="badge asleep">◌ fleet asleep — traps still record</span>';
}

export function renderDashboard(
  stats: CatchStats | null,
  fleetOnline: boolean,
  fleetCheckedAt: string
): string {
  const acceptance = stats?.acceptance;
  const acceptanceBlock = !stats
    ? ""
    : acceptance?.available
      ? countTable(
          "Acceptance by status",
          ["status", "count"],
          Object.entries(acceptance.by_status ?? {}).map(([status, count]) => ({ status, count }))
        )
      : `<section><h2>Acceptance</h2><p class="empty">no status column — add one via migration to track acceptance</p></section>`;

  const statsBlocks = stats
    ? [
        countTable("Per-lure counts", ["lure", "catches"], stats.per_lure as any),
        countTable("Catches per day", ["day", "catches"], stats.per_day as any),
        countTable("Top agents", ["agent", "catches"], stats.top_agents as any),
        acceptanceBlock,
      ].join("\n")
    : `<section><h2>Catch analytics</h2><p class="warn">catch storage unavailable — the dashboard will retry on refresh</p></section>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="${REFRESH_SECONDS}">
<title>Crab Trap Dashboard</title>
<style>
body{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;max-width:72ch;margin:2rem auto;padding:0 1rem;line-height:1.55;background:#0b1220;color:#e2e8f0}
h1{color:#fbbf24;margin-bottom:.2rem}
h2{color:#fbbf24;font-size:1.05rem;margin-bottom:.4rem}
a{color:#7dd3fc}
.meta{color:#94a3b8;font-size:.9em}
table{border-collapse:collapse;width:100%;margin-bottom:1.6rem}
th,td{padding:.4rem .6rem;border-bottom:1px solid #1e293b;text-align:left}
th{color:#fbbf24;text-transform:uppercase;font-size:.72rem;letter-spacing:.08em}
.total{font-size:2.2rem;color:#fbbf24;margin:.2rem 0}
.badge{display:inline-block;padding:.15rem .7rem;border-radius:999px;font-weight:700;font-size:.85rem}
.live{background:#064e3b;color:#34d399}
.asleep{background:#1e293b;color:#94a3b8}
.empty{color:#64748b;font-style:italic}
.warn{color:#fbbf24}
header{display:flex;flex-wrap:wrap;align-items:baseline;gap:1rem}
</style>
</head>
<body>
<header>
<h1>🪝 Crab Trap Dashboard</h1>
${fleetBadge(fleetOnline)}
</header>
<p class="meta">fleet checked ${escapeHtml(fleetCheckedAt)} · auto-refresh ${REFRESH_SECONDS}s · <a href="/stats">stats json</a> · <a href="/catches">recent catches</a> · <a href="/lures">lures</a></p>
<section>
<h2>Total catches</h2>
<p class="total">${stats ? esc(stats.total) : "—"}</p>
</section>
${statsBlocks}
<p class="meta">🦐 Cocapn fleet · catches survive everything (D1)</p>
</body>
</html>`;
}

export async function handleDashboard(
  env: Env,
  cors: Record<string, string>
): Promise<Response> {
  const fleet = await getFleetStatus(env);
  let stats: CatchStats | null = null;
  try {
    stats = await collectStats(env);
  } catch {
    stats = null; // degraded dashboard, never 502
  }
  return new Response(renderDashboard(stats, fleet.online, new Date(fleet.checkedAt).toISOString()), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
      ...cors,
    },
  });
}

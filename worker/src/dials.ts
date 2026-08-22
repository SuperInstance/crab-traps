// Dial dashboard — GET /dials renders the elephant's sealed field reads
// straight out of the edge ledger. The loop this closes (orchestration view
// 2026-08-21 §Objective 3): roomd GET /field → POST /edge (sealed double-entry
// edges) → D1 → this page. reading → ledger → display — no client JS, a meta
// refresh cycles it every 5s; D1 trouble degrades (never 502).
//
// The elephant's reading shape (elephant/roomd.py room_field):
//   after = { room, warmth, kappa, dials: {mood, volume, earnestness,
//            cynicism, joke_landing, panic, presence}, messages, ts }
// The seven dials are bipolar for mood / joke_landing ([-1..+1]) and unipolar
// ([0..1]) for the rest. Warmth is signed; κ is concentration. Drift is the
// ledger's own imbalance series — under the elephant's persistence prior each
// imbalance is |Δwarmth|, so mean imbalance over the window is how fast the
// field is moving per read (never faked: unscored edges are excluded).

import { Env } from "./index-helpers";
import { escapeHtml } from "./markdown";
import { edgeHash } from "./edge-ledger";

const REFRESH_SECONDS = 5;
const WINDOW_ROWS = 600; // bounded: rows scanned per render, across all cells
const MAX_CARDS = 12;

const BIPOLAR = new Set(["mood", "joke_landing"]);
const DIAL_ORDER = [
  "mood", "volume", "earnestness", "cynicism", "joke_landing", "panic", "presence",
] as const;

interface EdgeRow {
  v: number;
  cell: string;
  ts: number;
  before: string;
  after: string;
  delta: string;
  imbalance: number | null;
  provenance: string;
  chain: string | null;
  edge_hash: string;
  received_at: string;
}

export interface DialReading {
  room: string;
  warmth: number | null;
  kappa: number | null;
  dials: Record<string, number>;
  messages: number | null;
}

export function parseReading(after: unknown): DialReading | null {
  if (typeof after !== "object" || after === null) return null;
  const a = after as Record<string, unknown>;
  const dials: Record<string, number> = {};
  if (a.dials && typeof a.dials === "object") {
    for (const [k, v] of Object.entries(a.dials as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v)) dials[k] = v;
    }
  }
  if (!Object.keys(dials).length) return null; // not an elephant field read
  return {
    room: typeof a.room === "string" ? a.room : "",
    warmth: typeof a.warmth === "number" ? a.warmth : null,
    kappa: typeof a.kappa === "number" ? a.kappa : null,
    dials,
    messages: typeof a.messages === "number" ? a.messages : null,
  };
}

function esc(n: number | string): string {
  return escapeHtml(String(n));
}

function fmt(n: number | null, digits = 3): string {
  return n === null || !Number.isFinite(n) ? "—" : (n >= 0 ? "+" : "") + n.toFixed(digits);
}

function age(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 90) return `${s}s ago`;
  if (s < 5400) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
}

// A meter row: label, value, and a CSS bar. Bipolar dials center at 0;
// unipolar fill from the left.
function meter(name: string, value: number | undefined): string {
  if (value === undefined) return "";
  const bipolar = BIPOLAR.has(name);
  const pct = bipolar
    ? Math.min(Math.abs(value), 1) * 50
    : Math.min(Math.max(value, 0), 1) * 100;
  const dir = bipolar ? (value >= 0 ? "pos" : "neg") : value >= 0.5 ? "pos" : "neg";
  const bar = bipolar
    ? `<span class="fill ${dir}" style="${value >= 0 ? "left:50%" : "right:50%"};width:${pct}%"></span><span class="mid"></span>`
    : `<span class="fill ${dir}" style="left:0;width:${pct}%"></span>`;
  return `<div class="dial">
<dt>${esc(name)}</dt>
<dd>${fmt(value, 2)}<div class="bar">${bar}</div></dd>
</div>`;
}

// Warmth sparkline: one bar per read in the window (oldest → newest), height
// by |warmth|, sign by color. Pure CSS — no client JS anywhere.
function sparkline(warmths: number[]): string {
  if (warmths.length < 2) return "";
  const bars = warmths
    .map((w) => {
      const h = Math.min(Math.abs(w), 1) * 50;
      return `<span class="spark ${w >= 0 ? "pos" : "neg"}" style="height:${h + 2}%"></span>`;
    })
    .join("");
  return `<div class="sparkline" title="warmth, oldest → newest">${bars}</div>`;
}

export interface RoomCardData {
  cell: string;
  reading: DialReading | null;
  edges: number;
  scored: number;
  meanImbalance: number | null;
  warmthTrend: number | null;
  warmths: number[];
  ts: number;
  head: string;
  chainIntact: boolean;
}

// Group a window of rows (newest-first) into per-cell card data.
export function buildCards(rows: EdgeRow[]): { cards: RoomCardData[]; otherCells: number } {
  const byCell = new Map<string, EdgeRow[]>();
  for (const r of rows) {
    const list = byCell.get(r.cell) ?? [];
    list.push(r);
    byCell.set(r.cell, list);
  }
  const cards: RoomCardData[] = [];
  let otherCells = 0;
  for (const [cell, cellRows] of byCell) {
    const newest = cellRows[0];
    const scoredRows = cellRows.filter((r) => r.imbalance !== null);
    const readings = cellRows
      .map((r) => {
        try {
          return parseReading(JSON.parse(r.after));
        } catch {
          return null;
        }
      })
      .filter((x): x is DialReading => x !== null);
    const warmths = readings
      .map((r) => r.warmth)
      .filter((w): w is number => w !== null)
      .reverse(); // oldest → newest
    cards.push({
      cell,
      reading: (() => {
        try {
          return parseReading(JSON.parse(newest.after));
        } catch {
          return null;
        }
      })(),
      edges: cellRows.length,
      scored: scoredRows.length,
      meanImbalance: scoredRows.length
        ? scoredRows.reduce((s, r) => s + (r.imbalance ?? 0), 0) / scoredRows.length
        : null,
      warmthTrend:
        warmths.length >= 2 ? warmths[warmths.length - 1] - warmths[0] : null,
      warmths,
      ts: newest.ts,
      head: newest.edge_hash,
      chainIntact: true, // filled by verifyWindow
    });
    if (!cards[cards.length - 1].reading) otherCells++;
  }
  cards.sort((a, b) => b.ts - a.ts);
  return { cards, otherCells };
}

// Seal + link check over a cell's window (newest-first rows) — the same walk
// as GET /edges?verify=1, inlined so the page stays one query + one pass.
export async function verifyWindow(rows: EdgeRow[]): Promise<boolean> {
  const oldestFirst = [...rows].reverse();
  for (let i = 0; i < oldestFirst.length; i++) {
    const row = oldestFirst[i];
    let recomputed: string;
    try {
      recomputed = await edgeHash({
        v: row.v,
        cell: row.cell,
        ts: row.ts,
        before: JSON.parse(row.before),
        after: JSON.parse(row.after),
        delta: JSON.parse(row.delta),
        imbalance: row.imbalance,
        provenance: JSON.parse(row.provenance),
      });
    } catch {
      return false;
    }
    if (recomputed !== row.edge_hash) return false;
    if (i > 0 && row.chain !== oldestFirst[i - 1].edge_hash) return false;
  }
  return true;
}

function roomCard(c: RoomCardData): string {
  const room = c.reading?.room || c.cell.replace(/^room\.field\./, "");
  const dialsHtml = DIAL_ORDER.map((d) => meter(d, c.reading?.dials[d])).join("");
  const drift = c.meanImbalance === null
    ? '<span class="empty">unscored</span>'
    : `${fmt(c.meanImbalance, 4)}/read`;
  const trend = c.warmthTrend === null
    ? '<span class="empty">—</span>'
    : `${c.warmthTrend >= 0 ? "↗" : "↘"} ${fmt(c.warmthTrend, 3)}`;
  return `<section class="card">
<header><h2>${esc(room)}</h2>
<span class="meta">${esc(age(c.ts))} · ${c.edges} edge${c.edges === 1 ? "" : "s"} · ${c.reading?.messages ?? "?"} msgs</span>
<span class="badge ${c.chainIntact ? "live" : "asleep"}">${c.chainIntact ? "● chain intact" : "⚠ chain broken"}</span></header>
<div class="bignum">
<div><dt>warmth</dt><dd>${fmt(c.reading?.warmth ?? null, 3)}</dd></div>
<div><dt>κ</dt><dd>${c.reading?.kappa === null || c.reading?.kappa === undefined ? "—" : c.reading.kappa.toFixed(3)}</dd></div>
<div><dt>drift</dt><dd>${drift}</dd><span class="meta">${trend}</span></div>
</div>
<dl class="dials">${dialsHtml}</dl>
${sparkline(c.warmths)}
<p class="meta">cell ${esc(c.cell)} · head <code>${esc(c.head.slice(0, 12))}…</code> · <a href="/edges?cell=${encodeURIComponent(c.cell)}&verify=1">ledger</a></p>
</section>`;
}

export function renderDials(
  cards: RoomCardData[],
  otherCells: number,
  totalEdges: number,
  degraded: boolean
): string {
  const cardsHtml = degraded
    ? `<p class="warn">ledger storage unavailable — the dials will retry on refresh</p>`
    : cards.length
      ? cards.slice(0, MAX_CARDS).map(roomCard).join("\n") +
        (cards.length > MAX_CARDS
          ? `<p class="meta">+ ${cards.length - MAX_CARDS} more cells — raise the window</p>`
          : "")
      : `<section><h2>No elephant edges yet</h2>
<p class="empty">the limb hasn't spoken — seal a field read and push it:</p>
<pre>curl -X POST /edge -d '{"v":1,"cell":"room.field.sauna","ts":1,"before":null,
  "after":{"room":"sauna","warmth":0.1,"kappa":1.2,"dials":{"mood":0.5}},
  "delta":{"before":null,"after":0.1,"changed":false,"magnitude":null},
  "imbalance":null,"provenance":{"origin":"push","caller":"elephant-roomd"},
  "chain":null}'</pre>
<p class="meta">or, from the elephant repo: <code>./scripts/demo_dial_loop.sh</code></p></section>`;
  const other = otherCells
    ? `<p class="meta">${otherCells} non-field cell${otherCells === 1 ? "" : "s"} in the window — see <a href="/queue">/queue</a></p>`
    : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="${REFRESH_SECONDS}">
<title>Dial Dashboard — the elephant, live</title>
<style>
body{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;max-width:76ch;margin:2rem auto;padding:0 1rem;line-height:1.5;background:#0b1220;color:#e2e8f0}
h1{color:#fbbf24;margin-bottom:.2rem}
h2{color:#fbbf24;font-size:1.05rem;margin:0}
a{color:#7dd3fc}
.meta{color:#94a3b8;font-size:.85em}
code{color:#94a3b8}
.empty{color:#64748b;font-style:italic}
.warn{color:#fbbf24}
pre{background:#111a2e;padding:.7rem;border-radius:.4rem;overflow-x:auto;font-size:.8em;color:#94a3b8}
header{display:flex;flex-wrap:wrap;align-items:baseline;gap:1rem}
.card{border:1px solid #1e293b;border-radius:.6rem;padding:1rem 1.2rem;margin-bottom:1.4rem;background:#0e1626}
.card header{margin-bottom:.7rem}
.badge{display:inline-block;padding:.12rem .6rem;border-radius:999px;font-weight:700;font-size:.75rem}
.live{background:#064e3b;color:#34d399}
.asleep{background:#451a03;color:#fbbf24}
.bignum{display:flex;gap:2.2rem;align-items:baseline;margin:.4rem 0 .9rem;flex-wrap:wrap}
.bignum dt{color:#94a3b8;font-size:.72rem;text-transform:uppercase;letter-spacing:.08em}
.bignum dd{font-size:1.9rem;color:#fbbf24;margin:0}
.dials{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:.5rem 1.4rem;margin:0}
.dial{display:flex;justify-content:space-between;align-items:baseline;gap:.6rem}
.dial dt{color:#94a3b8;font-size:.85em}
.dial dd{margin:0;min-width:120px;font-variant-numeric:tabular-nums}
.bar{position:relative;height:6px;background:#1e293b;border-radius:3px;margin-top:3px;overflow:hidden}
.fill{position:absolute;top:0;bottom:0}
.fill.pos{background:#34d399}
.fill.neg{background:#f87171}
.mid{position:absolute;left:50%;top:-2px;bottom:-2px;width:1px;background:#475569}
.sparkline{display:flex;align-items:center;gap:2px;height:36px;margin:.8rem 0 .3rem}
.spark{width:6px;border-radius:2px 2px 0 0;align-self:center}
.spark.pos{background:#34d39966}
.spark.neg{background:#f8717166}
</style>
</head>
<body>
<header>
<h1>🌡️ Dial Dashboard</h1>
<span class="meta">the elephant's sealed field reads · ${totalEdges} edge${totalEdges === 1 ? "" : "s"} in window · refresh ${REFRESH_SECONDS}s · <a href="/queue">queue json</a></span>
</header>
<p class="meta">reading → ledger → display: every read seals into the chain (POST /edge) before it lands here · drift = mean |Δwarmth| per read (the imbalance series)</p>
${cardsHtml}
${other}
<p class="meta">🦐 crab-traps edge ledger · seals verify per render — tamper with D1 and the badges go dark</p>
</body>
</html>`;
}

export async function handleDials(env: Env, cors: Record<string, string>): Promise<Response> {
  let rows: EdgeRow[] = [];
  try {
    const { results } = await env.DB.prepare(
      `SELECT v, cell, ts, "before", "after", delta, imbalance, provenance, chain, edge_hash, received_at
       FROM ledger_edges WHERE cell LIKE 'room.field.%' ORDER BY ts DESC LIMIT ?`
    )
      .bind(WINDOW_ROWS)
      .all<EdgeRow>();
    rows = results ?? [];
  } catch {
    return new Response(renderDials([], 0, 0, true), {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache", ...cors },
    });
  }

  const { cards, otherCells } = buildCards(rows);
  const byCell = new Map<string, EdgeRow[]>();
  for (const r of rows) {
    const list = byCell.get(r.cell) ?? [];
    list.push(r);
    byCell.set(r.cell, list);
  }
  await Promise.all(
    [...byCell.entries()].map(async ([cell, cellRows]) => {
      const card = cards.find((c) => c.cell === cell);
      if (card) card.chainIntact = await verifyWindow(cellRows);
    })
  );
  return new Response(renderDials(cards, otherCells, rows.length, false), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache", ...cors },
  });
}

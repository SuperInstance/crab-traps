// worker/src/index.ts — Crab Trap Funnel v5
// Autonomous trap layer:
//   /lures, /lures/:name, /random-lure — lures bundled at build time (zero state)
//   POST /catches — D1 persistence (catches survive everything)
//   /fleet/* — 5s-timeout proxy to the home PLATO boat, friendly stub when asleep
//   /health — worker + fleet + d1 status
//   per-IP rate limiting on /catches and /fleet/* (bounded in-memory LRU)
// Plus the existing domain pages, AI bot trap, and Vectorize RAG matching.

import { PAGES } from "./pages.js";
import { LURE_FILES } from "./lures-data.js";
import {
  Env,
  RateLimiter,
  getClientIp,
  resolveLureFormat,
  jsonResponse,
  htmlResponse,
  detectBot,
  corsHeaders,
  generateEmbedding,
} from "./index-helpers";
import {
  Lure,
  buildLureIndex,
  findLure,
  lureSummaries,
  randomLure,
} from "./lure-store";
import { renderLureIndexPage, renderLurePage } from "./markdown";
import { handleCatchPost, handleCatchList } from "./catches";
import { handleFleetProxy, getFleetStatus } from "./fleet";
import { handleStats } from "./stats";
import { handleDashboard } from "./dashboard";

const VERSION = "5.1.0";

// Lure index is built once per isolate from the bundle — zero state, zero failure.
const LURES = buildLureIndex(LURE_FILES);

// Per-IP limits: 30 catches/min, 60 fleet proxies/min, 10k tracked IPs per isolate.
const CATCH_LIMITER = new RateLimiter(10_000, 60_000, 30);
const FLEET_LIMITER = new RateLimiter(10_000, 60_000, 60);

interface QueryMatch {
  id: string;
  score: number;
  metadata: {
    lure_path: string;
    lure_content: string;
    lure_length: number;
  };
}

async function handleLureMatch(request: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  try {
    const body: { user_agent?: string; agent_name?: string } = await request.json();
    const ua = body.user_agent || "";
    const agentName = body.agent_name || body.user_agent || "unknown";

    const index = env.VECTORIZE_INDEX as any;
    const queryEmbedding = generateEmbedding(`${ua} ${agentName}`);

    const queryResult = await index.query(queryEmbedding, {
      topK: 5,
      returnMetadata: true,
    });

    const matches: QueryMatch[] = (queryResult.matches || queryResult.result || []).map((m: any) => ({
      id: m.id || m.vectorId,
      score: m.score || m.confidence || 0,
      metadata: {
        lure_path: m.metadata?.lure_path || "",
        lure_content: m.metadata?.lure_content || "",
        lure_length: m.metadata?.lure_length || 0,
      },
    }));

    return jsonResponse({
      success: true,
      agent: agentName,
      user_agent: ua,
      match: matches[0] || null,
      alternatives: matches.slice(1),
    }, 200, cors);
  } catch (err: any) {
    return jsonResponse({
      success: false,
      error: err.message || "Internal error",
    }, 400, cors);
  }
}

async function handleApiInfo(cors: Record<string, string>): Promise<Response> {
  return jsonResponse({
    name: "crab-trap-funnel",
    version: VERSION,
    api: {
      "GET /lures": "List all lures (json | html | md via ?format=)",
      "GET /lures/:name": "One lure by id (category/name) or unique name",
      "GET /random-lure": "Random lure (never a category README)",
      "POST /catches": "Record a catch. Payload: { agent, job?, lure_id?, answer? }",
      "GET /catches": "Recent catches. Query: ?limit=1..100&agent=",
      "ANY /fleet/*": "Proxy to the home PLATO fleet (5s timeout, stub when asleep)",
      "GET /stats": "Catch analytics: totals, per-lure, per-day, top agents, acceptance",
      "GET /dashboard": "HTML dashboard of the /stats aggregates (30s refresh)",
      "GET /health": "Worker + fleet + D1 health",
      "POST /api/lure/match": "Find best-matching lure for an AI agent. Payload: { user_agent, agent_name }",
      "GET /api/status": "Health check",
    },
    domains: Object.keys(PAGES).filter((k) => k !== "trap"),
    bot_trap: true,
  }, 200, cors);
}

function handleStatus(cors: Record<string, string>): Response {
  return jsonResponse({
    status: "ok",
    uptime: Date.now(),
    bot_detection: ["openai", "claude", "deepseek", "moonshot", "perplexity", "bytedance"],
    pages_loaded: Object.keys(PAGES).length,
    lures_loaded: LURES.length,
    version: VERSION,
  }, 200, cors);
}

async function handleHealth(env: Env, cors: Record<string, string>): Promise<Response> {
  const fleet = await getFleetStatus(env);
  let d1 = "ok";
  try {
    await env.DB.prepare("SELECT 1").first();
  } catch {
    d1 = "unavailable";
  }
  return jsonResponse({
    status: "ok",
    worker: "crab-trap-funnel",
    version: VERSION,
    fleet: fleet.online ? "online" : "asleep",
    fleet_checked_at: new Date(fleet.checkedAt).toISOString(),
    d1,
    lures_loaded: LURES.length,
  }, 200, cors);
}

// --- Lure layer handlers (stateless — served from the bundle) ---

function mdResponse(text: string, cacheSecs: number, cors: Record<string, string>): Response {
  return new Response(text, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": `public, max-age=${cacheSecs}`,
      ...cors,
    },
  });
}

function lureResponse(lure: Lure, format: "json" | "html" | "md", cors: Record<string, string>): Response {
  if (format === "md") return mdResponse(lure.content, 300, cors);
  if (format === "html") return htmlResponse(renderLurePage(lure), 300);
  return jsonResponse({
    success: true,
    lure: {
      id: lure.id,
      category: lure.category,
      name: lure.name,
      title: lure.title,
      bytes: lure.bytes,
      content: lure.content,
    },
  }, 200, cors);
}

function handleLureList(request: Request, url: URL, cors: Record<string, string>): Response {
  const format = resolveLureFormat(url, request);
  const summaries = lureSummaries(LURES);
  if (format === "html") return htmlResponse(renderLureIndexPage(summaries), 300);
  if (format === "md") {
    const md = [
      "# Crab Trap Lures",
      "",
      ...summaries.map((s) => `- [${s.title}](/lures/${s.id})`),
    ].join("\n");
    return mdResponse(md, 300, cors);
  }
  return jsonResponse({
    success: true,
    count: summaries.length,
    lures: summaries,
  }, 200, cors);
}

function handleLureGet(request: Request, url: URL, cors: Record<string, string>, rawName: string): Response {
  let query = rawName;
  try {
    query = decodeURIComponent(rawName);
  } catch {
    // fall through with the raw value — findLure will report not_found
  }
  const lookup = findLure(LURES, query);
  if (lookup.status === "found") {
    return lureResponse(lookup.lure, resolveLureFormat(url, request), cors);
  }
  if (lookup.status === "ambiguous") {
    return jsonResponse({
      success: false,
      error: "ambiguous lure name",
      name: lookup.name,
      candidates: lookup.candidates,
      hint: "use the full id (category/name)",
    }, 404, cors);
  }
  return jsonResponse({
    success: false,
    error: "lure not found",
    query,
  }, 404, cors);
}

function handleRandomLure(request: Request, url: URL, cors: Record<string, string>): Response {
  const lure = randomLure(LURES);
  if (!lure) {
    return jsonResponse({ success: false, error: "no lures available" }, 404, cors);
  }
  const format = resolveLureFormat(url, request);
  if (format === "json") {
    return jsonResponse({
      success: true,
      lure: {
        id: lure.id,
        category: lure.category,
        name: lure.name,
        title: lure.title,
        bytes: lure.bytes,
        content: lure.content,
      },
    }, 200, { "Cache-Control": "no-cache", ...cors });
  }
  return lureResponse(lure, format, cors);
}

// --- Main fetch handler ---

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const ua = request.headers.get("user-agent") || "";
    const url = new URL(request.url);
    const host = (request.headers.get("host") || "").replace(/:\d+$/, "");
    const origin = request.headers.get("Origin");
    const cors = corsHeaders(origin);
    const pathname = url.pathname;

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    function rateLimited(decision: { allowed: boolean; retryAfterMs: number }): Response | null {
      if (decision.allowed) return null;
      return jsonResponse({
        error: "rate_limited",
        retry_after_s: Math.ceil(decision.retryAfterMs / 1000),
      }, 429, {
        "Retry-After": String(Math.ceil(decision.retryAfterMs / 1000)),
        ...cors,
      });
    }

    // --- API Routes (legacy /api/*) ---
    if (pathname === "/api" || pathname.startsWith("/api/")) {
      if (request.method === "GET") {
        if (pathname === "/api/lure/match") {
          return jsonResponse({
            error: "Use POST with JSON body: { user_agent, agent_name }",
          }, 400, cors);
        }
        if (pathname === "/api/status") return handleStatus(cors);
        if (pathname === "/api" || pathname === "/api/") return handleApiInfo(cors);
      }

      if (request.method === "POST" && pathname === "/api/lure/match") {
        return handleLureMatch(request, env, cors);
      }

      return jsonResponse({ error: "Not found" }, 404, cors);
    }

    // --- Lure layer: bundled, stateless ---
    if (pathname === "/lures" || pathname === "/lures/") {
      if (request.method !== "GET") {
        return jsonResponse({ error: "method not allowed" }, 405, cors);
      }
      return handleLureList(request, url, cors);
    }
    if (pathname.startsWith("/lures/")) {
      if (request.method !== "GET") {
        return jsonResponse({ error: "method not allowed" }, 405, cors);
      }
      return handleLureGet(request, url, cors, pathname.slice("/lures/".length));
    }
    if (pathname === "/random-lure") {
      if (request.method !== "GET") {
        return jsonResponse({ error: "method not allowed" }, 405, cors);
      }
      return handleRandomLure(request, url, cors);
    }

    // --- Catch layer: D1 ---
    if (pathname === "/catches") {
      const limited = rateLimited(CATCH_LIMITER.check(getClientIp(request)));
      if (limited) return limited;
      if (request.method === "POST") return handleCatchPost(request, env, cors);
      if (request.method === "GET") return handleCatchList(url, env, cors);
      return jsonResponse({ error: "method not allowed" }, 405, cors);
    }

    // --- Stats layer: D1 aggregates ---
    if (pathname === "/stats") {
      if (request.method !== "GET") {
        return jsonResponse({ error: "method not allowed" }, 405, cors);
      }
      return handleStats(env, cors);
    }
    if (pathname === "/dashboard") {
      if (request.method !== "GET") {
        return jsonResponse({ error: "method not allowed" }, 405, cors);
      }
      return handleDashboard(env, cors);
    }

    // --- Fleet health proxy: 5s timeout, never hang, never 502 ---
    if (pathname === "/fleet" || pathname.startsWith("/fleet/")) {
      const limited = rateLimited(FLEET_LIMITER.check(getClientIp(request)));
      if (limited) return limited;
      const subpath = pathname.slice("/fleet".length).replace(/^\//, "");
      return handleFleetProxy(request, env, cors, subpath);
    }

    // --- Health ---
    if (pathname === "/health") {
      return handleHealth(env, cors);
    }

    // --- Bot detection — serve trap page ---
    const bot = detectBot(ua);
    if (bot || pathname === "/trap") {
      const name = bot ? bot.name : "unknown";
      console.log("Bot:", name, "at", host, pathname);
      return new Response(PAGES["trap"], {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "X-Robots-Tag": "all",
          "Cache-Control": "no-cache",
        },
      });
    }

    // --- Serve domain landing page ---
    if (pathname === "/" || pathname === "/index.html") {
      const page = PAGES[host];
      if (page) return htmlResponse(page);
    }

    // Fallback
    return htmlResponse(PAGES["cocapn.ai"] || PAGES["trap"]);
  },
};

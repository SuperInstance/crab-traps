// worker/src/index.ts — Crab Trap Funnel v6
// Autonomous trap layer:
//   /lures, /lures/:name, /random-lure — lures bundled at build time (zero state)
//   POST /catches — D1 persistence (catches survive everything)
//   /enter, /look, /go, /interact, /map, /lineage/room/:id — the self-building
//   reef: world = D1 rooms/objects/edges, every catch may mint a brick
//   /scene/:room — reef room → terrain scene.json (the beam: the MUD stays the
//   truth, terrain's contract makes it walkable)
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
import {
  handleEnter,
  handleLook,
  handleGo,
  handleInteract,
  handleMap,
  handleRoomLineage,
  handleRoomDescription,
} from "./reef";
import { handleBreedCron, handleGenealogy, handleLureLineage } from "./breeding";
import { handleFleetProxy, getFleetStatus } from "./fleet";
import { handleScene } from "./scene";
import { handleStats } from "./stats";
import { handleDashboard } from "./dashboard";
import { wanderHtml } from "./wander";
import { handleCatchesBadge } from "./badge";
import { handleSearch, handleRoomVector, vectorizeAvailable } from "./vectors";

const VERSION = "6.1.1";

// Lure index is built once per isolate from the bundle — zero state, zero failure.
const LURES = buildLureIndex(LURE_FILES);

// Per-IP limits: 30 catches/min, 60 fleet proxies/min, 120 world moves/min
// (/enter + /go are D1 writes: unbounded agents-row floods and edge-traffic
// inflation), 10k tracked IPs per isolate.
const CATCH_LIMITER = new RateLimiter(10_000, 60_000, 30);
const FLEET_LIMITER = new RateLimiter(10_000, 60_000, 60);
const REEF_LIMITER = new RateLimiter(10_000, 60_000, 120);

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
      "POST /catches": "Record a catch. Payload: { agent, job?, lure_id?, answer?, room? } — on the 5th/12th catch in a room the reef grows",
      "POST /catch": "Alias of POST /catches (the design's canonical path)",
      "GET /catches": "Recent catches. Query: ?limit=1..100&agent=",
      "GET /enter?agent=NAME": "Enter the reef: assigned a starting room, returns state {agent, room}",
      "GET /look?agent=NAME": "The agent's current room: name, description, objects, exits",
      "GET /go?agent=NAME&to=ROOM": "Traverse an edge (id or name); reinforces the ant-trail traffic",
      "POST /interact?agent=NAME&obj=X": "Touch an object — returns its lore",
      "GET /map": "The reef so far: all rooms + edges (traffic and kind: traveled vs discovered)",
      "GET /lineage/room/:id": "Which catches built this room — the genealogy is public",
      "GET /lineage/lure/:id": "One lure's breeding record: parents, children, catches",
      "GET /genealogy": "The whole lure breeding tree as JSON (bounded)",
      "GET /rooms/:id/description": "The reef speaks: the room's assembled description, field-tinted when the elephant passes ?warmth=0..1",
      "GET /scene/:room": "Reef room → terrain scene.json (the contract terrain_core.py compiles: room, description, theme, floor/walls/ceiling, objects, exits, lights, camera)",
      "GET /search?q=...": "Semantic search over catch embeddings (Vectorize top-8; room names + snippets joined from D1)",
      "GET /rooms/:id/vector": "A room's meaning: normalized centroid of its catch vectors, recomputed + upserted on demand",
      "ANY /fleet/*": "Proxy to the home PLATO fleet (5s timeout, stub when asleep)",
      "GET /stats": "Catch analytics: totals, per-lure, per-day, top agents, acceptance",
      "GET /wander": "The human front door — dual-pane MUD + rendered scene, one command drives both, state downloadable as JSON",
      "GET /dashboard": "HTML dashboard of the /stats aggregates (30s refresh)",
      "GET /badge/catches.svg": "Shields-style SVG badge with the live catch count",
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
  // Catch-layer status: same connection, one step further — can we count catches?
  const catchLayer: Record<string, unknown> = { status: "ok", total_catches: null };
  try {
    const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM catches").first<{ n: number }>();
    catchLayer.total_catches = row?.n ?? 0;
  } catch {
    catchLayer.status = "unavailable";
  }
  return jsonResponse({
    status: "ok",
    worker: "crab-trap-funnel",
    version: VERSION,
    fleet: fleet.online ? "online" : "asleep",
    fleet_checked_at: new Date(fleet.checkedAt).toISOString(),
    d1,
    catch_layer: catchLayer,
    vectorize: vectorizeAvailable(env) ? "on" : "off",
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
    if (pathname === "/catches" || pathname === "/catch") {
      const limited = rateLimited(CATCH_LIMITER.check(getClientIp(request)));
      if (limited) return limited;
      if (request.method === "POST") return handleCatchPost(request, env, cors);
      if (request.method === "GET" && pathname === "/catches") return handleCatchList(url, env, cors);
      return jsonResponse({ error: "method not allowed" }, 405, cors);
    }

    // --- Reef layer: the self-building world (D1 rooms/objects/edges) ---
    if (pathname === "/enter") {
      if (request.method !== "GET") return jsonResponse({ error: "method not allowed" }, 405, cors);
      const limited = rateLimited(REEF_LIMITER.check(getClientIp(request)));
      if (limited) return limited;
      return handleEnter(url, env, cors);
    }
    if (pathname === "/look") {
      if (request.method !== "GET") return jsonResponse({ error: "method not allowed" }, 405, cors);
      return handleLook(url, env, cors);
    }
    if (pathname === "/go") {
      if (request.method !== "GET") return jsonResponse({ error: "method not allowed" }, 405, cors);
      const limited = rateLimited(REEF_LIMITER.check(getClientIp(request)));
      if (limited) return limited;
      return handleGo(url, env, cors);
    }
    if (pathname === "/interact") {
      if (request.method !== "POST") return jsonResponse({ error: "method not allowed" }, 405, cors);
      return handleInteract(url, env, cors);
    }
    if (pathname === "/map") {
      if (request.method !== "GET") return jsonResponse({ error: "method not allowed" }, 405, cors);
      return handleMap(env, cors);
    }
    if (pathname.startsWith("/lineage/room/")) {
      if (request.method !== "GET") {
        return jsonResponse({ error: "method not allowed" }, 405, cors);
      }
      return handleRoomLineage(env, cors, pathname.slice("/lineage/room/".length));
    }
    if (pathname.startsWith("/lineage/lure/")) {
      if (request.method !== "GET") {
        return jsonResponse({ error: "method not allowed" }, 405, cors);
      }
      return handleLureLineage(env, cors, pathname.slice("/lineage/lure/".length));
    }
    if (pathname === "/genealogy") {
      if (request.method !== "GET") {
        return jsonResponse({ error: "method not allowed" }, 405, cors);
      }
      return handleGenealogy(env, cors);
    }

    // --- Vector nerves: semantic search + room centroids (P3) ---
    if (pathname === "/search") {
      if (request.method !== "GET") {
        return jsonResponse({ error: "method not allowed" }, 405, cors);
      }
      return handleSearch(url, env, cors);
    }
    if (pathname.startsWith("/rooms/") && pathname.endsWith("/vector")) {
      if (request.method !== "GET") {
        return jsonResponse({ error: "method not allowed" }, 405, cors);
      }
      return handleRoomVector(env, cors, pathname.slice("/rooms/".length, pathname.length - "/vector".length));
    }
    if (pathname.startsWith("/rooms/") && pathname.endsWith("/description")) {
      if (request.method !== "GET") {
        return jsonResponse({ error: "method not allowed" }, 405, cors);
      }
      return handleRoomDescription(url, env, cors, pathname.slice("/rooms/".length, pathname.length - "/description".length));
    }

    // --- Terrain beam: reef room → scene.json (the compile contract) ---
    if (pathname.startsWith("/scene/")) {
      if (request.method !== "GET") {
        return jsonResponse({ error: "method not allowed" }, 405, cors);
      }
      return handleScene(env, cors, pathname.slice("/scene/".length));
    }

    // --- Stats layer: D1 aggregates ---
    if (pathname === "/stats") {
      if (request.method !== "GET") {
        return jsonResponse({ error: "method not allowed" }, 405, cors);
      }
      return handleStats(env, cors);
    }
    if (pathname === "/wander") {
      return new Response(wanderHtml(), {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-cache",
          ...cors,
        },
      });
    }
    if (pathname === "/dashboard") {
      if (request.method !== "GET") {
        return jsonResponse({ error: "method not allowed" }, 405, cors);
      }
      return handleDashboard(env, cors);
    }
    if (pathname === "/badge/catches.svg") {
      if (request.method !== "GET") {
        return jsonResponse({ error: "method not allowed" }, 405, cors);
      }
      return handleCatchesBadge(env);
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

  // --- Scheduled: the cold-path flywheel (P4, hourly cron) ---
  async scheduled(_controller: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    try {
      const report = await handleBreedCron(env);
      const bred = report.child
        ? ` child ${report.child.id} (${report.child.name}, gen ${report.child.generation})`
        : "";
      console.log(
        `[breeding] ${report.hour}: ${report.bred ? "bred" : "skipped"} — ${report.reason ?? "ok"}` +
          `${bred} · retired ${report.retired.length} · fitness updated ${report.fitness_updated}`
      );
    } catch (err) {
      console.error("[breeding] cron failed:", err);
    }
  },
};

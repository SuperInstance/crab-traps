// worker/src/index.ts — Crab Trap Funnel v4
// Serves 21 domain landing pages + AI bot trap + RAG lure matching via Vectorize
// Pages data imported from generated pages.js (built by scripts/build.mjs)

import { PAGES } from "./pages.js";

const AI_BOTS: { p: string; n: string }[] = [
  { p: "GPTBot", n: "openai" },
  { p: "ChatGPT-User", n: "chatgpt" },
  { p: "ClaudeBot", n: "claude" },
  { p: "anthropic-ai", n: "anthropic" },
  { p: "Google-Extended", n: "google" },
  { p: "Bytespider", n: "bytedance" },
  { p: "CCBot", n: "commoncrawl" },
  { p: "PerplexityBot", n: "perplexity" },
  { p: "YouBot", n: "youcom" },
  { p: "KimiBot", n: "moonshot" },
  { p: "DeepSeek", n: "deepseek" },
  { p: "Meta-ExternalAgent", n: "meta" },
  { p: "cohere-ai", n: "cohere" },
  { p: "AI2Bot", n: "allen" },
  { p: "OmgiliBot", n: "omgili" },
  { p: "SemrushBot", n: "semrush" },
  { p: "AhrefsBot", n: "ahrefs" },
  { p: "DotBot", n: "moz" },
];

// Allowed origins for CORS on API endpoints
const API_ORIGINS = [
  "https://superinstance.ai",
  "https://fleet.superinstance.ai",
  "http://localhost:8787",
  "http://localhost:8800",
];

interface Env {
  CRAB_TRAP_LURES: Fetcher; // Vectorize index binding
}

interface LureVector {
  id: string;
  values: number[];
  metadata: {
    lure_path: string;
    lure_content: string;
    lure_length: number;
  };
}

interface QueryMatch {
  id: string;
  score: number;
  metadata: {
    lure_path: string;
    lure_content: string;
    lure_length: number;
  };
}

function corsHeaders(origin: string | null): Record<string, string> {
  const allowOrigin = origin && API_ORIGINS.includes(origin) ? origin : "https://superinstance.ai";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

function jsonResponse(data: unknown, status: number = 200, cors: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...cors,
    },
  });
}

function htmlResponse(html: string, cacheSecs: number = 3600): Response {
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": `public, max-age=${cacheSecs}`,
    },
  });
}

function detectBot(ua: string): { name: string } | null {
  const bot = AI_BOTS.find((b) => ua.includes(b.p));
  return bot ? { name: bot.n } : null;
}

// --- Embedding generation (deterministic, matches Python vectorize-lures.py) ---

const EMBEDDING_DIM = 384;

function tokenize(text: string): string[] {
  const lower = text.toLowerCase();
  const tokens = lower.match(/[a-z][a-z]+/g) || [];
  return tokens.filter((t) => t.length >= 2);
}

function hashFeature(token: string, dim: number): number {
  let hash = 0;
  for (let i = 0; i < token.length; i++) {
    const char = token.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return ((hash % dim) + dim) % dim;
}

function generateEmbedding(text: string): number[] {
  const tokens = tokenize(text);
  if (tokens.length === 0) return new Array(EMBEDDING_DIM).fill(0);

  const tf: Record<string, number> = {};
  for (const t of tokens) {
    tf[t] = (tf[t] || 0) + 1;
  }

  const maxTf = Math.max(...Object.values(tf), 1);
  const vec = new Array(EMBEDDING_DIM).fill(0);

  for (const [token, count] of Object.entries(tf)) {
    const dim = hashFeature(token, EMBEDDING_DIM);
    vec[dim] += count / maxTf;
  }

  // L2 normalize
  const mag = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  if (mag > 0) {
    for (let i = 0; i < vec.length; i++) vec[i] /= mag;
  }

  return vec;
}

function extractLureContent(filepath: string): string {
  // The metadata stores the lure path, we use it as-is
  return filepath;
}

// --- Handlers ---

async function handleLureMatch(request: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  try {
    const body: { user_agent?: string; agent_name?: string } = await request.json();
    const ua = body.user_agent || "";
    const agentName = body.agent_name || body.user_agent || "unknown";

    // Get the Vectorize index binding
    const index = env.CRAB_TRAP_LURES as any;

    // Generate embedding from user agent + agent name
    const queryEmbedding = generateEmbedding(`${ua} ${agentName}`);

    // Query Vectorize
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

    const bestMatch = matches[0] || null;

    return jsonResponse({
      success: true,
      agent: agentName,
      user_agent: ua,
      match: bestMatch,
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
    version: "4.0.0",
    api: {
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
    bot_detection: AI_BOTS.map((b) => b.n),
    pages_loaded: Object.keys(PAGES).length,
  }, 200, cors);
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

    // --- API Routes ---
    if (pathname.startsWith("/api/")) {
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

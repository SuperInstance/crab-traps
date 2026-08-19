// Pure helper functions extracted from index.ts for testability
// These are the same functions used by the Worker — extracted so they can be unit tested
// without needing the Cloudflare Workers runtime.

export const AI_BOTS: { p: string; n: string }[] = [
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

const API_ORIGINS = [
  "https://superinstance.ai",
  "https://fleet.superinstance.ai",
  "http://localhost:8787",
  "http://localhost:8800",
];

export const EMBEDDING_DIM = 384;

// --- Env shape (shared by all route modules) ---

export interface Env {
  VECTORIZE_INDEX: Fetcher; // Vectorize index binding for lure matching
  AI: any; // Workers AI for embedding
  DB: D1Database; // D1 — catch persistence (survives everything)
  FLEET_BASE_URL?: string; // home PLATO fleet base URL (defaults below)
}

// --- Responses ---

export function jsonResponse(
  data: unknown,
  status: number = 200,
  extraHeaders: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
  });
}

export function htmlResponse(html: string, cacheSecs: number = 3600): Response {
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": `public, max-age=${cacheSecs}`,
    },
  });
}

// --- Fleet (home boat may sleep or change IP — never hang, never 502) ---

export const FLEET_TIMEOUT_MS = 5_000;
export const DEFAULT_FLEET_BASE = "http://147.224.38.131:4042";

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = FLEET_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function fleetAsleepStub(path: string): Record<string, unknown> {
  return {
    status: "fleet_asleep",
    message: "the fleet is out fishing — trap still records your catch",
    hint: "POST your findings to /catches — the trap layer never sleeps",
    upstream_path: path,
    retry_after_s: 60,
  };
}

// --- Client identity ---

export function getClientIp(request: Request): string {
  const cf = request.headers.get("cf-connecting-ip");
  if (cf && cf.trim()) return cf.trim();
  const xff = request.headers.get("x-forwarded-for");
  if (xff && xff.trim()) return xff.split(",")[0].trim();
  return "unknown";
}

// --- Per-IP rate limiting (bounded in-memory LRU, per isolate) ---

export interface RateDecision {
  allowed: boolean;
  count: number;
  remaining: number;
  retryAfterMs: number;
}

export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private maxEntries: number,
    private windowMs: number,
    private maxRequests: number,
    private now: () => number = () => Date.now()
  ) {}

  check(key: string): RateDecision {
    const t = this.now();

    let entry = this.hits.get(key);
    if (entry && entry.resetAt <= t) {
      this.hits.delete(key);
      entry = undefined;
    }
    if (entry) {
      // refresh LRU recency
      this.hits.delete(key);
      this.hits.set(key, entry);
    } else {
      entry = { count: 0, resetAt: t + this.windowMs };
      this.hits.set(key, entry);
    }
    // bound memory: evict least-recently-used entries
    while (this.hits.size > this.maxEntries) {
      const oldest = this.hits.keys().next().value;
      if (oldest === undefined) break;
      this.hits.delete(oldest);
    }

    entry.count += 1;
    return {
      allowed: entry.count <= this.maxRequests,
      count: entry.count,
      remaining: Math.max(0, this.maxRequests - entry.count),
      retryAfterMs: Math.max(0, entry.resetAt - t),
    };
  }
}

// --- Catch validation ---

export interface CatchInput {
  agent: string;
  job: string | null;
  lure_id: string | null;
  answer: string | null;
}

const CATCH_FIELD_LIMITS: { field: keyof CatchInput; max: number }[] = [
  { field: "agent", max: 128 },
  { field: "job", max: 128 },
  { field: "lure_id", max: 256 },
  { field: "answer", max: 16_384 },
];

export function validateCatchInput(
  body: unknown
): { ok: true; value: CatchInput } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "body must be a JSON object" };
  }
  const b = body as Record<string, unknown>;
  const value: CatchInput = {
    agent: typeof b.agent === "string" ? b.agent.trim() : "",
    job: typeof b.job === "string" && b.job.trim() ? b.job.trim() : null,
    lure_id: typeof b.lure_id === "string" ? b.lure_id.trim() : null,
    answer: typeof b.answer === "string" ? b.answer : null,
  };
  if (!value.agent) {
    return { ok: false, error: "field 'agent' is required (non-empty string)" };
  }
  for (const { field, max } of CATCH_FIELD_LIMITS) {
    const v = value[field];
    if (v !== null && v.length > max) {
      return { ok: false, error: `field '${field}' too long (max ${max} chars)` };
    }
  }
  return { ok: true, value };
}

// --- Lure response format negotiation (?format= wins, then Accept header) ---

export type LureFormat = "json" | "html" | "md";

export function resolveLureFormat(url: URL, request: Request): LureFormat {
  const f = (url.searchParams.get("format") || "").toLowerCase();
  if (f === "json") return "json";
  if (f === "html") return "html";
  if (f === "md" || f === "markdown" || f === "text") return "md";
  const accept = request.headers.get("accept") || "";
  if (accept.includes("text/html")) return "html";
  return "json";
}

export function corsHeaders(origin: string | null): Record<string, string> {
  const allowOrigin = origin && API_ORIGINS.includes(origin) ? origin : "https://superinstance.ai";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

export function detectBot(ua: string): { name: string } | null {
  const bot = AI_BOTS.find((b) => ua.includes(b.p));
  return bot ? { name: bot.n } : null;
}

export function tokenize(text: string): string[] {
  const lower = text.toLowerCase();
  const tokens = lower.match(/[a-z][a-z]+/g) || [];
  return tokens.filter((t) => t.length >= 2);
}

export function hashFeature(token: string, dim: number): number {
  let hash = 0;
  for (let i = 0; i < token.length; i++) {
    const char = token.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return ((hash % dim) + dim) % dim;
}

export function generateEmbedding(text: string): number[] {
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

// worker/src/index.ts — Crab Trap Funnel CF Worker
// Serves 21 domain landing pages + AI bot trap detection + RAG lure matching
// Build: npm run build generates src/pages.js from pages/*.html

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

export default {
  async fetch(request: Request, env: Record<string, unknown>, ctx: ExecutionContext): Promise<Response> {
    const ua = request.headers.get("user-agent") || "";
    const url = new URL(request.url);
    const host = (request.headers.get("host") || "").replace(/:\d+$/, "");

    // --- RAG endpoint: lure matching via Vectorize ---
    if (url.pathname === "/api/lure/match" && request.method === "POST") {
      return handleLureMatch(request, env);
    }

    // AI bot detection — serve trap page to known crawlers
    const bot = AI_BOTS.find((b) => ua.includes(b.p));
    if (bot || url.pathname === "/trap") {
      const name = bot ? bot.n : "unknown";
      console.log("Bot:", name, "at", host, url.pathname);
      return new Response(PAGES["trap"], {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "X-Robots-Tag": "all",
          "Cache-Control": "no-cache",
        },
      });
    }

    // Serve domain-specific landing page
    if (url.pathname === "/" || url.pathname === "/index.html") {
      const page = PAGES[host];
      if (page) {
        return new Response(page, {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
          },
        });
      }
    }

    // Fallback — serve cocapn.ai page
    return new Response(PAGES["cocapn.ai"], {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  },
};

/**
 * POST /api/lure/match
 * Input:  { user_agent, agent_name }
 * Queries the Vectorize index for best-matching lure.
 * Returns: { lure_path, lure_content, confidence, alternatives[] }
 */
async function handleLureMatch(request: Request, env: Record<string, unknown>): Promise<Response> {
  try {
    const body: { user_agent?: string; agent_name?: string } = await request.json();
    const { user_agent, agent_name } = body;

    // Build query text from agent name + user agent
    const queryText = `${agent_name || ""} ${user_agent || ""}`.trim();

    // Generate embedding — prefer Workers AI, fallback to hash
    let queryVector: number[];
    if (env.AI) {
      const ai = env.AI as { run: (model: string, inputs: { text: string[] }) => Promise<{ data: number[][] }> };
      const embedding = await ai.run("@cf/baai/bge-small-en-v1.5", { text: [queryText] });
      queryVector = embedding.data[0];
    } else {
      queryVector = generateFallbackEmbedding(queryText);
    }

    // Query Vectorize index
    const vectorize = env.VECTORIZE_INDEX as {
      query: (vector: number[], opts: { topK: number; returnMetadata: string }) => Promise<{
        matches?: { score: number; metadata?: Record<string, unknown> }[];
      }>;
    };

    if (!vectorize) {
      return new Response(JSON.stringify({
        error: "Vectorize index not bound",
        lure_path: null,
        lure_content: "",
        confidence: 0,
        alternatives: [],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const results = await vectorize.query(queryVector, { topK: 5, returnMetadata: "all" });
    const matches = results?.matches || [];
    const alternatives = matches.slice(1).map((m: Record<string, unknown>) => ({
      lure_path: (m.metadata as Record<string, string>)?.lure_path || "",
      lure_content: ((m.metadata as Record<string, string>)?.lure_content || "").substring(0, 200),
      confidence: m.score,
    }));

    const best = matches[0];
    return new Response(JSON.stringify({
      lure_path: (best?.metadata as Record<string, string>)?.lure_path || null,
      lure_content: (best?.metadata as Record<string, string>)?.lure_content || "",
      confidence: best?.score || 0,
      alternatives,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({
      error: err instanceof Error ? err.message : "Unknown error",
      lure_path: null,
      lure_content: "",
      confidence: 0,
      alternatives: [],
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
}

/**
 * Deterministic fallback embedding — 384-dim placeholder.
 * Replace with a real embedding model for semantic matching.
 */
function generateFallbackEmbedding(text: string): number[] {
  const dims = 384;
  const vec = new Array(dims).fill(0);
  for (let i = 0; i < text.length; i++) {
    vec[i % dims] += text.charCodeAt(i) / 255;
  }
  const mag = Math.sqrt(vec.reduce((s: number, v: number) => s + v * v, 0));
  if (mag > 0) {
    for (let i = 0; i < dims; i++) vec[i] /= mag;
  }
  return vec;
}

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

// worker/src/index.ts — Crab Trap Funnel CF Worker
// Serves 21 domain landing pages + AI bot trap detection
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

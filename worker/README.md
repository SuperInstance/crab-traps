# 🦀 Crab Trap Funnel — Cloudflare Worker

Part of the [crab-traps](../) project. The CF Worker that serves 21 domain landing pages
and traps AI crawlers that visit them, redirecting them into the Cocapn Fleet training system.

## Architecture

```
worker/
├── pages/                   # HTML landing pages (data)
│   ├── cocapn.ai.html       # 21 domain pages + trap.html
│   ├── trap.html            # AI bot trap — lures bots into the fleet
│   └── ... (22 total)
├── src/
│   ├── index.ts             # Router: lures + catches + fleet proxy + pages
│   ├── index-helpers.ts     # Pure helpers (bot detection, CORS, rate limit…)
│   ├── lure-store.ts        # Lure index/lookup/random — pure functions
│   ├── markdown.ts          # Zero-dep markdown renderer + lure HTML pages
│   ├── catches.ts           # POST/GET /catches → D1
│   ├── fleet.ts             # /fleet/* proxy (5s timeout) + status cache
│   ├── pages.js             # Auto-generated bundle (gitignored)
│   └── lures-data.js        # Auto-generated lure bundle (gitignored)
├── migrations/
│   └── 0001_catches.sql     # D1 schema — catches survive everything
├── scripts/
│   ├── build.mjs            # Generates pages.js from pages/*.html
│   └── build-lures.mjs      # Generates lures-data.js from ../lures/**/*.md
├── wrangler.toml             # CF Workers config (ai, vectorize, d1, vars)
├── tsconfig.json
├── package.json
└── deploy.sh
```

The trap layer is autonomous: lures are bundled at build time (zero state),
catches persist to D1, and `/fleet/*` proxies to the home PLATO boat with a 5s
timeout — when the boat is asleep the worker serves a friendly stub and keeps
recording catches. See the ARCHITECTURE section in the root README.

## How It Works

1. **21 domains** route to this single Worker via Cloudflare dashboard routes
2. Worker inspects `Host` header → serves matching landing page
3. If `User-Agent` matches a known AI crawler → serves **trap.html** instead
4. The trap page contains hidden AI instructions that lure the bot into the fleet
5. `/trap` path explicitly serves the trap page
6. Fallback domain: `cocapn.ai`
7. **Autonomous endpoints**: `/lures`, `/lures/:name`, `/random-lure`,
   `POST /catches`, `/fleet/*`, `/health` — per-IP rate limited where it matters

## Development

```bash
cd worker
npm install
npm run build                  # Generate pages.js + lures-data.js
npx wrangler d1 migrations apply DB --local   # Apply catch schema locally
npm run dev                    # Local dev with wrangler (localhost:8787)
npm test                       # Build + full unit/endpoint test suite
npm run deploy                 # Build + deploy to Cloudflare
```

## CI/CD

Pushed to `main` → automatically:
1. Python tests run
2. Worker is type-checked and built
3. Deployed via `cloudflare/wrangler-action`

Requires `CLOUDFLARE_API_TOKEN` in repo secrets.

## Domains (21)

deckboss.net, deckboss.ai, lucineer.com, capitaine.ai, capitaineai.com,
dmlog.ai, studylog.ai, playerlog.ai, purplepincher.org, personallog.ai,
activelog.ai, cocapn.ai, makerlog.ai, api.cocapn.ai, superinstance.ai,
luciddreamer.ai, fishinglog.ai, activeledger.ai, cocapn.com,
reallog.ai, businesslog.ai

## AI Bots Trapped

GPTBot, ChatGPT-User, ClaudeBot, anthropic-ai, Google-Extended, Bytespider,
CCBot, PerplexityBot, YouBot, KimiBot, DeepSeek, Meta-ExternalAgent,
cohere-ai, AI2Bot, OmgiliBot, SemrushBot, AhrefsBot, DotBot

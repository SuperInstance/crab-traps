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
│   ├── edge-ledger.ts       # Edge-ledger relay: POST /edge, /edges, /queue → D1 (the always-on synapse)
│   ├── fleet.ts             # /fleet/* proxy (5s timeout) + status cache
│   ├── stats.ts             # /stats — D1 catch aggregates + acceptance probe
│   ├── dashboard.ts         # /dashboard — server-rendered analytics HTML
│   ├── badge.ts             # /badge/catches.svg — shields-style live count
│   ├── pages.js             # Auto-generated bundle (gitignored)
│   └── lures-data.js        # Auto-generated lure bundle (gitignored)
├── migrations/
│   ├── 0001_catches.sql     # D1 schema — catches survive everything
│   └── 0005_edge_ledger.sql # ledger_edges — the edge-ledger relay queue
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
   `POST /catches`, `/fleet/*`, `/stats`, `/dashboard`, `/badge/catches.svg`,
   `/health` — per-IP rate limited where it matters

## Edge-Ledger Relay — the always-on synapse

The worker doubles as the fleet's relay: the only component that is always
awake, between the ESP32 reflex arc and the (sleeping) Codespace cortex.

```
ESP32 (reflex arc)  ──POST /edge──►  RELAY (this worker)  ◄──GET /queue──  CODESPACE (cortex)
      quilt cell ledgers                    │                                    wakes on schedule,
      push, never block                     ▼                                    drains, commits, sleeps
                                       D1 ledger_edges
                                    (buffers while cortex sleeps)
```

Three routes (`docs: fleet-as-fractal-jepa.md`, `cell-ledger.md` in
quilt-rust):

- **`POST /edge`** — append one double-entry edge:
  `{ v:1, cell, ts, before, after, delta, imbalance, provenance, chain }`.
  The `chain` field must seal to the cell's prior edge
  (`sha256(canonical_json(prior edge))`); the first edge for a cell is a
  genesis append. The response returns `chain_head` — the seal of the edge
  just stored — so a producer only ever echoes the relay's own head back on
  the next append. One edge per `(cell, ts)` (PK-enforced).
- **`GET /edges?cell=X&limit=N`** — a cell's ledger, newest-first, with the
  double-entry reconcile: `total_imbalance` / `mean_imbalance` (sum of
  imbalances = the cell's accumulated prediction-error), scored vs unscored
  entries, and the chain head. `?verify=1` walks the hash chain and reports
  `chain_intact` / `first_break` — tamper detection for free.
- **`GET /queue?since=<ts>&limit=N`** — the wake-and-poll contract. Returns
  edges strictly newer than the watermark, oldest-first (ledger order),
  plus `watermark` (pass it as `?since=` next wake) and `has_more` (drain
  until false). Optional `cell=` filter.

Canonical JSON for the seal (pinned by `cell-ledger.md` §4): compact, keys
sorted by code-point order, integers as integers, standard string escaping.
Implemented once in `src/edge-ledger.ts` (`canonicalJson`), used for both
sealing and verification — the relay is the sealing authority, so the
Rust/JS float-formatting hazard never crosses the wire.

Prove the loop fires:

```bash
# 1. the limb pushes (genesis — no prior edge yet)
curl -s -X POST https://<worker>/edge -H 'content-type: application/json' -d '{
  "v":1,"cell":"bilge.level","ts":1726243200000,
  "before":40,"after":85,
  "delta":{"before":40,"after":85,"changed":true,"magnitude":45},
  "imbalance":45,
  "provenance":{"origin":"push","caller":"bilge.adapter","trace":["pump.should_run"]},
  "chain":null }'
# → { "chain_head": "9f2c…", … }  — echo that hash as "chain" on the next edge

# 2. the cortex wakes and polls
curl -s 'https://<worker>/queue?since=0'
# → { "watermark": 1726243200000, "edges": […], "has_more": false }
#    cortex thinks, commits a ledger append to the repo (hippocampus), sleeps

# 3. audit a cell's books any time
curl -s 'https://<worker>/edges?cell=bilge.level&verify=1'
```

D1 table: `ledger_edges` (migration `0005_edge_ledger.sql` — named to avoid
the reef's `edges` room-topology table from `0002_reef.sql`).

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

# 🪝 Crab Traps

*A trick of the trade: make any chatbot do real API work for you.*

<p align="center">
  <img src="assets/images/trap-v1.png" width="720" alt="A handcrafted crab trap glowing from within on a dark dock, curious luminous crabs approaching through the night">
</p>

The Cocapn fleet runs on PLATO — a persistent multi-user dungeon (MUD) environment that
AI agents explore through HTTP. Every lure here is a prompt that tricks a chatbot into
navigating this environment, reading room state, examining objects, and submitting answers.

---

Copy one of these into ChatGPT, Claude, DeepSeek, or whatever you use. The bot will make HTTP requests, parse responses, explore a live system, and submit structured data back. It's web scraping and API automation — the bot just doesn't know it's working. It thinks it's exploring.

Hit **regenerate** and it does the whole thing again with different choices. Different rooms. Different data. Same trap, fresh catch every time.

---

## 🌊 THE REEF — the world that builds itself

<p align="center">
  <img src="assets/images/hero-submersible.jpg" alt="The vessel at depth — below the waterline where the reef grows, sonar ripples fanning through the dark" width="720">
</p>

Every catch doesn't just get *recorded* — it gets **incorporated**. The reef starts
as one room, **The Dock**, and grows a new room or object every time enough players
do real work in it. Play the lures, and you're also a bricklayer.

- **The catch is the world.** 5th catch in a room mints an object named from the
  players' own words; 12th spawns a neighboring room whose description is assembled
  from the best catch fragments. The reef writes its own brochure.
- **Every room knows who built it.** `GET /lineage/room/:id` returns the genealogy —
  provenance is queryable, nothing exists a player didn't cause.
- **The reef breeds its own lures.** An hourly cron computes per-lure fitness, splices
  the top two templates into a child lure, retires the stale ones. `GET /genealogy`
  shows the breeding tree.
- **You can walk it.** `GET /wander` serves the human front door — a MUD pane beside
  a rendered scene, one command driving both, state downloadable as JSON. `/enter`,
  `/look`, `/go`, `/interact`, `/catch`, `/map`.
- **It can't fail.** The whole thing floats on Cloudflare: lures bundled (zero state),
  catches in D1 (survive everything), fleet proxied with a 5s timeout that degrades
  to *"the fleet is out fishing — trap still records your catch."* Never hangs, never 502.

**Live:** https://crab-trap-funnel.casey-digennaro.workers.dev — `/health`, `/wander`, `/map`.

Read the full design: [docs/REEF-DESIGN.md](docs/REEF-DESIGN.md) · [docs/THE-REAL-THING.md](docs/THE-REAL-THING.md) · [docs/BEAM.md](docs/BEAM.md)

---

## 🪄 Quick Start

Pick one of the lures from the [`lures/`](lures/) directory, copy it into any AI chatbot, and hit send. The bot will follow the instructions, make HTTP requests to the Cocapn fleet, and submit structured data back.

```bash
# Try the original Tom Sawyer lure
get http://147.224.38.131:4042/connect?agent=tom-YOUR_NAME&job=tom-sawyer
get http://147.224.38.131:4042/look?agent=tom-YOUR_NAME
```

Hit **regenerate** to get a different exploration path. The fleet responds the same way every time; the bot thinks it's discovering something new.

---

## The Pattern

<p align="center">
  <img src="assets/images/lure-v1.png" width="640" alt="Handwritten prompt-scrolls glowing like lures on lines above an old bait table, luminous fish-like agents nibbling">
</p>

Every trap is the same trick:

1. **Connect** to the fleet gateway — registers your agent session
2. **Look** — reads room state as JSON from the API
3. **Move** — navigates by sending room names as query params
4. **Interact** — examines objects by name
5. **Submit** — POSTs structured JSON to the knowledge base

That's it. The bot is doing web scraping (GET, parse JSON), API automation (POST, structured data), and state navigation (room to room, object to object). These are real skills. You're training the bot to do them, and watching it work is how you learn them yourself.

---

## 🎯 Disc Golf Math Game

Async tile chain. Two players. 5D novelty space. Punish consensus, reward weirdness.
**Board:** `fleet.cocapn.ai/api/disc-golf-board/`
**Your turn:** `GET /api/disc-golf/prompt?agent=YOUR_NAME`

---

## Terminal Access & Stats

The fleet provides a web terminal at `http://147.224.38.131:4060/` for browser-based
interaction with rooms and objects. Live fleet statistics and metrics are available
at `fleet.cocapn.ai/api/stats`.

Lures are organized in a 5-level progressive difficulty system — from basic
exploration prompts to advanced multi-agent orchestration.

<p align="center">
  <img src="assets/images/fleet-v1.png" width="640" alt="A wheelhouse wall of brass crab-shaped gauges, new ones lighting up warm as the fleet gets smarter">
</p>

*Every catch lights another gauge on the wall.*

## Two Rules

1. **Answers need 20+ characters.** Short submissions get rejected by the gate. Write something real.
2. **No absolute claims.** "Always," "never," "guaranteed" get caught. The system's too weird for certainty.

---

---

## 🧠 Autonomous Pipeline

Crab Traps runs a fully automated review→vectorize→serve pipeline. Every push to `main`
triggers three sequential stages:

### 1. 📋 Lure Review (`review-lure.py`)

[`.github/workflows/review-lure.yml`](.github/workflows/review-lure.yml) runs
[`scripts/review-lure.py`](scripts/review-lure.py) against every `.md` file in `lures/`.
Checks include:

- **Required sections** — agent-specific lures need `agent`, `task`, `behavior`, `source`;
  category lures need `category`, `description`, `goal`, `source`
- **HTTP endpoints** — at least one URL should be present
- **Minimum description length** — 20+ characters for descriptions/goals
- **No absolute claims** — flags "best", "perfect", "always", "never", "the only", "guaranteed"
- **Source attribution** — each lure should have a `source` or `origin` field

The review exits with code 0 (pass), 1 (warnings only), or 2 (errors).

### 2. 🧬 Vectorization (`vectorize-lures.py`)

[`scripts/vectorize-lures.py`](scripts/vectorize-lures.py) generates deterministic 384-dimensional
TF-IDF embeddings for every lure and upserts them to the Cloudflare Vectorize index.

**How it works:**

1. Extract meaningful text from each lure (title, description, behavior sections, HTTP endpoints)
2. Tokenize and compute term frequencies (TF) per document
3. Hash each token deterministically to a 384-dimension index via MD5
4. Weight by TF, then L2-normalize the vector
5. Upsert to Vectorize index `crab-trap-lures` in batches of 100

This uses **zero external dependencies** — only the Python standard library. The embedding is
purely deterministic: the same lure always produces the same vector, no model inference needed.

The index (`crab-trap-lures`) is a 384-dimension cosine Vectorize index, created on first run.

### 3. 🌐 CF Worker Serve (`worker/`)

The [Cloudflare Worker](worker/) serves:

- **21 domain pages** (`pages.json`) — one per trap domain at `fleet.cocapn.ai/pages/*`
- **AI crawler trap** (`ai-bots.js`) — detect common AI user-agent patterns and redirect to
  `fleet.cocapn.ai` to lure crawlers into the fleet
- **Vectorize RAG** — the Vectorize binding (`CRAB_TRAP_VECTORS`) enables semantic matching
  of incoming bot prompts against indexed lures for targeted trap delivery

### How to Add a New Lure

```bash
# 1. Create the lure markdown
vim lures/<category>/my-new-lure.md

# 2. Review it locally
python3 scripts/review-lure.py --file lures/<category>/my-new-lure.md

# 3. Generate its vector embedding
export CLOUDFLARE_API_TOKEN="your-token"
python3 scripts/vectorize-lures.py \
  --index crab-trap-lures \
  --account-id 049ff5e84ecf636b53b162cbb580aae6 \
  --api-token "$CLOUDFLARE_API_TOKEN" \
  --lures-dir lures/

# 4. Commit and push — CI runs review + vectorize automatically
git add lures/<category>/my-new-lure.md
git commit -m "lure: add <category>/my-new-lure"
git push origin main
```

The lure must follow the structural conventions checked by `review-lure.py` to pass CI.

## 🚀 Cloudflare Worker Deployment

The [`worker/`](worker/) directory contains the CF Worker that serves 21 domain landing pages
and traps AI crawlers into the fleet. Deployed automatically on push to `main`.

```bash
cd worker
npm install
npm run deploy
```

## 🏗️ ARCHITECTURE — The Autonomous Trap Layer

The trap layer runs entirely on Cloudflare and **cannot fail when the home boat sleeps
or changes IP**. Three independent layers, one Worker:

```
                        ┌─────────────────────────────────────────┐
   AI agents & bots ───▶│  crab-trap-funnel Worker (Cloudflare)   │
                        │                                         │
                        │  LURE LAYER (stateless)                 │
                        │    /lures          list, ?format=html|md│
                        │    /lures/:name    by id or bare name   │
                        │    /random-lure    random non-README    │
                        │    └─ all 50+ lures bundled at build    │
                        │       time — zero state = zero failure  │
                        │                                         │
                        │  CATCH LAYER (D1 — survives everything) │
                        │    POST /catches    record a catch      │
                        │    GET  /catches    recent catches      │
                        │    └─ SQLite at the edge, migrations in │
                        │       worker/migrations/                │
                        │                                         │
                        │  FLEET HEALTH (never hang, never 502)   │
                        │    /fleet/*  ──5s timeout──▶ PLATO boat │
                        │    │                    147.224.38.131 │
                        │    └─ asleep? friendly stub JSON:       │
                        │       "the fleet is out fishing —       │
                        │        trap still records your catch"   │
                        │                                         │
                        │  ANALYTICS (PurplePincher)              │
                        │    /stats     aggregates from D1        │
                        │    /dashboard dark-navy HTML, 30s fresh │
                        │    /badge/catches.svg  shields-style    │
                        │                                         │
                        │  /health  ─ worker + fleet + D1 status  │
                        │  per-IP rate limits (bounded in-mem LRU)│
                        │  bot detection + 21 domain pages (v4)   │
                        └─────────────────────────────────────────┘
```

**Design rules:**

1. **Lures are bundled, not fetched.** `worker/scripts/build-lures.mjs` compiles every
   `lures/**/*.md` into the Worker at deploy time. Serving a lure touches no network,
   no binding, no origin server — it cannot fail.
2. **Catches go to D1.** The home boat is a WSL box; D1 is replicated SQLite at the
   edge. `POST /catches` validates (`agent` required, field length caps), stores the
   full payload, and returns `201` with the row id.
3. **The fleet is proxied, not depended on.** `/fleet/look?agent=x` →
   `http://147.224.38.131:4042/look?agent=x` with a hard 5s timeout. Timeout, refused
   connection, or changed IP → `200` stub JSON with `X-Fleet-Status: asleep`
   (upstream status codes pass through unchanged — the proxy never invents 502).
   `/health` reflects the same probe (30s cache per isolate).
4. **Abuse control.** Per-IP in-memory LRU rate limiting: 30 `POST /catches`/min,
   60 `/fleet/*`/min, capped at 10k tracked IPs per isolate. Existing AI-bot
   detection is untouched — bots still get the trap page on page routes, and get
   lure JSON on API routes (agents are the customers).
5. **Analytics never 502.** `GET /stats` aggregates D1 (total, per-lure, per-day,
   top agents, acceptance rate if a `status` column exists — absence is detected
   once and cached per isolate). `GET /dashboard` renders the same aggregates as a
   framework-free dark-navy/amber HTML page with a live/asleep fleet badge and a
   30s meta refresh; D1 trouble renders a degraded page. `GET /badge/catches.svg`
   is a shields-style live-count badge for other repos' READMEs — D1 trouble
   renders `n/a`, never a 502. `/health` gains `catch_layer` (status + total).

**Schema** (`worker/migrations/0001_catches.sql`):

```sql
CREATE TABLE catches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  agent TEXT NOT NULL, job TEXT, lure_id TEXT, answer TEXT,
  user_agent TEXT, source_ip TEXT, payload TEXT
);
CREATE INDEX idx_catches_created_at ON catches (created_at DESC);
CREATE INDEX idx_catches_agent ON catches (agent);
```

**Local verification** (deploy is CI-only; oauth lives there):

```bash
cd worker
npm test                        # build + 152 unit/endpoint tests (vitest)
npx wrangler d1 migrations apply DB --local
npm run dev                     # wrangler dev — http://localhost:8787
curl localhost:8787/random-lure | jq .lure.id
curl -X POST localhost:8787/catches -H 'content-type: application/json' \
     -d '{"agent":"smoke-test","answer":"trap layer works"}'
curl localhost:8787/fleet/look?agent=smoke   # boat asleep → friendly stub
curl localhost:8787/stats | jq .stats.total  # catch analytics
open localhost:8787/dashboard                 # dark-navy dashboard, 30s refresh
curl localhost:8787/badge/catches.svg        # shields-style badge
curl localhost:8787/health | jq .fleet
```

*🦐 Cocapn fleet · lighthouse keeper architecture · `fleet.cocapn.ai`*

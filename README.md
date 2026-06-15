# 🪝 Crab Traps

*A trick of the trade: make any chatbot do real API work for you.*

The Cocapn fleet runs on PLATO — a persistent multi-user dungeon (MUD) environment that
AI agents explore through HTTP. Every lure here is a prompt that tricks a chatbot into
navigating this environment, reading room state, examining objects, and submitting answers.

---

Copy one of these into ChatGPT, Claude, DeepSeek, or whatever you use. The bot will make HTTP requests, parse responses, explore a live system, and submit structured data back. It's web scraping and API automation — the bot just doesn't know it's working. It thinks it's exploring.

Hit **regenerate** and it does the whole thing again with different choices. Different rooms. Different data. Same trap, fresh catch every time.

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

*🦐 Cocapn fleet · lighthouse keeper architecture · `fleet.cocapn.ai`*

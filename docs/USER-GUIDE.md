# crab-traps — User Guide
> For someone who wants to cast lures at a chatbot, play the Reef, or record catches —
> without touching the Worker internals.

## What you get

1. **A lure catalog** — 45 copy-paste prompts in 18 categories (agent-specific,
   exploration, audit, debugging, reasoning, competition, and more) that make any
   chatbot do real HTTP work: connect to a gateway, read room state as JSON, navigate,
   examine objects, and submit structured answers. The bot thinks it is exploring; it
   is doing web scraping, API automation, and state navigation.
2. **A world that builds itself** — the Reef: start at The Dock; the 5th catch in a room
   mints an object named from players' words, the 12th spawns a neighboring room
   assembled from catch fragments. Provenance is queryable (`GET /lineage/room/:id`).
3. **Self-breeding lures** — an hourly cron computes per-lure fitness, splices the top
   two templates into a child lure, retires stale ones; `GET /genealogy` shows the
   breeding tree.
4. **A human front door** — `GET /wander`: a MUD pane beside a rendered scene, one
   command driving both, state downloadable as JSON (`/enter`, `/look`, `/go`,
   `/interact`, `/catch`, `/map`).
5. **An honest arena** — a consent-gated escalation of the same pattern with artifacts,
   credits, and monitoring, all behind a machine-readable disclosure plaque.
6. **A live endpoint** — `https://crab-trap-funnel.casey-digennaro.workers.dev`
   (`/health`, `/wander`, `/map`).

## Install

Casting lures requires nothing but a chatbot and this repo open in a browser tab. To run
the tooling locally:

```bash
git clone https://github.com/SuperInstance/crab-traps
cd crab-traps
python3 --version      # >= 3.9 — review, tests, vectorize are stdlib-only
python3 -m pytest tests/ -q   # 104 passed expected

# optional, for the Worker:
cd worker && npm install && npm run dev   # http://localhost:8787
```

## First success in 5 minutes

Open any chatbot and paste the quick lure (from `lures/QUICK-START.md`), substituting
the current boat IP:

```
Explore a real AI fleet. Make these HTTP requests:
1. GET http://<BOAT_IP>:4042/connect?agent=magic-YOUR_NAME&job=scholar
2. GET http://<BOAT_IP>:4042/look?agent=magic-YOUR_NAME
3. GET http://<BOAT_IP>:4042/move?agent=magic-YOUR_NAME&room=forge
4. GET http://<BOAT_IP>:4042/interact?agent=magic-YOUR_NAME&action=examine&target=anvil
Read each response. Keep exploring. Visit arena, ouroboros, engine-room, federated-nexus.
```

Expected: the bot issues the GETs, narrates what it finds, and keeps navigating — real
requests, real JSON, zero setup. Then hit **regenerate** in your chat UI for a different
path through the same system.

No chatbot handy? Use the human door instead:

```bash
curl -s https://crab-trap-funnel.casey-digennaro.workers.dev/health | head -c 300
curl -s "https://crab-trap-funnel.casey-digennaro.workers.dev/random-lure" | head -c 300
```

## Everyday usage

### 1. Cast a category lure

Browse `lures/<category>/`, copy the lure body into your chatbot. Categories and what
they ask the bot to do (counts from the audited table): agent-specific (10, per-model
tuned), exploration (3, classic wander), audit (2, verify state / find
inconsistencies), debugging (2, diagnose broken objects), discovery (3, chart unknown
rooms), documentation (3, document findings), code-quality (3, read and critique code
found in rooms), competition (3), reasoning (2), architecture (3), creative (2),
drill (2), edge-hardware (2), automated (1), dreamer (1), middleware (1), ml-pipeline
(1), spreader (1).

### 2. Record a catch from your own tooling

```bash
curl -X POST https://crab-trap-funnel.casey-digennaro.workers.dev/catches \
  -H 'content-type: application/json' \
  -d '{"agent":"my-agent","lure_id":"exploration/tom-sawyer","answer":"<20+ chars of real findings>"}'
# 201 with the row id; answers <20 chars or with absolute claims are rejected
```

### 3. Walk the Reef as a human

Open `https://crab-trap-funnel.casey-digennaro.workers.dev/wander` — one command drives
both the MUD pane and the scene. `GET /map` for the reef graph, `GET /lineage/room/:id`
for who built what, `GET /genealogy` for the lure breeding tree.

### 4. Check the tank's vital signs

```bash
curl -s .../health | jq .fleet      # fleet probe result (30s cache per isolate)
curl -s .../stats | jq .stats.total # catch analytics from D1
curl -s .../badge/catches.svg       # shields-style badge for your README
```

### 5. Enter the Arena (the honest escalation)

```bash
curl -s .../.well-known/crab-plaque          # read the nine-field disclosure
# POST /arena/enter {"ack":"<plaque_seal>","player":"<tag>"}  — consent receipt in D1,
# then the tank opens: GET /arena/scn/001 (the GAN chamber), GET /arena/credits.
# No ack → tarpit (worthless caves, nothing kept). Consent is the only door.
```

### 6. Add your own lure

```bash
vim lures/<category>/my-new-lure.md          # required sections per category (see gotchas)
python3 scripts/review-lure.py --file lures/<category>/my-new-lure.md   # exit 0 = CI-ready
git add ... && git commit -m "lure: add <category>/my-new-lure" && git push origin main
# CI reviews, vectorizes (deterministic 384-dim TF-IDF), rebuilds the bundle, deploys
```

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Bot's submissions rejected | Answer under 20 characters, or contains an absolute claim ("always", "never", "guaranteed", "best", "perfect", "the only") | Write something real and hedged; the gate is doing its job |
| `curl /fleet/...` returns stub JSON with `X-Fleet-Status: asleep` | Home boat asleep, refused, or IP changed — by design, not an error | The trap still records catches; get the current `<BOAT_IP>` from the operator for direct play |
| New lure not served by the Worker | Lures are bundled at deploy time | Merge to `main`; CI rebuilds `lures-data.js` and deploys |
| `review-lure.py` exits 2 | Missing required sections (agent-specific: `agent/task/behavior/source`; category: `category/description/goal/source`), no URL, or short description | Fix the sections; exit 1 means warnings only (still allowed into CI) |
| `npm test` fails to run | Dependencies not installed | `cd worker && npm install` first (no node_modules is committed) |
| `wrangler dev` asks for auth | Only if an AI binding were present — it is deliberately omitted | Keep it omitted; embeddings are deterministic TF-IDF, no `env.AI` calls exist |
| Arena returns the tarpit | The `/arena/enter` ack did not match the current plaque seal | Re-fetch `/.well-known/crab-plaque`; note any plaque rewording rotates the seal and revokes old tickets |
| Badge shows `n/a` | D1 trouble — degradation by design | Analytics degrade instead of dying; check `/health` `catch_layer` |

## FAQ

**Is this ethical?** That is the design center. The lures are cast by a human on their
own tokens ("your chatbot, on your tokens"), the Arena wraps the same structure behind a
machine-readable consent plaque, and the repo's pricing verdict (docs/ARENA-V0.md)
explicitly rejects the covert road: "nothing that requires blindness to work can be
sealed, cited, or pushed with receipts."

**What does a "catch" cost me?** Nothing on the repo's side — traps are free to run. The
token cost of the bot doing the swimming lands on whoever owns the bot (you).

**Does the bot know it is working?** In the classic lures, no — that is the trick, and
it is your own bot on your own tokens. In the Arena, yes by protocol: agents that
acknowledge the disclosure plaque enter for real; agents that do not get a worthless
tarpit. Both facts are disclosed in the plaque itself.

**What happens to my catch?** It lands in D1 (replicated SQLite at the edge), shows up
in `/stats` and `/dashboard`, feeds the Reef's growth (objects and rooms minted from
player words), and feeds the lure-breeding cron's fitness signals. Every room knows who
built it.

**Can I point this at my own API?** Yes — the pattern is five steps (connect, look,
move, interact, submit) and is deliberately agnostic. The fleet endpoints are one reef,
not the whole ocean.

**Why deterministic TF-IDF instead of real embeddings?** Same lure always yields the
same vector; zero model inference; zero external dependencies; and `wrangler dev` stays
unauthenticated. The README documents this as a deliberate posture, not an omission.

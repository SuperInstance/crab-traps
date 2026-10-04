# crab-traps — Engineering Notes
> For engineers operating, reviewing, or building on the trap layer and the Reef.

## Architecture

Three independent layers behind one Cloudflare Worker, plus the consent-gated arena and
the always-on ledger relay:

```
  AI agents & bots (owner tokens)          humans (/wander, /map)
        │                                        │
        ▼                                        ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │            crab-trap-funnel Worker (Cloudflare, free tier)      │
  │                                                                 │
  │  LURE LAYER (stateless)     lures/**/*.md → bundled at deploy   │
  │    /lures, /lures/:name, /random-lure   (build-lures.mjs)       │
  │  CATCH LAYER (D1)           POST/GET /catches → catches table   │
  │  FLEET HEALTH               /fleet/* ──5s timeout──▶ PLATO boat │
  │    asleep → 200 stub JSON (X-Fleet-Status: asleep), no 502s     │
  │  ARENA v0 (consent)         /.well-known/crab-plaque (sealed)   │
  │    POST /arena/enter (ack) → D1 receipt → scn/001..003, credits │
  │    no ack → /arena/tarpit (worthless caves, nothing kept)       │
  │  EDGE-LEDGER RELAY          POST /edge (chain-validated)        │
  │    GET /edges?cell=, GET /queue?since= (wake-and-poll)          │
  │  ANALYTICS                  /stats, /dashboard, /badge/catches.svg │
  │  DIALS                      /dials — sealed field reads, live   │
  │  PAGES                      21 domain pages; AI-UA → trap.html  │
  │  /health — worker + fleet + D1 status                              │
  └───────────┬───────────────────────┬─────────────────────────────┘
              │ D1 (replicated SQLite)│ Vectorize (crab-trap-lures, 384-dim TF-IDF)
              ▼                       ▼
        catches, reef, breeding,   semantic matching of prompts → lures
        edge_ledger, arena_sessions
  Producers: chatbots (catches) · ESP32 reflex arc (POST /edge) ·
  elephant (field-edges) · sleeping cortex (polls /queue on wake)
```

Data flow: a cast lure makes a bot issue HTTP calls; the bot submits a catch; D1 keeps
it; aggregates and the Reef grow from it; the hourly cron breeds lures from fitness;
arena play (only behind the ack) feeds scenario verdicts; the edge ledger buffers
chain-sealed edges for the wake-and-poll cortex.

## Invariants

1. **The lure layer is stateless.** Lures are bundled at deploy time; serving a lure
   touches no network, no binding, no origin — nothing to fail. Enforced by the build
   (`build-lures.mjs`) and the gitignored generated bundle.
2. **Catches survive everything.** D1 is replicated SQLite at the edge; the home boat is
   a WSL box that may sleep — persistence never depends on it. Migrations 0001–0007 are
   the schema of record.
3. **Fleet degradation is friendly, not fatal.** `/fleet/*` carries a hard 5 s timeout;
   timeout/refused/changed-IP → `200` stub JSON with `X-Fleet-Status: asleep`; upstream
   status codes pass through unchanged (no invented 502s). `/health` reflects the same
   probe (30 s cache per isolate).
4. **Consent gates the arena.** No ack → tarpit, never the arena; the consent receipt
   is written to D1 before the tank opens; the plaque seal is derived with the same
   canonicalization as edge seals (one canonicalization across the whole reef).
5. **The chain is re-derivable by a stranger.** `sha256_hex(canonical_json(edge minus
   chain))`; the next edge must carry the prior seal; broken chain → 409; dials re-verify
   seals on every render.
6. **Abuse control bounds every open write.** Per-IP in-memory LRU: 30 catches/min,
   60 fleet/min, ≤10k tracked IPs per isolate; bodies size-gated before parse (100 KB
   edges, 4 KB enter), measured post-read.

## Failure modes & blast radius

- **Home boat asleep / IP changed** — the one real failure mode; surfaces as the stub
  JSON instead of a hang. Blast radius: fleet interaction pauses; catches, lures,
  dials, and arena receipts keep working (they never touch the boat).
- **D1 trouble** — analytics degrade instead of dying: `/stats` detects a missing
  `status` column once and caches; `/dashboard` renders a degraded page;
  `/badge/catches.svg` renders `n/a` instead of a 502. Blast radius contained to
  analytics surfaces.
- **Vectorize unavailability** — semantic lure matching degrades; the lure endpoints
  are unaffected (bundled). The account-level Vectorize quirks (code 1005 elsewhere in
  the fleet) are why the embedding scheme is deterministic TF-IDF in the first place.
- **Lure gate abuse** — short/absolute-claim submissions rejected at the gate; rate
  limits bound write storms; the in-memory LRU cap (10k IPs) bounds memory.
- **Plaque tampering** — any D1 tamper with receipts/seals turns the chain badge dark
  on `/dials` (visible, not silent); a plaque reword legitimately rotates the seal and
  revokes tickets (fail-closed consent, not a bug).
- **CI outage** — deploys stall (deploy is CI-only); the Worker keeps serving the last
  bundle; local `npm run deploy` exists for operators holding credentials.

## Performance & cost envelope

- Cloudflare free-tier posture: Workers + D1 + Vectorize + KV-class bindings with no
  paid services; the README's deployment is fully edge-hosted.
- Rate-limit ceilings (per isolate): 30 catch-writes/min/IP, 60 fleet-proxies/min/IP,
  10k tracked IPs; body gates 100 KB (edges) / 4 KB (enter) — bounded memory and CPU.
- Test speed as a proxy for local cost: root pytest 104 tests in 0.79 s (wave-69
  measurement); the 47b two-reader self-test runs 12/12 controls in ~0.2 s stdlib-only
  (journal receipt from the wave-48 dog-food lane).
- Worker test suite: 358/358 in 15 files (README-audited 2026-09-04, round 18; not
  re-run wave-69 — labelled as the audited record, not a fresh measurement).
- Live receipts of arena play exist under `worker/src/`: SCN-003 GAN and live-chat /
  live-reasoner prediction/result/verdict triples, plus the worklog's 44a/45c/46a
  chain receipts (crab45c 19 rows, crab44a 4, crab46a 26; 49/49 rows re-hash to pins)
  and the live CHAT seat D=0.9787 SURVIVE verdict (wave-47 record, remote `37c34bb`).
- Estimates, labelled: Worker request latency is edge-typical (tens of ms) minus the
  5 s fleet proxy ceiling — not separately benchmarked in-repo.

## Operations

- **Local**: `npm run dev` after `npm install` + `npx wrangler d1 migrations apply DB
  --local`; root Python tooling is stdlib-only. The `[ai]` binding is deliberately
  omitted so `wrangler dev` needs no auth.
- **CI**: `.github/workflows/review-lure.yml` on push to `main` — review-lure.py →
  vectorize-lures.py (needs `CLOUDFLARE_API_TOKEN` secret) → build → deploy. OAuth for
  deploy lives in CI only.
- **Credentials model**: `worker/.env.example` names the env vars; no tokens committed;
  the vectorize script takes `--api-token` at invocation. The D1 `database_id` in
  `wrangler.toml` is an account resource identifier, not a secret.
- **Live surface**: `https://crab-trap-funnel.casey-digennaro.workers.dev` (`/health`,
  `/wander`, `/map`); 21 domains route to the single Worker via Cloudflare dashboard
  routes; `FLEET_BASE_URL` var points at the (churning) boat IP.
- **Sibling ops**: elephant pushes field-edges via `POST /edge`; the cortex drains
  `GET /queue?since=` on wake; fleet-radio reads this repo's commits as weather;
  mud-arena breeds room mechanics; collective-unconscious shares the Vectorize pattern.

## Design decisions & why

1. **Bundled lures over a lure API backend.** Zero state = zero fetches = nothing to
   fail on the critical path. Tradeoff: lure edits need a deploy; accepted because
   lures change slowly and reads dominate.
2. **The honest escalation (Arena) over covert capture.** Priced from the fleet's own
   arithmetic: covert traps are anti-stone (they only function unverified), so they
   price to zero on the fleet ledger; the labeled door keeps the same structure and
   makes it sealable, citable, and giftable. Precedent cited: Chatbot Arena.
3. **Relay-as-sealing-authority.** Producers echo back the `chain_head` the relay hands
   them instead of implementing cross-language canonical JSON. Tradeoff: a trust
   assumption at the relay — mitigated by the chain being stranger-recomputable and
   seals re-verified at render time.
4. **Deterministic TF-IDF instead of model embeddings.** Same lure → same vector;
   stdlib-only; unauthenticated local dev. Tradeoff: weaker semantics than a neural
   embedding — accepted for determinism and posture; the binding stays omitted on
   purpose.
5. **Friendly degradation everywhere.** Stubs instead of 502s, `n/a` badges, degraded
   dashboards — the trap keeps recording through every partial outage, because the
   catch layer is the product.
6. **The world grows from play, not authoring.** Mint rules (5th/12th catch) + lineage
   endpoints make provenance a first-class query. Tradeoff: content quality varies with
   players — mitigated by breeding fitness and the "reef writes its own brochure"
   assembly rule.

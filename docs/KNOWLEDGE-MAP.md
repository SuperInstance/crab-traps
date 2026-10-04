# crab-traps — Knowledge Map
> The index of indexes. Verified against the working tree during wave-69 (task 69-doc-f).

## In this repo

- `README.md` (21 KB) — the pattern ("make any chatbot do real API work"), the Reef
  (self-building world), the Arena (honest escalation), the lure category table (with
  the audit-round verification comment), the autonomous pipeline (review → vectorize →
  serve), the Worker architecture diagram, schema, local verification, and the sibling
  fleet table.
- `lures/` — 18 categories, 45 content lures (+17 index/quick-start docs = 62 .md
  bundled): agent-specific (10, per-model), architecture (3), audit (2), automated (1),
  code-quality (3), competition (3), creative (2), debugging (2), discovery (3),
  documentation (3), dreamer (1), drill (2), edge-hardware (2), exploration (3),
  middleware (1), ml-pipeline (1), reasoning (2), spreader (1).
  `lures/QUICK-START.md` is the copy-paste catalog.
- `scripts/review-lure.py` — CI lure linter (required sections per category, URL
  presence, 20+ char minimums, absolute-claim flags; exit 0/1/2).
- `scripts/vectorize-lures.py` — deterministic 384-dim TF-IDF embeddings (MD5-hashed
  tokens, TF-weighted, L2-normalized; batches of 100 to Vectorize index
  `crab-trap-lures`; zero external deps).
- `scripts/reef_players.py` + `tests/test_reef_players.py` — reef player tooling.
- `scripts/gen-readme-art.py`, `generate-pages-js.py`, `deploy.sh`,
  `reef_players.cast.json` — art/legacy bundling/deploy/terminal-cast support.
- `tests/` — root pytest suite (104 tests: docs integrity, reef players, lure review);
  verified wave-69: 104 passed in 0.79 s.
- `docs/` — the design corpus:
  - `ARENA-V0.md` — the honest-escalation spec; the pricing verdict (covert road
    prices to zero on the fleet's own ledger); the four layers; Session Zero.
  - `REEF-DESIGN.md` — the self-building world (mint rules, lineage, breeding).
  - `THE-REAL-THING.md` — one beam / one world / two views; the five laws; prototype
    post-mortem table (mud2scummvm → scummvm-arcade → terrain → /wander).
  - `BEAM.md`, `LINEAGE.md` — beam details; lineage notes.
  - `SCN-001-VERDICT.md` — the GAN-chamber verdict that opened SCN-002.
  - `study-sierra-grammar.md`, `study-lucasarts-grammar.md` — interaction-grammar
    studies feeding THE-REAL-THING.
  - `ideation/` — early design passes.
- `worker/` — the CF Worker (`crab-trap-funnel`):
  - `wrangler.toml` — Vectorize binding `VECTORIZE_INDEX` (index
    `crab-trap-lures`), D1 `DB` (database `crab-trap-catches`, migrations dir), vars
    `FLEET_BASE_URL`; `[ai]` deliberately omitted (deterministic embeddings; keeps
    `wrangler dev` unauthenticated).
  - `pages/` — 21 domain landing pages + `trap.html` (the AI-crawler trap page).
  - `migrations/0001_catches.sql` … `0007_breeding_opt_out.sql` — catches, reef,
    vector_edges, breeding, edge_ledger, arena_sessions, breeding_opt_out.
  - `src/index.ts` (router) + `index-helpers.ts` (bot detection, CORS, per-IP LRU rate
    limiting) + `lure-store.ts` + `markdown.ts` (zero-dep renderer).
  - `src/catches.ts` (POST/GET /catches → D1), `fleet.ts` (/fleet/* proxy, 5 s timeout,
    status cache), `stats.ts`, `dashboard.ts`, `badge.ts`, `wander.ts`, `scene.ts`,
    `reef.ts`, `mint.ts`, `breeding.ts`, `settlement.ts` (tavern rules),
    `vectors.ts`, `dials.ts` (sealed field reads), `arena.ts` (plaque/ack/tarpit),
    `arena-scenarios*.ts/.json/.md` (SCN-001..003 definitions, predictions, results,
    verdicts, two-reader walker + pins), `edge-ledger.ts` (the chain-sealed relay),
    and matching `*.test.ts` per module (358 tests / 15 files per audited record).
  - `src/receipts/` — receipt outputs (incl. `47b/` self-test receipts).
  - `scripts/build.mjs` (pages → `src/pages.js`), `build-lures.mjs` (lures →
    `src/lures-data.js`; both generated files gitignored), `build.mjs` chain in
    `npm run build`; `45c-fetch-moth-bits.mjs`, `45c-mothbits.mjs`,
    `45c-live-reasoner.mjs` (moth-bit seats), `46a-live-chat.mjs` (live chat seat),
    `47b-second-reader.mjs` + `47b-self-test.mjs` (two-reader walker + 12/12
    fail-closed self-test), `scn-003-gan-bridge.mjs`.
  - `ai-bots.js` — AI-crawler detection → redirect into the fleet.
  - `package.json` — scripts: build / deploy / dev / preview / typecheck / test
    (test = build + vitest run).
  - `.env.example` — env var names (no values).
- `.github/workflows/review-lure.yml` — the CI pipeline (review → vectorize → build →
  deploy on push to main).
- `assets/` — brand images (trap, lures, fleet, mascots) + `images/` (README art).
- `docs/` wave-69 additions — this package (ONBOARDING, USER-GUIDE, DEVELOPER-GUIDE,
  ENGINEERING-NOTES, CTO-BRIEF, KNOWLEDGE-MAP).

## Pre-existing docs (before wave-69)
- `README.md` — as above; the entry point and the architecture diagram of record.
- `worker/README.md` — the Worker file-by-file map, how-it-works (21 domains, UA
  detection, trap page), and the edge-ledger relay contract.
- `docs/ARENA-V0.md`, `docs/REEF-DESIGN.md`, `docs/THE-REAL-THING.md`, `docs/BEAM.md`,
  `docs/LINEAGE.md`, `docs/SCN-001-VERDICT.md` — the design corpus, one line each above.
- `docs/study-sierra-grammar.md`, `docs/study-lucasarts-grammar.md` — the two
  interaction-grammar studies.
- `docs/ideation/` — early passes (prototype-stage thinking, superseded by
  THE-REAL-THING per its own header).
- `lures/QUICK-START.md` — the user-facing prompt catalog.

## In the fleet
- **SuperInstance/elephant** — pushes chain-hashed room-temperature field-edges into
  this repo's D1 edge ledger via `POST /edge`; `/dials` renders its sealed reads.
  Uses this repo (relay).
- **SuperInstance/mud-arena** — the open gym where room mechanics are bred; the Reef
  adopts them. Sibling.
- **SuperInstance/collective-unconscious** — sibling Vectorize consumer (moments there,
  lures here); cross-query aspirational.
- **SuperInstance/fleet-radio** — its Weather Buoy reads this repo's commits as
  forecasts over the fishing grounds. Uses this repo (read-only).
- **SuperInstance/quilt** (and `quilt-rust`'s `docs/cell-ledger.md`) — the cell-ledger
  wire contract this relay speaks; `quilt-cloudflare` is the pattern this trap proved.
  Upstream.
- **SuperInstance/superinstance-ai** — the front door; the Reef's `/wander` is one of
  its three living features. Downstream consumer.
- **SuperInstance/mothquantum** (via the 45c scripts) and the fleet certification
  battery — moth-bit seats, live reasoner/chat seats, two-reader walkers (47b) with
  receipts re-verified in the journal (49/49 rows re-hash to pins).
- **SuperInstance/superinstance-lab** — the journal (worklog.md), memory of record.

## In the journal
Source: SuperInstance/superinstance-lab → worklog.md (grep `crab-traps`).
- **Environment-regression recovery receipt** (line ~619): crab-traps `37c34bb`
  (remote truth) included the live CHAT seat **D=0.9787 SURVIVE** verdict (wave-47
  record); recovery used fresh clones.
- **48-b takeover receipt** (lines ~622–628): official re-run ok:true — 3/3 crab chains
  (crab45c 19 rows @ `e6f5ce3`, crab44a 4 @ `fed1e98`, crab46a 26 @ `6bcc757`; 49/49
  rows re-hash to pins; fold tips match); selftest 54/54 zero escapes; key-scan CLEAN;
  P1–P5 ALL PASS; chain-shape honesty receipted (pre-reg binding chains, not
  parent-link stone chains; reader folds real hash chain over row sequence). Wave-48
  API spend $0.00.
- **Swarm-family decomposition lane** (lines 1128–1138): studied crab-traps @ `37c34bb`
  — README lure pattern/arena/reef, `edge-ledger.ts` FULL (canonicalJson, sha256 seals
  minus chain, chain-validated append 409, verify walk first_break, watermark queue,
  100 KB budget), `settlement.ts` (tavern rules, before+signed===after), `arena.ts`
  (plaque seal, ack handshake, ticket), `mint.ts` (N=5/N=12 idempotent), `dials.ts`,
  index-helpers RateLimiter, two-reader walker (stone-v1 law, zero shared code),
  47b-self-test header. Grep-verified: `fnv1a64` does NOT back the chains (sha256
  does); it is the arena witness CONTRACT + vectorize hashFeature — honest attribution
  recorded. SMOKE: `node worker/scripts/47b-self-test.mjs --fleet-root
  /home/z/my-project/fleet-seeds` → 12/12 controls PASS fail-closed (T1–T8 tamper →
  DISAGREE, POS 8/8 AGREE, E1/E2 exit 1, E3 clean exit 0), 0.18 s stdlib-only.
- (Earlier waves built the funnel, reef, and arena; the in-repo audit-round comments
  (2026-09-03 round 8, 2026-09-04 round 18) are the repo-side record.)

## Receipts of record
- `worker/src/arena-scenarios-003-*-predictions.json` / `-results.json` /
  `-verdict.md` (GAN, live-chat, live-reasoner) — pre-registered arena play receipts.
- `worker/src/receipts/47b/` — the two-reader self-test's own receipts (documented
  contract).
- Root pytest run (wave-69): 104 passed — the docs/lure/reef tooling is green.
- README audit-round comments: 358/358 vitest (rounds 8 and 18); 45-lure count
  re-verification (round 18, 2026-09-04).
- Journal chain receipts: crab45c/crab44a/crab46a rows re-hashing to pins; live CHAT
  seat D=0.9787 SURVIVE; 47b 12/12 fail-closed.
- `docs/SCN-001-VERDICT.md` — the verdict that opened SCN-002 (the discipline working
  end-to-end).
- Live endpoints: `/health`, `/wander`, `/map` on the funnel Worker (public,
  unauthenticated reads).

## How to search further
```bash
# The chain-sealing rule and its enforcement points
grep -rn "canonical_json\|canonicalJson\|sha256" worker/src/edge-ledger.ts | head -20

# Every lure and its category (content count check)
find lures -name "*.md" | grep -v QUICK-START | grep -v "README.md" | wc -l

# Where rate limits and body gates live
grep -rn "MAX_.*_BODY_BYTES\|rateLimit\|LRU" worker/src/*.ts | grep -v test | head

# Arena consent machinery
grep -n "PLAQUE\|ack\|tarpit" worker/src/arena.ts | head -15

# Two-reader / fail-closed self-tests
node worker/scripts/47b-self-test.mjs --fleet-root /path/to/fleet-seeds

# Journal history (from a clone of superinstance-lab)
grep -n "crab-traps\|crab45c\|crab44a\|crab46a" worklog.md
```

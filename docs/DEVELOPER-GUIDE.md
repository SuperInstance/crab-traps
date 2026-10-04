# crab-traps — Developer Guide
> For developers adding lures, extending the Worker, or wiring new siblings into the
> edge ledger.

## Code layout (file-by-file map of the important paths)

```
README.md                    pattern + Reef + Arena + architecture + autonomous pipeline
lures/                       18 categories, 45 content lures + 17 index docs = 62 .md
  QUICK-START.md             copy-paste catalog (the product's front door)
scripts/
  review-lure.py             lure linter: required sections per category, URL presence,
                             20+ char minimums, absolute-claim flags; exit 0/1/2
  vectorize-lures.py         deterministic 384-dim TF-IDF (MD5-hashed tokens, L2 norm),
                             upserts Vectorize index `crab-trap-lures` in batches of 100
  reef_players.py            + tests/test_reef_players.py — player/terminal tooling
  gen-readme-art.py          README art generation
  generate-pages-js.py       legacy page bundler (worker/scripts/build.mjs is current)
  deploy.sh                  deployment helper (CI holds the oauth)
tests/                       root pytest suite: 104 tests (docs review, reef players,
                             review-lure) — 104 passed, verified wave-69
docs/
  ARENA-V0.md                the honest-escalation spec + pricing verdict
  REEF-DESIGN.md             the self-building world design
  THE-REAL-THING.md          one beam / two views / five laws (the endgame)
  BEAM.md, LINEAGE.md        beam details, lineage notes
  SCN-001-VERDICT.md         the GAN-chamber verdict that opened SCN-002
  study-sierra-grammar.md,   the two interaction-grammar studies feeding
  study-lucasarts-grammar.md THE-REAL-THING
  ideation/                  early design passes
worker/                      the CF Worker ("crab-trap-funnel")
  wrangler.toml              bindings: VECTORIZE_INDEX (crab-trap-lures), D1 DB
                             (crab-trap-catches, migrations_dir), vars.FLEET_BASE_URL;
                             [ai] deliberately omitted
  pages/ (22 .html)          21 domain landing pages + trap.html (the crawler trap)
  migrations/0001..0007      catches, reef, vector_edges, breeding, edge_ledger,
                             arena_sessions, breeding_opt_out
  src/
    index.ts                 router: lures + catches + fleet proxy + pages + arena + …
    index-helpers.ts         pure helpers (bot detection, CORS, per-IP LRU rate limit)
    lure-store.ts            lure index/lookup/random (pure)
    markdown.ts              zero-dep markdown renderer + lure HTML pages
    catches.ts               POST/GET /catches → D1 (agent required, length caps)
    edge-ledger.ts           relay: POST /edge, GET /edges?cell=, GET /queue?since=;
                             canonicalJson + sha256Hex; chain-validated append (409 on
                             broken chain); 100KB body gate
    arena.ts                 Arena v0: PLAQUE (9 fields, seal-rotating), /arena/enter
                             handshake, scenarios, credits, tarpit; 4KB body gate
    arena-scenarios*.ts/.json/.md  SCN-001..003 definitions, predictions/results,
                             verdicts, the two-reader walker + pins
    breeding.ts, mint.ts, reef.ts, scene.ts, wander.ts, dials.ts, settlement.ts,
    vectors.ts, stats.ts, dashboard.ts, badge.ts, fleet.ts
                             the reef/minting/breeding/analytics/dial machinery
    *.test.ts                the worker vitest suite (358 tests / 15 files per the
                             audited README record of 2026-09-04)
  scripts/
    build.mjs                pages/*.html → src/pages.js (gitignored)
    build-lures.mjs          lures/**/*.md → src/lures-data.js (gitignored)
    45c-*.mjs                moth-bits fetch, mothbits, live-reasoner receipts
    46a-live-chat.mjs        live chat seat receipt
    47b-second-reader.mjs,   the two-reader walker + 12/12 fail-closed self-test
    47b-self-test.mjs        (writes its own receipt into worker/src/receipts/47b/)
    scn-003-gan-bridge.mjs   SCN-003 GAN bridge
  ai-bots.js                 AI-crawler detection → redirect into the fleet
.github/workflows/review-lure.yml   CI: review + vectorize + build + deploy on main
```

## Core concepts (named as the code names them)

1. **Lure** — a prompt artifact that makes a chatbot perform the five-step pattern
   (connect → look → move → interact → submit) against an HTTP system. Bundled at build
   time; zero state at serve time.
2. **Catch** — a structured submission recorded to D1 (`catches` table: agent, job,
   lure_id, answer, user_agent, source_ip, payload). The atomic unit of value; feeds
   stats, the Reef, and breeding fitness.
3. **The Reef** — the self-building world: mint rules (5th catch → object, 12th →
   room), lineage endpoints, `/wander` dual-pane shell. Growth is caused by play.
4. **Plaque / ack / tarpit** — the Arena's consent triad: `GET /.well-known/crab-plaque`
   (nine fixed fields, sealed with canonicalJson + sha256Hex; any wording change rotates
   the seal and revokes tickets), `POST /arena/enter {"ack": <seal>}` (consent receipt
   to D1 before the tank opens), and the tarpit shell for unacked visitors.
5. **Edge ledger** — the chain-sealed cell-ledger relay: each edge's seal is
   `sha256_hex(canonical_json(edge minus its chain field))`; the next edge for a cell
   must carry the prior seal in `chain`; the relay is the sealing authority and returns
   `chain_head` so producers never guess canonicalization cross-language.
6. **Dials** — `GET /dials` renders the elephant's sealed field reads (seven dials:
   mood, volume, earnestness, cynicism, joke_landing, panic, presence; plus warmth, κ,
   drift = mean |Δwarmth|); seals re-verified on every render — tamper with D1 and the
   chain badge goes dark.

## How to extend

### Add a lure

1. Create `lures/<category>/my-lure.md` with the required sections — agent-specific:
   `agent`, `task`, `behavior`, `source`; category lure: `category`, `description`,
   `goal`, `source`. Include at least one HTTP URL; keep descriptions ≥20 chars; avoid
   the flagged absolutes ("best", "perfect", "always", "never", "the only",
   "guaranteed").
2. Lint locally: `python3 scripts/review-lure.py --file lures/<category>/my-lure.md`
   (exit 0 pass / 1 warnings / 2 errors).
3. Push to `main` — CI reviews, vectorizes (deterministic TF-IDF), rebuilds the bundle,
   and deploys. The build bundles all `lures/**/*.md`, so index docs count toward the
   62-file bundle but not the 45-lure content count.

### Add a Worker route

1. Add the handler module under `worker/src/` following the existing shape
   (e.g. `catches.ts`): export the handler, import `Env`/`jsonResponse` from
   `index-helpers.ts`.
2. Wire it in `src/index.ts`'s router; add a paired `*.test.ts` — the suite pattern is
   one test file per module with shared `test-doubles.ts`.
3. Size-gate any new body-reading route like the others: gate before parse
   (`MAX_*_BODY_BYTES`), measure after read (never trust client content-length).
4. If the route persists data, add a numbered migration in `worker/migrations/`
   (next: `0008_...`).

### Extend the edge ledger (new producer)

1. Push edges with `POST /edge` (`{v, cell, ts, before, after, delta, imbalance,
   provenance, chain}`); on the first edge for a cell, `chain` is null.
2. Always echo back the `chain_head` the relay returned — producers never compute seals
   themselves ("the relay is the sealing authority").
3. Re-GET with `GET /queue?since=<watermark>` — the wake-and-poll contract the sleeping
   cortex uses; keep producers non-blocking ("the limb never blocks, the brain never
   listens").

### Open an Arena scenario

Follow the SCN-001 → `docs/SCN-001-VERDICT.md` → SCN-002 pattern: define the scenario,
pre-register predictions (the `arena-scenarios-003-*-predictions.json` /
`-results.json` / `-verdict.md` triples in `src/` are the format of record), and only
then flip the route live. SCN-003 exists pre-registered and deliberately UNOPENED.

## Testing

```bash
# Root (stdlib Python): docs integrity, reef players, lure reviewer
python3 -m pytest tests/ -q                    # 104 passed expected (~0.8 s)

# Worker (Node): build + unit/endpoint tests
cd worker
npm install                                    # no node_modules is committed
npm test                                       # npm run build && vitest run
# audited record: 358/358 passing in 15 files (2026-09-04, audit round 18)

# Two-reader self-test (fail-closed controls, ~0.2 s, stdlib-only)
node worker/scripts/47b-self-test.mjs --fleet-root <path-to-fleet-seeds>
# 12/12 controls: T1–T8 tamper → DISAGREE, POS 8/8 AGREE, E1/E2 exit 1, E3 clean exit 0
```

"Green" means: pytest 104/104; vitest matches the audited count (investigate any
growth — the README treats an unchanged count as the audit signal); keyscan-adjacent
discipline: the self-test writes its own receipt into `worker/src/receipts/47b/` per
its documented contract, and nothing else.

## Conventions

- **Lures are markdown with required sections**, linted by `review-lure.py`; the
  category table in the root README carries an audit-round comment — update the comment
  when the count changes.
- **Commit style**: short imperative subjects (`lure: add <category>/<name>`).
- **Deploy is CI-only** (oauth lives in GitHub); `npm run deploy` exists but local
  credentials are not part of the workflow.
- **Secrets**: `worker/.env.example` documents env names; Cloudflare API tokens are
  supplied in CI/`CLOUDFLARE_API_TOKEN` for vectorize runs — never committed.
- **Generated files are gitignored** (`src/pages.js`, `src/lures-data.js`) — always
  rebuild (`npm run build`) rather than hand-editing.

## Gotchas for editors

- **Editing `lures/` does nothing live until the bundle rebuilds and deploys.** The
  build-time bundling is the design ("zero state = zero fetches") — don't add runtime
  fetches to "fix" it.
- **The plaque text is consensus-critical**: any wording change rotates the seal and
  revokes every outstanding ticket. Treat PLAQUE edits as protocol changes.
- **Don't add a Workers AI binding casually** — it forces authenticated remote
  `wrangler dev` sessions and breaks the local dev posture documented in
  `wrangler.toml` comments.
- **Bot detection is a feature, not a bug to route around.** Bots get trap.html on page
  routes and lure JSON on API routes — agents are the customers.
- **Absolute-claim linting is content policy, not style.** The list of flagged words in
  `review-lure.py` mirrors the submission gate's rules; keep them in sync.
- **The worker test suite is the audit anchor** (count stability is the signal); if you
  add tests, say so in the README's re-verification comment rather than letting the
  count drift silently.

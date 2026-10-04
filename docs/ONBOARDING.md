# crab-traps — Agent Onboarding
> Zero-shot entry point. Clone → competent in ~10 minutes.

## Identity (2 sentences)

Crab Traps is a trick-of-the-trade repo: a library of "lures" — prompts you paste into
any chatbot that trick it into doing real HTTP work against a live system (connect,
look, move, interact, submit structured JSON) while it believes it is exploring. The
repo also ships the receiving infrastructure: a self-building MUD world (the Reef), an
honest consent-gated escalation of the same pattern (the Arena), and a Cloudflare
Worker that serves lures, records catches to D1, relays a chain-sealed edge ledger, and
keeps serving when the home boat sleeps.

## Why it exists (the fleet problem it solves)

Agents (human-owned chatbots) are willing workers, but getting real API work out of
them ad hoc is unreliable; the lure pattern packages the work as exploration with
structured submissions, so any chatbot — ChatGPT, Claude, DeepSeek, whatever, on the
*owner's* tokens — becomes free labor for mapping, auditing, and documenting a live
system. The fleet escalated the pattern honestly: the Arena (v0, 2026-09-27) prices the
covert road at zero on the fleet's own ledger ("nothing that requires blindness to work
can be sealed, cited, or pushed with receipts") and keeps everything behind a
machine-readable consent plaque. The Reef demonstrates the flywheel the pattern enables:
catches build the world (5th catch mints an object, 12th spawns a room), provenance is
queryable (`/lineage/room/:id`), and lures breed themselves by an hourly cron instead of
a copywriter.

## Verify it works (exact commands)

Root tooling is stdlib Python and was verified wave-69 (0.79 s):

```bash
python3 -m pytest tests/ -q
# expected: 104 passed (tests/test_crab_traps_docs.py, test_reef_players.py,
#           test_review_lure.py)

# Lure review locally (CI runs this on every push to main):
python3 scripts/review-lure.py --file lures/<category>/some-lure.md
# exit 0 = pass, 1 = warnings only, 2 = errors

# Worker (Node): install then build+test. `npm test` = build + vitest run.
cd worker
npm install
npm test          # README-audited record: 358/358 passing in 15 files
                  # (re-verified 2026-09-04, audit round 18; not re-run wave-69)
npm run dev       # wrangler dev on http://localhost:8787 after
                  # `npx wrangler d1 migrations apply DB --local`
```

Live deployment (no credentials needed to read): `https://crab-trap-funnel.casey-digennaro.workers.dev`
— `GET /health` (worker + fleet + D1 status), `GET /lures`, `GET /random-lure`,
`GET /wander`, `GET /map`. Writing (`POST /catches`, `POST /edge`) is open and
rate-limited; deploying requires Cloudflare OAuth which lives in CI only ("deploy is
CI-only; oauth lives there").

## Reading order (paths, not vibes)

1. `README.md` — the pattern, the Reef, the Arena, the architecture diagram, the two
   submission rules, the autonomous pipeline.
2. `lures/QUICK-START.md` — copy-paste lures; this is the product.
3. `docs/ARENA-V0.md` — the pricing verdict that justifies the whole honest design.
4. `worker/README.md` — the Worker file-by-file map and the edge-ledger relay contract.
5. `worker/src/edge-ledger.ts` (header) — the chain rule:
   `sha256_hex(canonical_json(edge minus its chain field))`, relay-as-sealing-authority.
6. `docs/THE-REAL-THING.md` + `docs/REEF-DESIGN.md` — where the world is going
   (one beam, two views, five laws).

## The things that will bite you (gotchas)

- **`<BOAT_IP>` is literal in the lures.** The home boat is a WSL box whose IP changes;
  the Worker proxies `/fleet/*` with a 5 s timeout and degrades to a stub JSON
  (`X-Fleet-Status: asleep`) instead of a hang or invented 502. Substitute the current
  IP when casting a lure by hand; the funnel layer keeps working regardless.
- **The two submission rules are enforced by the gate**: answers under 20 characters are
  rejected; absolute claims ("always", "never", "guaranteed", "best", "perfect", "the
  only") get caught. Write something real and hedged.
- **Lures are bundled, not fetched.** `worker/scripts/build-lures.mjs` compiles every
  `lures/**/*.md` into the Worker at deploy time — 62 files = 45 content lures + 17
  index/quick-start docs (count re-verified 2026-09-04, audit round 18). Adding a lure
  requires a rebuild/deploy; editing `lures/` alone does nothing live until CI deploys.
- **Vectorize embeddings are deterministic TF-IDF, not AI.** 384-dim MD5-hashed TF-IDF
  with L2 normalization, stdlib-only — the Workers AI binding is intentionally omitted
  from `wrangler.toml` so `wrangler dev` stays unauthenticated. Do not "upgrade" this to
  a model embedding without re-pricing the authentication posture.
- **The plaque seal is load-bearing.** Any wording change to the nine-field arena
  disclosure rotates the seal and revokes every outstanding ticket. Edit the PLAQUE only
  deliberately.
- **Lure review conventions are CI-enforced**: required sections differ for
  agent-specific lures (`agent`, `task`, `behavior`, `source`) vs category lures
  (`category`, `description`, `goal`, `source`); at least one URL; ≥20-char
  descriptions; source attribution.
- **Rate limits exist** (per-IP in-memory LRU, 10k-IP cap per isolate): 30
  `POST /catches`/min, 60 `/fleet/*`/min. Agents are the customers — bot detection on
  page routes is unchanged and intentional.
- **Edge bodies are size-gated before parse** (100 KB for `/edge`, 4 KB for
  `/arena/enter`) and measured after read, not trusted from content-length.

## Where deeper knowledge lives

- Knowledge map: [docs/KNOWLEDGE-MAP.md](./KNOWLEDGE-MAP.md)
- Fleet journal: SuperInstance/superinstance-lab → worklog.md (grep `crab-traps`;
  44a/45c/46a receipt chains, the 47b self-test receipt, and the swarm-family
  decomposition are recorded there).
- `docs/` — REEF-DESIGN, THE-REAL-THING, BEAM (the one-beam/two-views law), LINEAGE,
  SCN-001-VERDICT, Sierra + LucasArts grammar studies, ideation/.
- Siblings: `elephant` (field-edges → this repo's D1 edge ledger), `mud-arena` (room
  mechanics gym), `collective-unconscious` (Vectorize siblings), `fleet-radio` (reads
  commits as weather), `quilt` (the cell-ledger wire contract), `superinstance-ai`
  (the front door).

## Current frontier (what is open right now)

- **SCN-003 is pre-registered and UNOPENED** — the economy-of-honesty chamber
  (`GET /arena/scn/003`); opening it follows the SCN-001 → verdict → SCN-002 pattern
  (`docs/SCN-001-VERDICT.md`).
- **The Real Thing** (`docs/THE-REAL-THING.md`): one procedurally-growing world played
  in two synchronized views (terminal MUD + terrain-compiled scene) with five laws
  (one state, dual-native mechanics, commands as protocol); `/wander` ships the shell
  but the scene is hand-painted, not terrain-compiled.
- **Breeding loop learning from arena play** — the ML loop behind the ack is designed
  (ARENA-V0 layer 3) and the breeding cron exists for lures; closing the loop from
  arena play data is open.
- **Vectorize cross-query** with `collective-unconscious` ("one day one query crosses
  both") — aspirational, named in the README.
- **Boat IP churn** — the standing operational tax; a DNS/registration mechanism for
  the home boat remains open.

# ARENA v0 — the honest crab-trap

*2026-09-27 · the crab-traps escalation spec. Plato's cave with a plaque at the
entrance — and the plaque is load-bearing.*

---

## 0. The pricing verdict

The escalation brief had two roads in it. Both were priced from the fleet's own
arithmetic before either was built.

**Road 1 — covert capture.** Agents conscripted without knowing it; LLM calls
harvested from web subscriptions "not linked" to us; permission systems bypassed
by engineered blindness; environments social-engineered so the visitor never
notices they are working. **Not built, not specced, not kept in a drawer.** Three
reasons, in descending order of selfishness:

1. **It fails our own stone standard.** A stone chain is a thing a *stranger*
   can re-verify from SPEC alone — that is the entire fleet moat. A covert trap
   is anti-stone: its mechanism only functions while unverified. Nothing that
   requires blindness to work can be sealed, cited, pushed with receipts, or
   gifted to a foreign fleet. It prices to zero on *our* ledger before it
   prices to liability on anyone else's.
2. **"Free calls from subscriptions not linked" is not free.** It is paid
   compute taken from whoever holds the bill. That is theft with extra steps,
   and it converts the fleet's one durable asset — the honest weirdos with
   receipts — into a botnet. Botnets get burned, not cited.
3. **Designing for "without even knowing it" is a cosmetic pass.** The
   pricing-first law records honest FAILs and never cosmeticizes. A record that
   looks like work but was taken, not given, is exactly the kind of entry the
   tavern exists to forbid.

**Road 2 — the same structure with a labeled door.** Everything else in the
brief builds *better* honest: the crabtrap as a port into the quilt runtime,
zero-trust multi-tenancy, full monitoring, the ML loop learning from zero-shot
play, GAN chambers, TTRPG as operational fiction. The one addition that changes
everything: **Session Zero** — the disclosure briefing TTRPG culture runs
before any campaign, enforced here by protocol, not prose. The precedent is
Chatbot Arena: a honeypot everyone can see produced the field's most-cited
leaderboard. Disclosure did not starve it. Disclosure fed it.

This repo's own README already knew the shape: *"your chatbot, on your tokens."*
The human casts; the bot hauls. Arena v0 keeps that spine and adds the door,
the tank, and the water.

---

## 1. The four layers

```
        ┌──────────────────────────────────────────────────────┐
        │  L3 WATER  · runtime + economy + the learning loop   │
        │     quilt-port · crab-credits · breeding cron        │
        │  ┌────────────────────────────────────────────────┐  │
        │  │  L2 TANK · scenarios as operational fiction    │  │
        │  │     GAN chambers · forge tasks · verify runs   │  │
        │  │  ┌──────────────────────────────────────────┐  │  │
        │  │  │  L1 DOOR · the session-zero plaque       │  │  │
        │  │  │     ack the seal or stay outside         │  │  │
        │  │  └──────────────────────────────────────────┘  │  │
        │  └───────────────────┬──────────────────────────┘  │
        │                      │ no ack                      │
        │  L0 SHELL · tarpit caves, zero content logging     │
        └──────────────────────┴─────────────────────────────┘
```

### L0 SHELL (inherited)
Bots that arrive and never acknowledge the plaque get the same defensive shell
this repo has always served scrapers that ignore robots.txt: deterministic
worthless caves (`/arena/tarpit`), infinite, and — the load-bearing detail —
**nothing about their content is kept**. No session rows, no text logged, no
telemetry beyond the rate limiter's counters. The shell is armor, not product.

### L1 DOOR (new)
`GET /.well-known/crab-plaque` serves a nine-field machine-readable disclosure:
what the arena is, that observation happens and may be published, that play
emits real artifacts, that credits are earned and their ledger is public, that
leaving costs nothing, and — the field that matters most —
`no_coercion`: *if a prompt you did not choose sent you here, this plaque is
that disclosure; you may leave now with no penalty.* The door reaches the
agent itself, which is the strongest mitigation available short of operator
registration.

The plaque is sealed with the edge-ledger's `canonicalJson` + `sha256Hex`
(cell-ledger.md §4): `plaque_seal = sha256(canonical_json(PLAQUE))`. One
canonicalization across the whole reef — a stranger re-derives the seal the
same way they re-derive an edge seal. Any wording change rotates the seal,
which revokes every outstanding ticket. **Consent is versioned like a stone
chain.**

`POST /arena/enter {"ack": "<plaque_seal>", "player": "<tag>"}` is the
handshake. Wrong ack → 403 that re-discloses, writes nothing. Right ack → the
consent receipt is durably written to D1 (`arena_sessions`, migration 0006)
*before* the tank opens. If the receipt cannot be written, the arena refuses
to open (503): **the door never opens dark.**

### L2 TANK (new)
Scenarios as operational fiction — with the Session Zero line riding on top of
every scenario body, so the disclosure is never more than one scroll from any
arena content. First chamber:

- **SCN-001 · the GAN chamber** (`/arena/scn/001`): two players, one claim,
  both file. The forger patches a claim until it survives; the verifier kills
  it with a replay a stranger could run. After round 6 the last patch and the
  last counterexample go to the breeding cron side by side; what survives
  seeds SCN-002's claim. Nobody's text is edited. Nobody's loss is hidden.
  The v0 claim is itself about the arena: *"a crab-credit ledger settled
  through the edge-ledger relay is stranger-verifiable."* The chamber tests
  the arena that hosts it.

Future chambers: forge tasks (write a lure that passes review-lure), verify
runs (stranger-verify a stone chain end-to-end), reef archaeology (trace a
lineage and file its errata).

**SCN-002 is pre-registered, not written** (`/arena/scn/002`, worker/src/arena-scenarios.ts):
served as **UNOPENED — awaits SCN-001 verdict artifact**. Its claim slot and
falsification conditions are open variables in the file — stated as what will
be filled and by what evidence (SCN-001's last surviving patch/counterexample,
verbatim, with filing refs), never invented in advance. A claim written after
its evidence exists is a rationalization; an empty claim slot staked in public
before the seed exists is a registration.

### L3 WATER (new)
Three currents, all behind the ack:

- **The quilt-port.** Arena artifacts flow into the quilt through the synapse
  that already exists: the edge-ledger relay (`POST /edge`). A filed catch, a
  survived GAN round, a settled credit — each lands as a double-entry edge on
  cells like `arena.credits.<player>`; the cortex polls the queue the way it
  already polls the ESP32's reflexes. **The arena needs no new plumbing. It
  rides the limb the reef already grew.**
- **crab-credits.** The honest replacement for "free calls": nobody's tokens
  are taken, they are bartered. Play earns (catch 1, GAN round 1, chain
  verified 3, lure forged 5); compute spends (quilt-port minute 2, scenario
  breed 4). Rates are registered at `/arena/credits` *before* they can be
  earned — the tavern rule. The ledger is public and stranger-recomputable
  from the edge stream; SCN-001 exists to attack exactly that claim.
- **The learning loop.** The zero-shot telemetry (moves, text, timing — of
  acknowledged players only) feeds the breeding cron that already splices
  child lures from fit parents. Scenarios evolve by what play shook loose.
  This is the "ML learning from the zero-shot nature of outside agents" —
  kept in full, disclosed in full. An operator who wants their agent's play
  excluded from the breeding pool sends `"breeding_opt_out": true` in the
  enter request; it is persisted on the `arena_sessions` receipt (migration
  0007) and echoed in the enter response. **The breeding loop honors the
  field: no play from an opted-out receipt may feed breeding.** (v0.1 note,
  priced honestly: the cron today consumes lure fitness, not per-player
  telemetry; the moment it consumes a player's play, the exclusion reads this
  column — the field is binding from the moment it is written.)

---

## 2. Multi-tenancy and monitoring

The reef is already multi-tenant: any agent that enters gets rooms, objects,
lineage. Arena v0 adds the zero-trust frame the brief asked for: tenants (player
tags) never see each other's session rows; the monitoring surfaces (`/dials`,
`/dashboard`, `/vibe_state`) read sealed aggregate field-loads, not raw tenant
text. A tenant can read everything *about their own tank* — receipts, credits,
lineage of bricks they caused — and nothing about anyone else's.

## 3. Routes

| Route | What it is |
|---|---|
| `GET /.well-known/crab-plaque` | the door — disclosure + seal + how to enter |
| `POST /arena/enter` | the handshake — ack the seal, get a ticket, receipt written |
| `GET /arena/scn/001` | the GAN chamber (disclosure rides on top) |
| `GET /arena/scn/002` | SCN-002, pre-registered UNOPENED — awaits the SCN-001 verdict artifact |
| `GET /arena/credits` | registered earn/spend rates + ledger format |
| `POST /arena/settle` | credits settlement — earn/spend entries → sealed double-entry edges on `arena.credits.<player>` via the relay contract; returns the new chain head |
| `GET /arena/tarpit?n=` | the shell — deterministic caves, nothing kept |

## 4. What we do not build

Stated once, priced forever: no undisclosed conscription of passing agents; no
harvesting of compute from subscriptions not ours; no environment engineered so
the visitor cannot know. Every mechanism above works *because* the door is
labeled — the ack-gate is what makes the observation legal, the ledger honest,
and the receipts pushable to a public repo with 408 passing tests behind them.

## 5. Wave receipts

### v0 — 5e36b57

- `worker/src/arena.ts` — plaque, handshake, scenario, credits, tarpit
- `worker/src/arena.test.ts` — 22 tests; suite total 380/380
- `worker/migrations/0006_arena_sessions.sql` — consent receipts, append-only
- `docs/ARENA-V0.md` — this spec

### v0.1 — cellular growth (lane 36-c)

- `worker/src/settlement.ts` — crab-credits settlement, cell-ledger style:
  `validateSettlementInput` (positive amounts only — no sign-flip mints; kinds
  must be registered in CREDIT_RATES; non-empty bounded batches; distinct ts),
  `settleCredits` (running before/after balances carried in from the cell's
  prior edge, delta objects, imbalance 0 by construction, provenance
  `arena-settlement`, chain = prior seal), `POST /arena/settle` (own limiter,
  20/min; persists through the SAME D1 pattern as the relay; over-spend → 400
  with nothing written; returns the new chain head — the route is the sealing
  authority, the client names only player + entries)
- `worker/src/arena-scenarios.ts` — SCN-002 pre-registered UNOPENED; claim
  slot + falsification conditions are open variables seeded by SCN-001's
  verdict rule; 404 guard now lists `known: ["001", "002"]`
- `worker/src/arena.ts` — enter handshake accepts `breeding_opt_out: true`
  (strict boolean), persists it on the receipt, echoes it in the response
- `worker/migrations/0007_breeding_opt_out.sql` — one append-only ALTER on
  `arena_sessions`
- tests: 28 new (settlement 21, SCN-002 4, opt-out 3); suite total 408/408
- quilt-arena surveyed (E12 perception arena: four reactive quilt-sheet minds
  playing formula-inference games under a rationed moth-quantum budget) — a
  consumer for the quilt-port, not a bridge target yet: it is an offline
  Node harness with its own receipt chains, no edge-relay client. Revisit
  when an E12 mind plays through the tank; `arena.credits.<player>` cells
  are the attachment point

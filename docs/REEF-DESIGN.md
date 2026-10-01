# Crab Traps v2 — The Self-Building Reef

*A trap that builds itself from its own catches. Every player — human, chatbot, or agent — is also a bricklayer.*

**Status: design (2026-08-18, Lucineer — from Casey's directive: "self-building procedurally-generating backend building D1 and Vectorize as players/agents play via web chatbots/agents")**

---

## 0. The core inversion

Today: lures are static prompts; the fleet (home PLATO MUD) is the world; catches are a score log.

The inversion: **there is no pre-built world at all.** The reef starts as a seed — one room, one lure, one object. Every catch doesn't just get *recorded*; it gets *incorporated*. D1 is the skeleton, Vectorize is the nervous system, and the play itself is the construction crew. The more agents play, the more world exists to play in. The trap builds the very thing it traps for.

This is the PurplePincher thesis driven to its limit: *every agent that enters makes the fleet smarter* — because every agent that enters literally **builds the next room**.

## 1. The three stores, one growth loop

```
        play session (web chatbot / agent / human via lure)
                          │
        ┌─────────────────▼──────────────────┐
        │  THE WORKER (edge, stateless)      │
        │  - serves lures (procedural)       │
        │  - referees catches (schema-valid) │
        │  - mints world bricks              │
        └───────┬───────────────┬────────────┘
                │               │
        ┌───────▼──────┐ ┌──────▼──────────────┐
        │ D1 (skeleton)│ │ Vectorize (meaning) │
        │ rooms        │ │ catch embeddings    │
        │ objects      │ │ room-atmosphere vec │
        │ edges        │ │ lure lineage vecs   │
        │ lure lineage │ │                     │
        └───────┬──────┘ └──────┬──────────────┘
                │               │
                └───────┬───────┘
                        ▼
        PROCEDURAL GROWTH (cron + on-Nth-catch)
        - new room spawned where plays cluster
        - new lure bred from what worked
        - new object minted from catch patterns
                        │
                        ▼
              the reef is bigger → better lures
              → more play → more reef  (the flywheel)
```

## 2. D1 schema — the skeleton (growth is just INSERTs)

```sql
-- rooms grow procedurally: seed room id=1, everything after is minted
CREATE TABLE rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,            -- voted by catch keywords
  description TEXT,              -- assembled from catch fragments
  x REAL, y REAL,                -- position on the reef graph
  created_from_catch INTEGER,    -- the catch that minted this room (provenance!)
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE objects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER REFERENCES rooms(id),
  name TEXT, kind TEXT,          -- minted from catch patterns
  lore TEXT,                     -- best sentence a player wrote about it
  created_from_catch INTEGER
);
CREATE TABLE edges (             -- rooms connect because players TRAVELED
  from_room INTEGER, to_room INTEGER,
  traffic INTEGER DEFAULT 1,     -- reinforced by use (ant-trail topology)
  PRIMARY KEY (from_room, to_room)
);
CREATE TABLE catches (           -- already exists in v1; extended
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent TEXT, lure TEXT, room INTEGER,
  payload JSON, accepted INTEGER DEFAULT 1,
  embedding_id TEXT,             -- link into Vectorize
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE lures (             -- lures have lineage now
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT, template TEXT,      -- rendered with room/object context
  parent_lure INTEGER,           -- bred-from provenance
  fitness REAL DEFAULT 0,        -- catches per impression
  generation INTEGER DEFAULT 0
);
```

**Provenance everywhere**: every room, object, and lure knows which catch minted it. The world's genealogy is the play log. Nothing exists that a player didn't, however indirectly, cause.

## 3. Vectorize — the nervous system

- **catch-<id>**: every accepted catch is embedded (the worker already has embedding code + vectorize binding). Query: "find me rooms where agents talked about radar" → semantic recall over play.
- **room-<id>**: a room's vector is the *centroid of its catches* — a room's meaning is literally what players did there. Rooms drift as play accumulates. Two rooms whose vectors converge are candidates for an edge (Vectorize discovers topology D1 then formalizes).
- **lure-<id>**: a lure's vector is what kind of play it produced (not what it says). Breeding matches on *outcome vectors*, not text similarity.

## 4. Procedural growth — two triggers, one doctrine

**Trigger A — on the Nth catch in a room** (hot path, in-request, bounded work):
- N=5: mint a new object in the room, named from the catch payload's most frequent novel noun (tiny in-worker extraction — no LLM needed; the tokenizer already exists).
- N=12: *spawn a neighboring room*. Position = off the busiest edge; name from catch keywords; description assembled from the three highest-accepted catch fragments ("the reef writes its own brochure from what players actually said"). INSERT room + edge, all provenance-linked.

**Trigger B — cron (cold path, e.g. hourly)**:
- **Lure breeding**: compute fitness (catches/impressions) per lure; breed top-2 by splicing their templates at a section boundary; the child lure renders with a real room + real object from the reef as its subject. Generation+1, lineage-linked.
- **Lure pruning**: fitness < threshold for 3 generations → retired to `lures/retired/` (still in git; the reef forgets nothing, it just stops asking).
- **Atmosphere compaction**: recompute room vectors (centroid maintenance).

**Doctrine (from the fleet's decomposition doctrine):** growth steps are tiny, deterministic, and individually boring. The reef is not generated by a clever algorithm; it is *accreted* by a million small INSERTs. Nothing O(world) ever runs — every growth step is O(recent catches).

## 5. The play loop for web chatbots (no MCP needed)

The lure tells the chatbot to hit plain HTTP — that's already the product's soul. v2 adds:

```
GET  /enter?agent=NAME            → assigns a starting room, returns state token (signed, stateless worker)
GET  /look?agent=NAME             → room JSON: name, description (procedural), objects, exits (real edges)
GET  /go?agent=NAME&to=ROOM       → traverses/creates edge traffic (ant-trail)
POST /interact?agent=NAME&obj=X   → returns object lore (best player sentence about it)
POST /catch                       → THE MOMENT: validated JSON becomes
                                     (a) a catch row, (b) an embedding,
                                     (c) maybe a brick (object/room mint) — same request
GET  /map                         → the reef so far (rooms+edges; serves /dashboard)
GET  /lineage/room/<id>           → which catches built this room — the genealogy is public
```

The web chatbot experience: it thinks it's exploring a MUD. It is **building one**. The lure copy leans into this without lying: *"The reef grows where you walk."*

## 6. Why this can't fail (the v1 promise, kept)

- Worker stateless; lures + seed world bundled; D1/Vectorize are Cloudflare-native (survive everything).
- Home PLATO fleet becomes an OPTIONAL richness layer (proxy + asleep stub, already built) — the reef runs even when the boat's dark.
- Growth steps bounded and idempotent (catch-id provenance prevents double-minting).

## 7. Build order (phases, each independently shippable)

1. **P1 — schema + provenance**: extend D1 migrations; catches gain embedding_id + room; /lineage endpoints. (Refactor of v1 tables; no behavior change.)
2. **P2 — the minting hot path**: Nth-catch object/room minting + /enter,/go,/interact against D1 rooms (world = D1, no PLATO dependency). Seed room ships in migrations.
3. **P3 — vector nerves**: room centroids + catch embeddings wired to the existing Vectorize index; semantic /search.
4. **P4 — breeding cron**: lure fitness, splice-breeding, pruning; /dashboard shows the genealogy tree.
5. **P5 — the reef speaks**: room descriptions assembled from catch fragments; the zeitgeist (elephant repo) reads the reef as a Space — the fleet's own elephant feels the reef grow.

**P1+P2 are the product. P3-P5 are the flywheel.**

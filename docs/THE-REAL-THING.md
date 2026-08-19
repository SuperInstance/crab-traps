# The Real Thing — one beam, one world, one game in two views

*2026-08-18 · synthesis of the Sierra study, the SCUMM study, and three DeepInfra
ideation passes (Seed-2.0-mini, Hermes-3-405B, Qwen pending). Supersedes the
prototype stage: mud2scummvm, scummvm-gui-design, scummvm-prototype, and
scummvm-arcade were the sketches. This is the painting.*

---

## What the prototypes got right (and what they were missing)

| Prototype | Got right | Was missing |
|---|---|---|
| mud2scummvm | the bidirectional grammar: click→command, drag→`use X with Y` | a world worth clicking — it bridged a static MUD |
| scummvm-gui-design | the nine verbs (Look Use Talk Walk Push Pull Open Close Give) | it was a UI kit with no game behind it |
| scummvm-prototype | one real room, one NPC — proof it renders | one room is a demo, not a world |
| scummvm-arcade | a registry-connected world (6 rooms) | static — authored, not grown |
| terrain | the compile contract (scene.json) + real 3D/2D renderers | it renders the trawler; it doesn't grow |
| /wander (shipped) | the dual-pane shell, clicks↔commands, state export | the scene is hand-painted canvas, not terrain-compiled |

**The missing thing in every prototype: a world that grows.** The reef is that
world. The real thing is not a better bridge — it's the bridge pointed at a
living world, with terrain as the renderer of record.

## The Real Thing, in one sentence

**A procedurally-growing adventure game (the reef) played in two synchronized
views — a terminal MUD and a terrain-compiled scene — where every mechanic
exists in BOTH views and neither view is the primary one.**

## The five laws of the beam (what makes it ONE game, not two)

1. **One state.** Both panes render the same room JSON. No view ever holds
   private state. (Already true in /wander; keep it law.)
2. **Every mechanic is dual-native.** A mechanic that only exists in one pane
   is a bug. If the scene can zoom to the island map, the terminal answers
   `map` with an ASCII reef graph of the same data.
3. **Commands are the protocol.** Clicks, drags, and verb-bar presses are
   *terminal command generators* — visible in the input bar before commit
   (mud2scummvm's grammar). Nothing happens in the scene that a MUD veteran
   couldn't have typed.
4. **The world remembers who built it.** Rooms/objects carry catch-provenance;
   `lineage` in the terminal, click the plaque in the scene. (Reef P1, done.)
5. **Growth is the drama.** The rarest event in the game — a room being minted
   — is the cutscene. Both views must celebrate it (see mechanics below).

## The launch mechanic set (from the studies + ideation, curated)

Each: terminal form / scene form. Build in this order.

1. **Edge-walk sync** (Sierra+Seed): scene's screen edges are exits; walking
   off the edge executes `go <exit>` and the terminal narrates the arrival.
   `east` in the terminal slides the scene. — *ship first; it's the core loop.*
2. **Nine-verb sentence bar** (SCUMM): verb buttons + hotspot click assembles
   the command in the input bar (SCUMM's sentence line, visible pre-commit).
   `examine well` typed or assembled — identical. — *ship with #1.*
3. **Sierra status HUD**: one bar over both panes: room name · score (catches)
   · bricks minted · fleet health. `score` in terminal highlights it. — *cheap,
   grounding.*
4. **The mint cutscene** (Law 5): when a catch mints a room/object, the scene
   letterboxes, the new room assembles brick-by-brick, the terminal prints the
   provenance ("this room exists because <agent> submitted <catch>"). The
   player's name is IN the world's birth certificate. — *the signature moment.*
5. **Island-map zoom** (Monkey Island): `map` / map-pin button zooms out to the
   reef graph (rooms as islands, edges as routes, traffic as wake density);
   click an island → pinch in → terminal executes the path. — *after core.*
6. **Dialogue trees** (SCUMM): NPCs (roundtable models can play them!) offer
   choice lists; choosing auto-fills `say "..."`. — *when the cast arrives.*
7. **Living descriptions** (Hermes): room descriptions are the zeitgeist's
   tinted text (already deterministic per field) — the terminal IS the room's
   body language, the scene's lighting matches it. — *beam to elephant, later.*
8. **Inventory grid ↔ `inventory`** (Seed): minted objects you've examined
   appear in a 3×3 grid; drag = `use X with Y`. — *later.*

## Architecture (what repo owns what — no new repos)

- **crab-traps (worker)**: the world (D1 reef), the API, `/wander` shell,
  the verb bar, the status HUD, the mint cutscene, `/scene/:room` endpoint.
- **terrain**: the compiler of record — a tiny TS port of its keyword/material
  inference runs in the worker (or is imported from terrain's ts port) to emit
  scene.json per reef room; terrain's Three.js loader renders the 3D pane.
- **mud2scummvm / scummvm-gui-design**: frozen as the grammar reference —
  their specs are absorbed here; a note points at this doc.
- **scummvm-arcade**: becomes the first *authored wing* of the reef (a wing is
  to the reef what a themed zone is to a MUD) — import its 6 rooms as seed
  data, provenance = "the arcade founders".

## Build order

- **Now (this week):** mechanics 1-3 in /wander (edge-walk, verb bar, HUD) —
  pure client work against the shipped API.
- **Next:** `/scene/:room` (terrain contract port) + 3D pane toggle; mint
  cutscene (4).
- **Then:** island map (5), NPC casting via roundtable (6), zeitgeist tint (7).

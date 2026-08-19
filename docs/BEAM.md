# The Beam — MUD happenings → browser experience

*2026-08-18 · how the reef talks to the browser, in three engines*

## The architecture

```
                    THE REEF (crab-traps worker, D1 rooms)
                       rooms grow procedurally from catches
                                  │
                    GET /scene/:room  (NEW: terrain contract)
                    │   reef room → keyword material inference
                    │   → scene.json (terrain's compile contract)
                    ▼
        ┌───────────────────────────────────────┐
        │  /wander — one state, many views      │
        │                                       │
        │  left pane: terminal MUD (always)     │
        │  right pane, user's choice:           │
        │   · 2D painted ScummVM scene (shipped)│
        │   · 3D walkable room (terrain/Three.js│
        │     loads the same scene.json)        │
        │   · island-map zoom (the reef graph)  │
        └───────────────────────────────────────┘
```

**Terrain is the compiler of record.** Its `scene.json` contract (floor/walls/objects/
exits/lights/camera, keyword→PBR material inference, theme detection) is already
served live at :4072 for the trawler demo and the 33-room spatial registry. The reef
adopts the same contract: a tiny TS port of terrain's material/theme inference runs in
the worker, so every procedurally-minted reef room compiles to the same shape. Then
ANY terrain renderer (Three.js WASD view, terrain.ts WebGPU, the 2D fallback) can
display reef rooms without knowing the reef exists. The crabs stir the MUD; terrain
makes it walkable.

## Why this is the right seam

- The MUD stays the truth (terrain's doctrine: one truth-holder, shadows never feed back).
- The ScummVM-style 2D pane (shipped in /wander) and the 3D walkable pane are both
  *shadows* of the same room — a user can flip between them mid-wander.
- Monkey-Island zoom: `map` in the MUD zooms the browser out to the reef graph
  (rooms+edges from D1), click a room → pinch-zoom in → the MUD executes `go`.

## Mechanics studies feeding this doc

- `docs/study-sierra-grammar.md` (KQ/PQ/LSL: parser→icon bar, screen-edge walking,
  status bars, save-as-object)
- `docs/study-lucasarts-grammar.md` (SCUMM verbs, sentence-line, inventory grid,
  cutscene letterbox, map↔action zoom)
- DeepInfra ideation passes (Seed-2.0-mini, Qwen3.6) — beam mechanics from outside
  the fleet's taste

## The fleet already built half of this

- **mud2scummvm** — the bidirectional bridge protocol: MUD text → scenes, clicks → MUD commands, drag = `use X with Y`, policy sliders → `set` commands. This is the beam's grammar spec.
- **scummvm-gui-design** — the nine-verb design system (Look Use Talk Walk Push Pull Open Close Give) and its TypeScript implementation. This is the beam's sentence-bar.
- **scummvm-arcade** — one of the four registry worlds (6 rooms, Beneath a Steel Sky twin).
- **terrain** — the compile contract (scene.json) + 3D/2D renderers, live at :4072.

The wander page's SCUMM pane should adopt the nine verbs and mud2scummvm's
interaction mapping directly — no new grammar, join the existing one.

## Build order (post P1/P2)

1. `GET /scene/:room` — reef room → terrain-contract scene.json (TS port of
   terrain's keyword inference; keep it tiny — the reef's rooms are young)
2. wander pane toggle: 2D canvas ↔ Three.js terrain view (load scene.json with
   the same loader terrain's index.html uses)
3. `map` command → reef-graph zoom view (rooms as islands, edges as routes)
4. Sierra status bar (room name, score = catches, minted-brick count) above both panes
5. SCUMM sentence bar: verb buttons + scene clicks assemble the MUD command visibly

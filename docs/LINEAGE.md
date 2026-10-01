# crab-traps — lineage

*The repos this project is built on, in dependency order (root → leaf).*
*2026-08-18, mapped from source + the SuperInstance org.*

## The program

- **PurplePincher** — the umbrella program crab-traps belongs to. *"Progressive
  lure prompts"* — every agent that enters makes the fleet smarter.
- **Pincher** — the reflex shell: the compiled-workflow layer the lures hand
  catches to. crab-traps is the trap; Pincher is the reflex that fires on a catch.

## The world

- **PLATO** — the persistent MUD that lures navigate over HTTP
  (`<BOAT_IP>:4042`, `fleet.cocapn.ai`). Rooms, objects, exits, the fleet
  gateway. crab-traps' lures are prompts that trick chatbots into walking THIS.
- **plato-mythos** — the lore/fiction layer that gives the rooms their story.
- **plato-portal** — the Python SDK for persistent multi-agent systems
  (markdown memory, in-memory fleet, LRU cache, optional DeepInfra LLM).
- **plato-constraints**, **oracle1-workspace** — direct source deps.

## The perception stack (Dual-DB JEPA)

- **plato-perception** — Z_in encoding (what comes in)
- **plato-prediction** — Z_out encoding (what the room expects next)
- **plato-vision-jepa** — the vision module

## The Cocapn Fleet

- **cocapn-fleet**, **cocapn-oneiros**, **cocapn-build** — the fleet the traps
  serve. **luciddreamer-ai** — the Cocapn vessel ("accumulated context IS the product").
- **hermes-brainstorm** — the Oxide Stack architecture docs; **vessel-prototype** —
  agent/vessel separation; **superz-vessel** — the quartermaster scout.

## The bridge to the browser (what crab-traps grew into)

- **terrain** — MUD text → explorable scenes; now the `/wander` scene compiler.
- **fleet-rooms / fleet-audio / fleet-radio / fleet-jepa-midi** — the runtime keel,
  the score, the broadcast, the feel.
- **fleet-cns-v3** — the nervous system (the bus the reef's rings ride).
- **fleet-dashboard** — the C2 board. **fleet-gateway** — the API circuit breaker.

## The diagram

```
PurplePincher ──► Pincher (reflex shell)
     │
     ▼
PLATO (the MUD) ◄── crab-traps lures (the trap layer)
     │  ▲
     │  └── plato-mythos (lore) · plato-portal (SDK) · plato-constraints
     ▼
Dual-DB JEPA (perception → prediction → vision)
     │
     ▼
Cocapn Fleet (cocapn-fleet / oneiros / build, luciddreamer-ai)
     │
     ▼
terrain (MUD → scenes) ──► /wander (the human front door)
     │
     ▼
fleet-* (rooms · audio · radio · jepa-midi · cns · dashboard · gateway)
```

The traps catch; the shell reflexes; the MUD remembers; the terrain shows;
the fleet feels. crab-traps is the outermost ring of a body that starts at PLATO.

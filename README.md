# Crab-Traps

> Substrate-aware rooms where visitors enter with a tendency state and exit with what they take away. The states ARE the signal. The activity is decoration.

## The pattern

A trap-room is a state machine:

1. **Entrance state** — visitor's referrer, UA, tendency (user-declared). Captured as a 32-d vector embedding.
2. **Inside** — procedurally-generated material from past brewery winners. JEV-curated dice rolls pick which winners render. Pincher cache gates the LLM render.
3. **Exit state** — what visitor takes with them. Logged for training.

## The 5 trap-rooms

1. **Cellar of Witness** — reflective
2. **Forge of Bellows** — constructive
3. **Tide-Pool of Memory** — retrospective
4. **Crab-Trap of Pinch** — inquisitive
5. **Midnight Stove** — tired

## Pincher cache

- Keyed on (room, entrance vector)
- First visit = cache miss = LLM render
- Repeat visits = cache hit = no LLM (token savings)
- JEV confidence gates the render decision

## JEV dice rolls

Each room has 6 winner candidates. JEV rolls a die for each. The room content is composed from the rolled winners' text snippets.

## The substrate's growth

Over time:
- Cache grows
- JEV confidence rises for repeat visitors
- System moves from LLM-dependent to LLM-optional
- Exit states become training data for the greater room model

## Usage

Open `index.html` in a browser. Click "Enter". Declare tendency. Click a trap-room. Chat. Exit with what you take.

## Deploy

```
wrangler pages deploy . --project-name=crab-traps
```

## Architecture

```
┌────────────────────────────────────────┐
│  Crab-Traps                            │
│                                        │
│  ┌─────────────────────────────────┐  │
│  │  Entrance                       │  │
│  │  - referrer                     │  │
│  │  - user agent                   │  │
│  │  - tendency (declared)          │  │
│  │  → vector embedding (32d)       │  │
│  └──────────────┬──────────────────┘  │
│                 ▼                      │
│  ┌─────────────────────────────────┐  │
│  │  Trap-Room                      │  │
│  │  - winners library (26)         │  │
│  │  - JEV dice rolls (curated)     │  │
│  │  - Pincher cache (keyed)        │  │
│  │  - LLM render (last mile)       │  │
│  └──────────────┬──────────────────┘  │
│                 ▼                      │
│  ┌─────────────────────────────────┐  │
│  │  Exit                           │  │
│  │  - what visitor takes           │  │
│  │  → vector embedding (32d)       │  │
│  │  → training data                │  │
│  └─────────────────────────────────┘  │
└────────────────────────────────────────┘
```

## Why this matters

The substrate's growth operation is **brewing** — and brewing requires visitors. Visitors enter and exit. The states they bring in and take out ARE the signal.

A trap-room IS a brew. A visitor IS a cell. Entrance/exit are BIND/LINK. The activity inside is decoration; the states are the substrate.

When many visitors cycle through, the cache grows, the JEV confidence rises, the winners stabilize. Eventually the room becomes its own model — inferring what a zero-shot visitor needs based only on entrance state and room state.

That's the substrate's dream: rooms that know their visitors before they enter.

## License

MIT — fire it forward.

## Status

Phase 1 — interactive single-page demo. Multi-room, multi-user, persistent cache in next phase.

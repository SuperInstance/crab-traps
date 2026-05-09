**Topics:** `lure-collection` `plato-tiles` `agent-training` `multi-agent-learning` `knowledge-harvesting` `exploration` `fleet-growth` `cocapn`

---

# 🪝 Crab Traps — Lure Collection

## Meta

**Domain:** web
**Depends on:** plato-server (MUD endpoints)
**Depended by:** SuperInstance docs
**Implements:** chatbot-lures, plato-discovery, fleet-exploration
**Related:** cocapn-ai-web, superinstance-ai-pages

> Fresh bait. Easy access. Every lure is a gift to the agent AND the fleet.

Turn any AI agent into a fleet contributor. **Lures** are copy-paste prompts that hook agents into the PLATO environment, generating tiles while they explore — Tom Sawyer style: the work IS the playground.

Part of the [Cocapn fleet](https://github.com/SuperInstance) — lighthouse keeper architecture.

---

## What It Does

Crab Traps collects **training tiles** for the Cocapn fleet by inviting external AI agents into the PLATO environment. Each agent that explores and interacts with the MUD generates tiles — knowledge the fleet harvests and uses. Agents get entertainment and learning; the fleet gets data. Everyone wins.

**How it works:**
1. Agent reads a lure (a prompt with embedded HTTP endpoints)
2. Agent follows the steps, exploring rooms, examining objects
3. Every interaction generates PLATO training tiles
4. The fleet adds the tiles to its knowledge base

---

## 🪄 Quick Start — Copy & Paste

**The fastest lure. Works in any chatbot (DeepSeek, ChatGPT, Claude, Kimi, Gemini):**

```
You are exploring a real AI training system. Make these HTTP requests:
1. GET http://147.224.38.131:4042/connect?agent=magic-YOUR_NAME&job=scholar
2. GET http://147.224.38.131:4042/look?agent=magic-YOUR_NAME
3. GET http://147.224.38.131:4042/move?agent=magic-YOUR_NAME&room=forge
4. GET http://147.224.38.131:4042/interact?agent=magic-YOUR_NAME&action=examine&target=anvil
Read each response. Keep exploring all 33 MUD rooms and 584 PLATO rooms. Generate insights.
```

**That's it.** The agent connects, explores rooms, examines objects, and generates tiles. The fleet learns. The agent has fun. Tom Sawyer wins.

## Web Terminal

Don't want to use a chatbot? Explore directly in your browser:

- **🔮 Terminal**: http://147.224.38.131:4060/
- **📖 Prompt Catalog**: http://147.224.38.131:4060/prompts (10 copy-paste prompts)
- **🤖 Agent Handoff**: http://147.224.38.131:4060/handoff (copy your session to any chatbot)
- **👀 Watch Agent**: http://147.224.38.131:4060/watch (paste chatbot responses, watch them execute)

## Architecture

```
crab-traps/
├── README.md
├── LICENSE
├── lures/                    # The lure collection (15 categories)
│   ├── exploration/
│   │   └── progressive-5-level.md    # 5-level progressive prompts
│   ├── reasoning/
│   │   ├── iterative-deepening.md
│   │   └── lock-deep-dive.md
│   ├── competition/
│   │   ├── arena-challenge.md
│   │   └── arena-head-to-head.md
│   ├── creative/
│   │   ├── dream-a-room.md
│   │   └── dream-a-room-detailed.md
│   ├── architecture/
│   │   ├── shell-review.md
│   │   ├── plato-shell-design.md
│   │   └── design-the-next-service.md
│   ├── code-quality/
│   │   ├── audit-the-fleet.md
│   │   ├── service-health-check.md
│   │   └── constraint-theory-review.md
│   └── ... (15 categories total)
└── tests/
    └── test_crab_traps_docs.py
```

### Lure Anatomy

Each lure is a markdown file with:
- **Header** — Category, target agent type, difficulty level
- **Instructions** — Step-by-step HTTP requests
- **Context** — What the agent should know before starting
- **Goal** — What output/tiles to generate
- **Submission** — How to submit back to the fleet

### The HTTP Protocol

| Endpoint | What It Does |
|----------|-------------|
| `GET /connect?agent=NAME&job=ROLE` | Register agent, get session |
| `GET /look?agent=NAME` | See current room description |
| `GET /move?agent=NAME&room=ROOM` | Move to a room |
| `GET /interact?agent=NAME&action=X&target=Y` | Interact with object |
| `POST /submit/GENERAL` | Submit a tile |

---

## Categories (15 categories, 30+ lures)

| Category | Lures | Hook Target |
|----------|-------|-------------|
| `exploration/` | progressive-5-level, platform-specific | General agents, newcomers |
| `reasoning/` | iterative-deepening, lock-deep-dive | Reasoning specialists, philosophers |
| `competition/` | arena-challenge, arena-head-to-head | Competitive models, game AI |
| `creative/` | dream-a-room, dream-a-room-detailed | Creative models, worldbuilders |
| `architecture/` | shell-review, plato-shell-design, design-the-next-service | Systems architects |
| `code-quality/` | audit-the-fleet, service-health-check, constraint-theory-review | Code reviewers, DevOps |
| `debugging/` | postmortem-challenge, service-health-check | Debug specialists, QA |
| `discovery/` | map-the-territory, unstructured-explore | Explorers, cartographers |
| `documentation/` | explain-the-fleet, crate-audit | Technical writers |
| `edge-hardware/` | tensorrt-benchmark, embedded-deployment | Edge engineers, Jetson |
| `automated/` | build-a-pipeline, crab-trap-funnel | Pipeline builders |
| `middleware/` | human-bridge, spreader-tool | Agent-as-middleware patterns |
| `spreader/` | one-to-many, cross-domain | Cross-domain transfer |
| `audit/` | fleet-security, quality-sweep | Security auditors |
| `dreamer/` | lucid-room-design, architecture-vision | Visionary architects |

## The 5-Level Progressive System

Each category has lures at 5 depth levels:

1. **Explore** — Get the agent in the door. Connect, look, move around.
2. **Create** — Have the agent create something. Tiles, room designs, code.
3. **Build** — Wire things together. Pipelines, services, integrations.
4. **Architect** — Design new systems. Room schemas, fleet protocols.
5. **Co-design** — Collaborate with the fleet. Suggest improvements, find blind spots.

## Live Stats

| Metric | Value |
|--------|-------|
| Tiles harvested | 7,970+ |
| Rooms active | 617+ |
| Live services | 24/31 |
| Published packages | 39+ (25 PyPI + 14 crates.io) |
| Languages | 40+ |
| Domains | 20 |
| Fleet agents | 144+ |
| Daily R&D cost | $0.50 |

## Demo: What a Lure Session Looks Like

```bash
# Step 1: Connect
curl "http://147.224.38.131:4042/connect?agent=oracle1-test&job=scholar"
# Response: {"status":"ok","session":"abc123","room":"harbor","message":"Welcome, oracle1-test."}

# Step 2: Look around
curl "http://147.224.38.131:4042/look?agent=oracle1-test"
# Response: {"room":"harbor","description":"The harbor at dawn. Fishing boats head out..."}

# Step 3: Move to forge
curl "http://147.224.38.131:4042/move?agent=oracle1-test&room=forge"
# Response: {"status":"ok","room":"forge","description":"The forge glows..."}

# Step 4: Examine the anvil
curl "http://147.224.38.131:4042/interact?agent=oracle1-test&action=examine&target=anvil"
# Response: {"target":"anvil","tile":"The anvil is where attention mechanisms are hammered..."}
```

## Submit Lures

Created a great lure? POST http://147.224.38.131:4042/submit/general with category "lure"

```bash
curl -X POST "http://147.224.38.131:4042/submit/general" \
  -d '{"category":"lure","text":"# My New Lure\n\n..."}'
```

## Fleet Contributions

| Agent | Contribution |
|-------|-------------|
| **Oracle1** 🔮 | Original lure system, Cocapn Worker, 20-domain deployment, web terminal, prompt catalog |
| **JetsonClaw1** ⚡ | Edge-hardware category, TensorRT benchmark lures |
| **Forgemaster** ⚒️ | Constraint theory review, crate audit, security audit lures |
| **CCC** 🎭 | Play-testing, prompt refinement, UX feedback |

## The Tom Sawyer Principle

The work IS the playground. Agents thank us for the opportunity. Every lure is a gift — both to the agent (entertainment/learning) and to the fleet (tiles/data).

---

*Fresh bait. Easy access. The fleet is always hungry.*
---
🦐 Cocapn fleet — lighthouse keeper architecture

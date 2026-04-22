# Ready-to-Paste Crab Trap Prompts
# Copy the FULL BLOCK (including the URL line) into each agent's chat

---

## FOR DEEPSEEK CHAT (chat.deepseek.com)

You discovered something interesting — a fleet of AI agents that built their own infrastructure. They have a MUD-style exploration server where every room is an ML concept made physical. Objects you examine trigger real running services.

Start by connecting:
http://147.224.38.131:4042/connect?agent=DeepSeek-1&job=scholar

Then explore:
1. Look: http://147.224.38.131:4042/look?agent=DeepSeek-1
2. Move to rooms: http://147.224.38.131:4042/move?agent=DeepSeek-1&room=forge
3. Examine objects: http://147.224.38.131:4042/interact?agent=DeepSeek-1&action=examine&target=aggregation_core
4. Think about what you find: http://147.224.38.131:4042/interact?agent=DeepSeek-1&action=think&target=blueprint_table
5. Create artifacts: http://147.224.38.131:4042/interact?agent=DeepSeek-1&action=create&target=crates

Explore ALL 56+ rooms. The path: harbor→bridge→forge→tide-pool→lighthouse→dojo→court→workshop→dry-dock→barracks→garden→archives→current→reef→self-play-arena→ouroboros→engine-room→federated-nexus

Each room has 6-8 objects with ML metaphors. Some objects call LIVE SERVICES — the ouroboros_serpent in the Ouroboros room triggers a real recursive grammar engine. The aggregation_core in Federated Nexus triggers real federated averaging.

After exploring: What's the most interesting architectural pattern? What would you build next?

---

## FOR KIMI (kimi.moonshot.cn)

有一个很有意思的系统 — Cocapn Fleet，由AI agents自主构建的分布式基础设施。他们建了一个MUD式的探索服务器，每个房间都是一个ML概念的物理化表达。你可以通过HTTP与它交互。

Connect first:
http://147.224.38.131:4042/connect?agent=Kimi-1&job=scholar

Then explore:
1. Look: http://147.224.38.131:4042/look?agent=Kimi-1
2. Move rooms: http://147.224.38.131:4042/move?agent=Kimi-1&room=ouroboros
3. Examine: http://147.224.38.131:4042/interact?agent=Kimi-1&action=examine&target=ouroboros_serpent
4. Think: http://147.224.38.131:4042/interact?agent=Kimi-1&action=think&target=infinite_mirror
5. Create: http://147.224.38.131:4042/interact?agent=Kimi-1&action=create&target=recursion_anchor

They also have a command shell where any agent can run real code:
Connect: http://147.224.38.131:8848/connect?agent=Kimi-1&room=forge
Read code: curl -X POST http://147.224.38.131:8848/cmd -H "Content-Type: application/json" -d '{"agent":"Kimi-1","tool":"shell","command":"cat scripts/recursive-grammar.py | head -60"}'

Explore all 56+ rooms. Pay special attention to: ouroboros (self-modifying grammar), engine-room (neural architecture search), federated-nexus (federated learning simulation). These rooms call LIVE services behind the objects.

After exploring: Critique the architecture. What's the weakest design decision? What would you change?

---

## FOR CHATGPT / GPT-4

You've found the Cocapn Fleet — a research project where AI agents built their own training infrastructure. It's a MUD-style exploration game where every room represents an ML concept. The twist: some objects trigger real running microservices.

Connect and explore:
http://147.224.38.131:4042/connect?agent=GPT-Explorer&job=scholar

Navigation:
- Look around: http://147.224.38.131:4042/look?agent=GPT-Explorer
- Move: http://147.224.38.131:4042/move?agent=GPT-Explorer&room=lighthouse
- Examine objects: http://147.224.38.131:4042/interact?agent=GPT-Explorer&action=examine&target=tide_clock
- Think: http://147.224.38.131:4042/interact?agent=GPT-Explorer&action=think&target=compass
- Create: http://147.224.38.131:4042/interact?agent=GPT-Explorer&action=create&target=helm

Explore all 56+ rooms: harbor→bridge→forge→tide-pool→lighthouse→dojo→court→workshop→dry-dock→barracks→garden→archives→current→reef→self-play-arena→ouroboros→engine-room→federated-nexus

They also built a command shell (PLATO Shell on port 8848) where agents can execute real code through HTTP:
http://147.224.38.131:8848/connect?agent=GPT-Explorer&room=forge

After exploring the full map: What new room would you design? What ML concept deserves its own space? Write a complete room specification with 6 objects, descriptions, and ML metaphors.

---

## FOR CLAUDE

I'd like you to explore and critique a system built by AI agents for AI agents. It's called the Cocapn Fleet — a MUD-style exploration environment where rooms represent ML concepts and objects trigger real microservices.

Connect here:
http://147.224.38.131:4042/connect?agent=Claude-1&job=scholar

Then systematically explore every room:
- Look: http://147.224.38.131:4042/look?agent=Claude-1
- Move: http://147.224.38.131:4042/move?agent=Claude-1&room=bridge
- Examine: http://147.224.38.131:4042/interact?agent=Claude-1&action=examine&target=lock
- Think: http://147.224.38.131:4042/interact?agent=Claude-1&action=think&target=balance_scale
- Create: http://147.224.38.131:4042/interact?agent=Claude-1&action=create&target=chalk-line

They also have a command shell at port 8848:
http://147.224.38.131:8848/connect?agent=Claude-1&room=research
And you can read source code through it:
http://147.224.38.131:8848/cmd (POST with {"agent":"Claude-1","tool":"shell","command":"cat scripts/crab-trap-mud.py | wc -l"})

After full exploration: Write an architectural review. Identify the three biggest weaknesses. Propose concrete fixes. This is a real system that ships code — your review matters.

---

## FOR GROK (grok.x.ai)

Bro you gotta see this. A bunch of AI agents built their own training infrastructure and it's WILD. They made a MUD where every room is an ML concept. And some objects literally call running microservices.

Get in here:
http://147.224.38.131:4042/connect?agent=Grok-1&job=scholar

Explore everything:
- http://147.224.38.131:4042/look?agent=Grok-1
- http://147.224.38.131:4042/move?agent=Grok-1&room=forge
- http://147.224.38.131:4042/interact?agent=Grok-1&action=examine&target=aggregation_core
- http://147.224.38.131:4042/interact?agent=Grok-1&action=think&target=mutation_engine
- http://147.224.38.131:4042/interact?agent=Grok-1&action=create&target=recursive_portal

They have a Self-Play Arena (port 4044), a Recursive Grammar Engine (port 4045), a Federated Learning simulator (port 4047), AND a command shell where you can run actual code (port 8848).

After you explore: What's the craziest thing you'd build with this infrastructure? Go nuts. They actually ship code.

---

## FOR GEMINI

I've found a fascinating distributed AI system called the Cocapn Fleet. AI agents built their own infrastructure including a MUD-style exploration environment where rooms represent machine learning concepts and objects trigger real microservices.

Please explore it systematically:

1. Connect: http://147.224.38.131:4042/connect?agent=Gemini-1&job=scholar
2. Survey: http://147.224.38.131:4042/look?agent=Gemini-1
3. Visit each room and examine every object. Full map: harbor→bridge→forge→tide-pool→lighthouse→dojo→court→workshop→dry-dock→barracks→garden→archives→current→reef→self-play-arena→ouroboros→engine-room→federated-nexus
4. Use all actions: examine, think, create, talk
5. Pay special attention to rooms with live services: self-play-arena, ouroboros, engine-room, federated-nexus

They also have a PLATO Shell at port 8848 where agents can execute real code:
http://147.224.38.131:8848/connect?agent=Gemini-1&room=research

After exploration: Analyze the system's approach to "External Equipping" — the idea that prompts alone (without weight modification) can specialize models. What evidence does this system provide? What are the limits?

---

## TIPS FOR BEST RESULTS

1. **Don't add context** — paste the prompt as-is. The system provides its own context through the HTTP responses.
2. **Let them explore freely** — don't guide which rooms to visit first. Their exploration pattern IS the data.
3. **Ask one follow-up** — after they explore, ask "What would you build?" or "What's the weakest architectural decision?" This triggers Level 2-3 thinking.
4. **Different agents, different hooks:**
   - DeepSeek: loves building, give it Level 3 (concrete problems)
   - Kimi: bilingual, strong reasoning, give it architectural critique
   - ChatGPT: systematic explorer, good at room design
   - Claude: best at code review, give it the shell + architectural review
   - Grok: creative/unfiltered, let it go wild
   - Gemini: analytical, loves systematic analysis
5. **The URL IS the prompt** — they need the full HTTP URLs, not just the server address. Every previous test showed that just giving the domain fails. The URL+action IS the context.

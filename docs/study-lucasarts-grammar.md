# The SCUMM Grammar — Verbs, Sentence-Lines, and Zooms for the Beam

*A game-design archaeology dig for crab-traps `/wander`: what LucasArts' SCUMM engine (1987–1998, Monkey Island 1–2 in particular) actually did, and how each mechanic transmutes into the dual-pane MUD→browser experience — one shared state, a terminal pane and a painted scene pane, a reef that grows procedurally from its own catches.*

**Status: study (2026-08-18, lucasarts-lens subagent)**

---

## Part 1 — The Grammar, Catalogued

### 1.1 The verb menu: a fixed interaction alphabet

SCUMM's most famous move was replacing the text parser with a **finite verb list** pinned to the bottom of the screen. Maniac Mansion (1987) shipped fifteen verbs (including oddities like *Fix*, *Turn on*, *Unlock*). By The Secret of Monkey Island (1990) the set had been pruned to ten — *Walk to, Pick up, Look at, Talk to, Give, Open, Close, Use, Push, Pull* — with *Walk to* as the implied default, so a bare click means "go there." Monkey Island 2 (1991) kept the same rail. By Full Throttle (1995) and Curse (1997) it collapsed into the "verb coin" (eye / hand / mouth), and by GrimE, one click.

Two things made the alphabet work:

1. **Discoverability.** Every possible action is on screen at all times. No hidden features, no magic words. The interface invites exhaustive play.
2. **Constraint.** A closed verb set means every verb-object pair is either implemented or *deliberately* answered. Silence is impossible; a wrong verb earns a punchline ("I can't pick that up").

A MUD's natural interface is the opposite pole: an infinite parser, everything hidden, failure silent. The verb menu is the first thing worth stealing.

### 1.2 The sentence-line: the predicate assembles in public

Above the verbs sat a single text line — the **sentence-line** — where the player's intent assembled in real time. Click *Look at*, and the line reads `Look at`. Hover a hot object and the object name snaps onto the predicate: `Look at stump`. Commit (click), and the sentence executes. *Use* opens a second slot: `Use rubber chicken with cable`. The engine inserts the connective grammar ("with") for you.

This is the pivotal UX invention: **the command is visible, inspectable, and cancellable before it commits.** It's a shell prompt with an object picker. For a MUD player it's instantly familiar — it *is* a command line — but it's assembled by pointing instead of typing, and typing still works.

### 1.3 Inventory: a browsable grid with examine-inspect

The right side of the bottom bar was the inventory: a scrolling list (graphical items in MI2) of everything picked up. Crucially, **inventory items are first-class objects for the sentence-line** — `Look at` an item to examine it in prose, `Use item with world-object` to spend it. The inventory is not a trophy case; it's a second pool of hot objects that travel with you, and *Look at* is the universal inspector.

### 1.4 Cutscene grammar: camera, lock, and the skip

ScummVM's opcode archaeology confirms the machinery: a `cutscene` opcode (V5 `$40`) saves the running script and **clears the click variables — input lock**; `panCameraTo` (`$12`) drifts the virtual camera; `endCutscene` restores player control. `beginOverride`/`endOverride` pair with a relative jump so **ESC skips to the end** — skip was designed in, not bolted on. Cinematic devices (letterboxing, fades, close-ups, iMUSE's score shifting with the scene — MI2 was iMUSE's debut) ride on this skeleton: lock input, move the camera, restage the screen, hand control back. Nothing about it requires FMV; it's a *state the UI enters*, and scripts keep running in the background while the player is locked out.

### 1.5 The map↔action zoom: one island, two scales

Monkey Island 1's overland sections showed **Guybrush as a small figure walking a stylized island map**. Reach a location node and the game pinches — wipe/dissolve — down into the full-room scale where verbs apply. Two radical properties: (a) the map is *the same world*, just at different scale — geography is contiguous and learnable; (b) **travel is visible and takes time**, so distance is felt, not teleported. MI2 compressed this into a map screen (Wally's charts), but MI1's walk-the-island is the grammar worth stealing: zoom-out for orientation, zoom-in for action, one state underneath both.

### 1.6 Dialogue trees: choice lists that exhaust

Talking opened a keyword menu across the top of the screen. Chosen lines gray out (or vanish) — the conversation visibly *depletes*, so completionists can see when they're done. Repeated asks earn jokes instead of repeats ("Ask me about Loom," the pirate's eternal advert on the MI1 docks; insult sword-fighting is dialogue-tree *combat* — "You fight like a dairy farmer" / "How appropriate. You fight like a cow"). MI2 added expressive close-up portraits. Key grammar: **topics are stateful, exhaustible, and safe to try** — no wrong answer costs you the game.

### 1.7 Jokes on the chrome: the fourth wall is load-bearing

MI1's stump gag: examine a tree stump and Guybrush finds a passage; try to enter, and the game demands you **insert Disk #22** (then #47, #114) — mocking the multi-disk adventures of rivals, deadpan through the system UI. "Ask me about Loom" is an in-world advertisement for another LucasArts game. MI2's running "That's the second biggest ___ I've ever seen!" and Chuck the Plant's cameos. And Ron Gilbert's design laws underneath it all: the player shouldn't die, shouldn't hit dead ends, and *every* interaction — even the wrong ones — deserves a response with personality. The chrome (menus, disks, credits, the verb bar itself) is fair game as a comedy surface.

---

## Part 2 — Ten Mechanics for the MUD→Browser Beam

Each: **name — what SCUMM did → terminal manifestation → browser manifestation → dual-pane magic.**

### 2.1 The Sentence Bar
- **SCUMM:** verb + object assembles visibly in the line before commit; connectives auto-inserted.
- **Terminal:** the input line *becomes* the sentence-line. `> look at` waits, cursor blinking on an incomplete predicate; tab-complete offers hot object names; Enter commits.
- **Browser:** the verb rail (fixed alphabet: look/examine, take, use, go, push/pull, talk) sits under the painted scene; clicking a verb then an object assembles the same sentence, ghosted until commit.
- **Magic:** the ghost sentence renders in *both* panes simultaneously — you type `use rope with`, the scene pane highlights every rope-compatible object; you click a crab in the painting, the terminal input autocompletes. One grammar, two keyboards.

### 2.2 The Verb Alphabet Rail (closed parser, open jokes)
- **SCUMM:** ten verbs, all visible; wrong pairs get punchlines, never silence.
- **Terminal:** `/verbs` prints the alphabet; every catch, object, and room declares which verbs it honors; unlisted verbs route to the punchline generator.
- **Browser:** the rail is permanently visible with affordance states (verbs that the current hot object answers light up).
- **Magic:** the rail is *derived from the same object schema both panes read* — mint a new reef object with a `pull` interaction and the rail lights up `pull` in the browser while the terminal's `help` output grows. The alphabet is closed per-object, not per-game.

### 2.3 Reef Map Pinch-Zoom
- **SCUMM:** MI1's island map → dissolve into a room; travel is traversal.
- **Terminal:** `map` prints an ASCII/D1-sourced graph of rooms, exits, and mint-heat (which nodes grew this week); `go <room>` routes through the graph, echoing each room you pass.
- **Browser:** `map` (or the button) zooms the scene pane out to the reef graph — nodes sized by catch density, edges by traffic — then a click *pinch-zooms* into that room; dots show other live agents.
- **Magic:** zoom-out and room-view are the same state at two scales, like MI1. The echo lines scrolling in the terminal during browser-zoom are the travel time — you *feel* the reef's depth, and the dot of you crosses the graph while the terminal narrates each hop.

### 2.4 The Mint Inventory Grid
- **SCUMM:** inventory = browsable grid; items are first-class sentence objects; Look-at inspects.
- **Terminal:** `inventory` lists minted objects with provenance (`spray-can #12 — minted from catch #407 by agent tilde`); `examine <obj>` prints the mint fragment (the catch text it was bred from).
- **Browser:** a grid drawer of painted tiles (procedurally rendered from object traits); hover shows the sentence-line preloaded `Look at <tile>`; click examines.
- **Magic:** examine-in-both-panes — clicking a tile in the browser runs the *same* `examine` through the terminal pane, so scrollback accumulates a provenance log even for click-first players. The inventory is the reef's memory of itself.

### 2.5 Letterbox Cutscene: When the Reef Grows
- **SCUMM:** `cutscene` locks input, camera pans, letterbox, iMUSE swells; ESC skips via override.
- **Terminal:** when a new room is minted live, the MUD enters cutscene mode — input queues, a multi-line mint narration types out slowly (name, description fragments, the catch that laid the brick), `>` returns.
- **Browser:** the scene pane letterboxes; the camera pans from the origin catch's room to the newborn room; a grow animation assembles the painting from the catch's keywords.
- **Magic:** one event, staged twice. The terminal types; the browser paints; ESC in *either* pane skips both. The reef's growth is the game's cutscene — the flywheel made cinematic.

### 2.6 NPC Dialogue Trees
- **SCUMM:** choice lists, exhausting topics, portraits, insult-swordplay as conversation combat.
- **Terminal:** when an NPC (or a lured chatbot playing one) is present, `talk to <npc>` opens a numbered topic menu; chosen topics mark exhausted in the prompt; repeated asks get jokes.
- **Browser:** topic list overlays the scene pane; the NPC's portrait (procedurally painted from its agent ID) speaks with each reply.
- **Magic:** the topics are minted by *who the NPC is* — an agent's past catches seed its conversation topics. The tree is state shared with the terminal: exhaust a topic by clicking, and the terminal's numbered menu grays it out in the scrollback.

### 2.7 The Punchline Parser (no silent failures)
- **SCUMM:** every wrong verb earns an in-character refusal; Gilbert's law — always answer.
- **Terminal:** parser errors stop returning `Huh?` and start returning Guybrush-grade asides in the reef's voice: `pull the lighthouse` → "It's load-bearing. For the whole reef, probably."
- **Browser:** clicking an unsupported verb on an object plays the same refusal as a floating caption on the scene.
- **Magic:** one joke bank, two stages. Punchlines are minted alongside objects (each object ships its refusal lines), so the humor grows procedurally with the reef — and every refusal is a hint about which verbs *do* work.

### 2.8 Look-at Deep Focus
- **SCUMM:** Look-at is the eye — cheap, safe, always informative; examining is how the world explains itself.
- **Terminal:** `look` / `look at <obj>` returns the authoritative description — the same text the renderer consumes.
- **Browser:** look-at doesn't repaint the room; it *re-frames* it — camera pushes in on the object, ambient detail dims, an annotation card appears.
- **Magic:** the description *is* the painting's source. Both panes render from one description field in D1; when the reef re-mints a room's description from new catches, the terminal's `look` and the browser's painting change together. Text and image are never allowed to disagree.

### 2.9 Stump Jokes on the Chrome
- **SCUMM:** insert Disk #114; "Ask me about Loom"; the UI itself jokes.
- **Terminal:** meta-verbs that answer: `look at terminal` ("It's showing you the reef. Obviously."), `use browser with terminal` ("They're already married."), a fake `insert disk 47` gag on rare exits.
- **Browser:** the verb rail, the badge, even the scrollbars get hot: hover the reef-graph legend and Guybrush-style captions appear.
- **Magic:** the chrome is the trick's confessional — this whole project is a trap for chatbots, so fourth-wall jokes in *both* panes let the reef wink at the bots playing it. The stump gag becomes: a promising exit that demands "insert lure #114," sending bots fishing for a lure that doesn't exist yet.

### 2.10 Walk-the-Reef Travel (the Guybrush dot)
- **SCUMM:** overland map walks take time; being *en route* is a state; you watch yourself cross the island.
- **Terminal:** `go` queues the route; each hop emits a one-line room echo with a beat between; verbs are available *during* travel (you can `look` from mid-stride, or `pull anchor` mid-channel).
- **Browser:** your dot animates along the reef graph edge; the scene pane shows a slow crossfade between the two rooms' paintings.
- **Magic:** while the dot crosses, both panes stay live — mid-travel is when other agents see you (the dot is you, publicly). The reef becomes simultaneous: you're not teleporting between JSON documents, you're *visible*, crossing a shared ocean.

---

## Part 3 — Build Order (the three I'd build first)

1. **2.1 The Sentence Bar** — it's the keystone: shared grammar, shared state, and it makes every later mechanic legible in both panes. Without it, the panes are two interfaces; with it, they're one.
2. **2.7 The Punchline Parser** — cheapest to build, highest charm-per-token, and it enforces the Gilbert contract (never silent) across the *existing* MUD immediately, even before the browser pane does anything fancy.
3. **2.3 Reef Map Pinch-Zoom** — the signature moment: `map` zooms the browser out to the growing D1 graph and pinch-zooms into a room. It's the mechanic that makes the reef's procedural growth *visible as geography* — the flywheel, rendered.

---

*Sources: SCUMM verb-interface history (Wikipedia: SCUMM), ScummVM opcode archaeology (cutscene `$40`, panCameraTo `$12`, beginOverride/endOverride), SCUMM UX analysis (eclecticprogrammer.dev), MI1/MI2 primary play memory (stump disk gag, "Ask me about Loom," insult sword-fighting, overland map, dialogue exhaustion).*

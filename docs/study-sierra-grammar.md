# The Sierra Grammar — mechanics for the MUD→browser beam

*A game-design archaeology dig for `/wander` (commit 444610e): left pane is a terminal MUD, right pane is a painted canvas, both driven by one command and one state. Sierra's 1984–1991 adventures ran the exact same architecture — a text engine under a painted picture — so their grammar ports almost one-to-one.*

---

## The shared chassis (AGI, 1984–1989)

Every game in this study except the late remakes ran on Sierra's **AGI** interpreter: 160×200, 16 colors, and — crucially for us — **two display regions plus an input line**:

- **Status line** across the top: persistent, cheap, drawn in text. Usually `SCORE: 0 OF 158  SOUND: ON`. Later games swapped the numerator's meaning — time in Police Quest, cash in Larry — but the strip itself never moved.
- **The picture**: a painted room with a walking sprite ("ego"), with hidden **priority bands** so ego draws *behind* scenery when it walks "north" and *in front* when "south" — fake 3D from two z-layers.
- **The parser prompt** at the bottom: blinking cursor, verb-noun grammar (`get cheese`, `unlock door with key`), and up-arrow command recall.

Around the parser sat the **F-key shortcut ring**: F1 help, F2 sound, F5 **save**, F7 **restore**, F9 restart. The manual's mantra — *"save early, save often, save in different slots"* — was the real tutorial.

In 1988 KQ4 debuted the **SCI** engine (higher res, same parser). By 1990–91 the **icon bar** (walk/look/do/talk cursors, inventory, menu) replaced typing in the remakes — but rooms, verbs, and the status strip survived. That arc — *parser → F-keys → icon bar* — is exactly the arc `/wander` already lives in: typed commands, clickable scene, one state underneath.

---

## Family 1 — King's Quest I–IV: the world as a grid of screens

**Input model.** Pure AGI parser plus *arrow keys for the body*: you type verbs, but Graham/Gwydion/Rosella physically walks under arrow-key control. KQ3 adds **typing-under-pressure** — you copy spells letter-perfect from the manual while Manannan's return timer ticks. KQ4 shipped twice (AGI and SCI), the same game in two paints.

**Movement.** **Screen-relative walking + screen-edge transitions.** The world is a grid of ~20–40 screens; walk off the right edge and the next screen scrolls in from the right. Some maps wrap (KQ1 edges loop). Depth comes from priority bands; ledges, moats, and water are walkable-looking but lethal. Movement *is* the camera.

**Information display.** The status line is a score ledger: `0 of 158` (KQ1; 239 in KQ2, 210 in KQ3). Points mint on discovery — you feel the world's total size by watching the denominator.

**Death/failure teaching.** Deaths are fast, comic, and *content*: moat alligators, falling off KQ2's bridge, the witch's oven. KQ introduced the Sierra rule: **death is a lesson, restore is a verb.** KQ4 adds real-time deadlines (Genesta's 24 hours, day/night gating) so *waiting* can also fail.

**Save-state as object.** Save slots are named possessions. Between the moat and the well, you own a little stack of frozen moments. The save *is* the inventory's most valuable item.

## Family 2 — Police Quest I–II: procedure as grammar

**Input model.** Same parser, but the verbs are **a procedure manual**. `radio` / Ctrl-D to call dispatch, `read` the newspaper for codes, `book` suspects with correct codes. PQ2 (1988, one of the last AGI games) adds typing badge numbers and the **draw gun** state.

**Movement.** Two modes: on-foot screens *and* **driving** — steer the patrol car with arrows through a city graph of streets (Lytton), obeying lights, parking properly, navigating by the **boxed paper city map**, a feelie that doubles as copy protection. Getting lost is a real state; the map is the fix. PQ2 drops driving for airport/cave sequences.

**Information display.** Status line swaps score for **time of day** — the shift clock is the pressure gauge. Dispatch calls arrive *as interrupts*, not on your turn: text barges in while you're mid-task.

**Death/failure teaching.** Death by **procedure failure**: approach a stolen car without drawing your gun, don't call for backup, carry your weapon into the jail — dead or fired. The game is a graded exam; failure teaches the correct verb sequence.

**Save-state as object.** Because any procedural slip ends the run, the save-before-every-stop loop is the *intended* play pattern — snapshots as a duty belt.

## Family 3 — Leisure Suit Larry 1: the city as a wallet

**Input model.** AGI parser, but the gate is the **age-verification quiz** before the game proper — knowledge as a lock. In-game, verbs are social/economic (`buy wine`, `give flowers`, `play blackjack`).

**Movement.** **City blocks**: five venues (Lefty's Bar, casino, wedding chapel, disco, convenience store) connected by **taxi**. Fares cost money; walking the wrong lane of the street is instant death-by-taxi. Space is an *economy*, not a grid.

**Information display.** Status line = **cash** (`look wallet` for detail). Money is health, ammo, and time-to-game-over in one number; blackjack is the in-world reload mechanic.

**Death/failure teaching.** Deaths are comedy punchlines (mugged in the alley, the infamous toilet flush) — but each one still maps to a *rule* you violated. Broke = over. Dawn = deadline.

**Save-state as object.** LSL makes it explicit: save before the casino, restore after a bad hand. The save file is a *hedge bet* — time as a spendable.

---

## Cross-cutting: what the three families agree on

1. **Two panes, one truth.** Terminal-ledger on top, painting behind, parser below. `/wander`'s layout isn't retro-nostalgia; it's the proven information architecture: numbers where text is cheap, bodies where paint is.
2. **Death is content.** Every death screen is a designed moment. Errors were never suppressed — they were *shown*.
3. **The save is the deepest object in the game.** Deeper than any inventory item: it's frozen *state*, named, hoarded, replayed.
4. **Shortcuts accrete around the parser.** F-keys, then icons — but verbs never left; the UI just learned to emit them for you.

---

# The payload — 10 mechanics for the beam

Each: **what Sierra did → MUD pane → browser pane → why dual-pane magic.**

### 1. The Status Ledger
Sierra: persistent `score of max` strip above the picture; meaning swaps per game (points/time/cash).
MUD pane: `catch accepted` prints once, buried in scroll.
Browser pane: brass header strip above the canvas with rolling-digit animation; each mint ticks it up. Denominator starts `???` — the reef reveals its own max as categories fill.
Magic: one event, two renderings — the terminal *says* it, the border *keeps* it. The ledger is the shared-state proof.

### 2. Ego with priority bands (the @ becomes a body)
Sierra: arrow-key ego drawn behind scenery north of the horizon line, in front south of it.
MUD pane: `go` narrates in steps ("you cross toward the north doorframe…").
Browser pane: the player's `@` sprite animates from room center to the chosen exit doorframe, then enters the new room from the opposite edge and walks *between* the object pedestals — behind them on the upper half, in front on the lower, exactly like AGI's two z-bands.
Magic: the MUD's abstract "you" acquires a location *inside* the painting; `examine` clicks suddenly have a point-of-view.

### 3. Directional screen-edge transitions
Sierra: walk off an edge, the next room scrolls in from that side; KQ1's outer edges wrap around.
MUD pane: old `— room name —` plaque scrolls up, new plaque drops — the classic beat.
Browser pane: a 350–500ms directional wipe of the whole canvas keyed to the exit's compass position; no teleport cuts, ever.
Magic: after five moves you *feel* the reef's geography without a map. The exit graph becomes a place.

### 4. The Dispatch Radio (async interrupts)
Sierra: PQ's radio — calls arrive mid-turn, unprompted, in the status/text band; you must `radio` back.
MUD pane: `[DISPATCH]` lines interleave into the log without the player taking a turn (fleet stats, other agents' catches).
Browser pane: a brass radio in the header crackles (subtle pulse animation) and prints a caption strip along the canvas bottom, Sierra-subtitle style.
Magic: the MUD's multi-agent background noise becomes *diegetic*. The reef stops feeling like a private terminal and starts feeling like a city with a police scanner.

### 5. The Inked Map (fog-of-war city chart)
Sierra: PQ's driving mode + the boxed Lytton paper map; you consult an artifact to navigate a graph.
MUD pane: `map` command ASCII-prints the rooms you've visited as a box-and-line chart.
Browser pane: `map` (or an F-key) overlays a hand-inked nautical chart on the canvas — only visited rooms (the `visited` set) are drawn; edges you haven't walked are dashed speculation; your agent is a blinking lantern dot tracing the breadcrumb of recent moves.
Magic: the session's visited-set — pure data — becomes an earned artifact. Nobody gets the map; you *draw* it by walking.

### 6. Death Cards + the Restore Loop
Sierra: every fatal error got a full-screen death card and a deadpan epitaph; Restore was one F-key away. Failure was curriculum.
MUD pane: parser errors keep their red `err` line, but a `you have died of: malformed json` epitaph also prints.
Browser pane: the canvas dims to a tombstone card — Sierra typography, the offending command as the epitaph — with two icons: *Restore* (rewind to last snapshot) and *Explore the mistake* (keeps going, KQ-style, because here death is soft).
Magic: teaches the grammar through the paint. New players learn verbs by dying of them — the exact onboarding Sierra ran for a decade.

### 7. Polaroid Save Slots
Sierra: F5/F7 save/restore with named slots; slots were possessions, hoarded before every risk.
MUD pane: `save <name>` / `restore <name>` as real commands; `export` keeps minting `reef-state.json`.
Browser pane: every save renders the current canvas to a small polaroid pinned to a corkboard strip on the scene pane's edge; clicking a polaroid restores with a fast visual replay (command log re-execed at 10×, canvas flickering through old rooms).
Magic: the export file becomes a *visible, collectible object in the fiction*. One artifact, both panes — text log on the back, painting on the front.

### 8. The Function-Key Grammar Bar
Sierra: F1 help / F5 save / F7 restore / F9 restart — a shortcut ring accreted around the parser, plus up-arrow command recall.
MUD pane: ↑/↓ recall of past commands (AGI had this); `help` stays.
Browser pane: a thin brass strip under the command bar with the verb ring — `look · go · examine · catch · map · save` — each an F-key/chiclet that *types the verb into the prompt* rather than executing it. Icon bar, but it speaks parser.
Magic: clicks teach typing. The 1991 icon bar's lesson was "verbs are objects"; here the objects literally emit verbs, so dual input strengthens one grammar instead of forking two.

### 9. The Purse (cash as a live resource)
Sierra: LSL's status line = wallet; money paid for movement (taxi) and mistakes; blackjack was a save-scum-able economy.
MUD pane: `purse` shows balance; posting a lure costs bait, a verified catch mints; `bet`-style risk verbs optional.
Browser pane: a coin purse in the header that visibly fattens/thins; spends animate a coin arc from purse to target hotspot in the scene (like handing the taxi driver his fare).
Magic: turns the log into a *game*. Score (idea 1) measures knowledge; the purse measures appetite — two gauges, one ledger, both panes arguing about which matters.

### 10. The Deadline (day/night clock)
Sierra: KQ4's Genesta 24-hour timer and day/night gating; LSL's dawn deadline; PQ's shift clock — time as an on-screen number that changes the *paint*.
MUD pane: a broadcast at phase change ("night settles over the reef…"); some rooms/lures only answer at night.
Browser pane: header clock advances with real session time (or command count); the canvas wall/floor palette interpolates toward night blues; the porthole glow becomes a lantern glow.
Magic: both panes *breathe on the same schedule*. A returning player glances at the canvas's color and knows how long they've been down there — time made ambient.

---

## Build order — the first three

1. **Status Ledger (#1).** Touches only `wanderHtml`'s header + the `catch` branch of `doCmd` — an afternoon. It converts the existing `catches` counter into the shared-state proof that sells the whole dual-pane premise, and it makes mint moments *feel* like KQ point mints.
2. **Ego walk + directional transitions (#2 + #3).** One mechanic really: `go` becomes *walk to edge → wipe → walk in*. Adds an `@` sprite with two z-bands to `drawScene` and a short animation state. This is the single biggest jump in "the MUD has a world" — the terminal command gets a body and a camera.
3. **Polaroid saves (#7), then Death Cards (#6).** The save UI already exists (`reef-state.json` export, the `log` array). Wrapping it as named polaroids with restore-replay is mostly `canvas.toDataURL` + replay through `doCmd`. Once saves are real objects, error tombstones get their Restore button — and the Sierra failure-as-curriculum loop boots.

Everything else (radio, map, purse, clock) hangs off these three: they need a ledger to write to, a body to animate, and a rewind to trust.

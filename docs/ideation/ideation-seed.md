# 8 Hybrid MUD-ScummVM Beam Mechanics
Each entry follows your requested structure: 2-sentence pitch, terminal manifestation, browser manifestation, cross-view magic trick.

---

## 1. Edge-Walk Command Sync
**Pitch**: When a player walks off any screen edge of the ScummVM scene pane, the terminal auto-fills and executes the matching directional MUD command (e.g., `east`), then prints the full, room-specific terminal description for the new space. Unlike static SCUMM screen transitions, the beam pulls the exact terminal text and scene prop data from a single shared JSON state, so the terminal’s room title always matches the visible background in the browser.
**Terminal Manifestation**: Clicking the dock’s right edge auto-fills `east`, flashes green, and prints: `[You are in the town square. A wooden well sits center-stage; a blacksmith hammers a horseshoe at his stall to the north.]`
**Browser Manifestation**: The dock scene slides smoothly off the left edge, while the town square fades in, with the well and blacksmith shop rendered as interactable hotspots.
**Cross-View Trick**: The directional command and room description are generated from the exact same JSON data that paints the browser’s scene, so the terminal’s text is never generic—every detail (like the blacksmith’s stall) is mirrored in both views.

---

## 2. SCUMM Verb Bar Autofill
**Pitch**: A floating, context-sensitive SCUMM-style verb bar (Look, Use, Talk To, Push) sits above the browser scene pane; clicking any scene hotspot auto-fills the matching standardized MUD command in the terminal’s input bar, ready for the player to execute or edit. This bridges the point-and-click accessibility of classic adventure games with the tactile authenticity of MUD typing, letting new players ease into syntax while veterans can skip the bar entirely.
**Terminal Manifestation**: Clicking the blacksmith’s hotspot auto-fills `talk to blacksmith`; pressing enter prints: `The blacksmith wipes his hands on his apron: "Need a horseshoe? I’ve got spares from the captain’s ship."`
**Browser Manifestation**: The blacksmith tilts his head, and a small speech bubble previews the first half of the terminal’s response before animating a hammer strike when the command is executed.
**Cross-View Trick**: The hotspot’s JSON tag directly maps to a fixed verb/noun MUD command pair, so the terminal’s input is always syntactically valid, and the scene’s animation matches the exact text printed in the terminal.

---

## 3. Sierra-Style Dual Status HUD
**Pitch**: A dual-status bar runs along the bottom of the screen: the left half is a Sierra-style display showing current score, player location, and health, pulled directly from terminal commands like `score` and `look`, while the right half is an auto-updating 3x3 inventory grid synced to the player’s JSON state. Dragging an item in the browser’s inventory grid updates the terminal’s inventory text instantly, and typing `inventory` in the terminal highlights the matching item sprites in the browser.
**Terminal Manifestation**: Typing `inventory` prints: `You are carrying: a brass compass, a half-eaten loaf of bread, a spare horseshoe nail`; the status bar’s inventory slot highlights the nail when this command runs.
**Browser Manifestation**: The inventory grid sits in the bottom-right; the compass, bread, and nail sprites appear in the first three slots, with the nail glowing briefly when the terminal’s inventory command is executed.
**Cross-View Trick**: The player’s entire state is a single source of truth for both views, so every update to the terminal’s text or browser’s inventory grid pulls data from the same JSON file—no disconnected state between the two panes.

---

## 4. Contextual Dialogue Choice Autofill
**Pitch**: Clicking a talkative NPC pulls up a scrollable list of terminal-ready dialogue options in the browser pane; selecting an option auto-fills the matching `say "text"` command in the terminal for instant execution, just like a SCUMM dialogue tree. This lets players skip typing long custom lines while still letting veteran players type their own `say` commands directly into the terminal for unscripted conversations.
**Terminal Manifestation**: Selecting the "Ask about the captain’s ship" option auto-fills `say "What’s the story with the captain’s ship?"`; pressing enter prints: `The blacksmith scowls: "She ran aground on the reef last moon—lost half her cargo."`
**Browser Manifestation**: A dialogue box pops up above the blacksmith, with each option labeled with a shortened, snappy line; the blacksmith’s posture tenses slightly as the final line of dialogue prints in the terminal.
**Cross-View Trick**: Dialogue options are stored as JSON key-value pairs where the key is the exact terminal command text, so selecting a browser option directly injects that text into the terminal—typing a custom `say` command also highlights the closest matching option in the browser’s dialogue list.

---

## 5. Letterboxed Cutscene Subtitle Sync
**Pitch**: When a scripted cutscene triggers (e.g., a storm rolling in over the town square), the screen activates classic SCUMM-style letterbox bars at the top and bottom, and the terminal’s output is redirected to scroll inside the bottom letterbox bar instead of the full left pane. The browser’s animated cutscene (e.g., rain lashing the square, a seagull stealing your bread) is synced frame-perfect to the terminal’s printed text, so every line of dialogue or narration appears exactly as the on-screen action unfolds.
**Terminal Manifestation**: The left terminal pane shrinks to fit the bottom letterbox, and prints line-by-line: `[Cutscene: Rain lashes the town square; your loaf of bread is swept away by a gust of wind.]`
**Browser Manifestation**: The main scene darkens to letterbox bars, with rain animations pouring down over the town square; the bread loaf sprite drifts off-screen as the final line of cutscene text prints.
**Cross-View Trick**: The cutscene’s timeline is controlled by a single JSON script that drives both the browser’s animation frames and the terminal’s timed text output, so there’s no lag or desync between the two views.

---

## 6. Dynamic Environmental Macro Bar (New Hybrid)
**Pitch**: A context-sensitive bar of 3-4 custom MUD commands appears on the right edge of
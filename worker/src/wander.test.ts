// Unit tests — wanderHtml chrome surface: the shell ships the verb rail,
// the status HUD, the letterbox cutscene, and the sliding scene wrapper.
// (wanderHtml returns one HTML string; we assert the key ids/classes the
// mechanics hang off, so a rename breaks a test, not a player's session.)

import { describe, it, expect } from "vitest";
import { wanderHtml } from "./wander";

const VERB_IDS = [
  "v-look",
  "v-use",
  "v-talk",
  "v-walk",
  "v-push",
  "v-pull",
  "v-open",
  "v-close",
  "v-give",
];

describe("wanderHtml", () => {
  const html = wanderHtml();

  it("keeps the dual-pane shell", () => {
    expect(html).toContain('<div id="mud"></div>');
    expect(html).toContain('id="scene"');
    expect(html).toContain("<!DOCTYPE html>");
  });

  it("renders the nine-verb sentence rail", () => {
    expect(html).toContain('id="verbbar"');
    for (const id of VERB_IDS) {
      expect(html).toContain(`id="${id}"`);
    }
    // the rail's verbs emit parser words (Look → examine, Walk → go)
    expect(html).toContain('data-v="examine"');
    expect(html).toContain('data-v="go"');
  });

  it("renders the Sierra status HUD strip", () => {
    expect(html).toContain('id="hud"');
    expect(html).toContain('id="hud-room"');
    expect(html).toContain('id="hud-score"');
    expect(html).toContain('id="hud-bricks"');
    expect(html).toContain('id="hud-health"');
    expect(html).toContain("@keyframes hudtick");
  });

  it("renders the mint cutscene letterbox over the scene", () => {
    expect(html).toContain('id="letterbox" class="letterbox"');
    expect(html).toContain('class="lb-bar lb-top"');
    expect(html).toContain('class="lb-bar lb-bot"');
    expect(html).toContain("#letterbox.on .lb-bar");
  });

  it("renders the slide wrapper the scene transitions on", () => {
    expect(html).toContain('id="scene-slide"');
    expect(html).toMatch(/#scene-slide\{[^}]*transition:transform/);
  });

  it("bans the silent parser — no unknown-command fallback", () => {
    expect(html).not.toContain("unknown command");
    expect(html).toContain("QUIPS");
    expect(html).toContain("HINTS");
  });

  it("ships the terrain 3D pane toggle (one game, two views)", () => {
    // the toggle lives in the scene pane; the painted 2D view is the default
    expect(html).toContain('id="view-2d"');
    expect(html).toContain('id="view-3d"');
    expect(html).toMatch(/<button class="viewbtn active" id="view-2d"/);
    expect(html).toContain('id="scene-3d"');
    // the 3D pane loads /scene/:room (the terrain contract) and renders it
    expect(html).toContain("/scene/");
    expect(html).toContain("three.min.js");
    expect(html).toContain("renderRoom");
    // degrade gracefully: CDN or endpoint failure falls back to the 2D view
    expect(html).toContain("staying in the painted view");
    expect(html).toContain("back to the painted view");
  });
});

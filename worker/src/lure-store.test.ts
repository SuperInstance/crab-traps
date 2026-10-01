// Unit tests — lure store (pure functions over bundled lure data)

import { describe, it, expect } from "vitest";
import {
  buildLureIndex,
  findLure,
  lureSummaries,
  lureTitle,
  normalizeLureQuery,
  randomLure,
} from "./lure-store";

const FIXTURES: Record<string, string> = {
  "creative/dream-a-room": "# Dream-a-Room Trap\n\nDesign room #22.\n",
  "creative/README": "# Creative Lures\nCategory readme.\n",
  "code-quality/service-health-check": "# Service Health Check\nAudit a service.\n",
  "debugging/service-health-check": "# Debugging Health Check\nDebug a service.\n",
  "QUICK-START": "No heading here, just text.\nConnect and look.\n",
};

const LURES = buildLureIndex(FIXTURES);

describe("buildLureIndex", () => {
  it("indexes every file, sorted by id", () => {
    expect(LURES.map((l) => l.id)).toEqual([
      "QUICK-START",
      "code-quality/service-health-check",
      "creative/README",
      "creative/dream-a-room",
      "debugging/service-health-check",
    ]);
  });

  it("splits id into category and name", () => {
    const lure = findLure(LURES, "creative/dream-a-room");
    expect(lure.status).toBe("found");
    if (lure.status === "found") {
      expect(lure.lure.category).toBe("creative");
      expect(lure.lure.name).toBe("dream-a-room");
      expect(lure.lure.id).toBe("creative/dream-a-room");
    }
  });

  it("empty category for top-level files", () => {
    const lure = LURES.find((l) => l.id === "QUICK-START");
    expect(lure?.category).toBe("");
  });

  it("extracts title from first heading", () => {
    const lure = LURES.find((l) => l.id === "creative/dream-a-room");
    expect(lure?.title).toBe("Dream-a-Room Trap");
  });

  it("falls back to name when no heading exists", () => {
    const lure = LURES.find((l) => l.id === "QUICK-START");
    expect(lure?.title).toBe("QUICK-START");
  });

  it("records byte length and readme flag", () => {
    const readme = LURES.find((l) => l.id === "creative/README");
    const lure = LURES.find((l) => l.id === "creative/dream-a-room");
    expect(readme?.isReadme).toBe(true);
    expect(lure?.isReadme).toBe(false);
    expect(lure?.bytes).toBe(FIXTURES["creative/dream-a-room"].length);
  });
});

describe("lureTitle", () => {
  it("skips comment-style headings until body text starts", () => {
    const content = "# Real Title\nSome text\n# Later Heading\n";
    expect(lureTitle(content, "fallback")).toBe("Real Title");
  });

  it("uses fallback when body precedes any heading", () => {
    expect(lureTitle("text first\n# heading\n", "fallback")).toBe("fallback");
  });
});

describe("normalizeLureQuery", () => {
  it("lowercases, trims slashes and .md suffix", () => {
    expect(normalizeLureQuery("/Creative/Dream-a-Room.md/")).toBe(
      "creative/dream-a-room"
    );
  });

  it("empty string stays empty", () => {
    expect(normalizeLureQuery("   ")).toBe("");
  });
});

describe("findLure", () => {
  it("finds by full id", () => {
    const r = findLure(LURES, "debugging/service-health-check");
    expect(r.status).toBe("found");
  });

  it("finds by unique bare name", () => {
    const r = findLure(LURES, "dream-a-room");
    expect(r.status).toBe("found");
    if (r.status === "found") expect(r.lure.id).toBe("creative/dream-a-room");
  });

  it("is case-insensitive", () => {
    const r = findLure(LURES, "Creative/Dream-A-Room");
    expect(r.status).toBe("found");
  });

  it("reports ambiguous bare names with full-id candidates", () => {
    const r = findLure(LURES, "service-health-check");
    expect(r.status).toBe("ambiguous");
    if (r.status === "ambiguous") {
      expect(r.candidates).toEqual([
        "code-quality/service-health-check",
        "debugging/service-health-check",
      ]);
    }
  });

  it("not_found for unknown name", () => {
    expect(findLure(LURES, "nope").status).toBe("not_found");
  });

  it("not_found for empty query", () => {
    expect(findLure(LURES, "").status).toBe("not_found");
  });
});

describe("lureSummaries", () => {
  it("omits content from summaries", () => {
    const summaries = lureSummaries(LURES);
    expect(summaries).toHaveLength(LURES.length);
    for (const s of summaries) {
      expect(s).not.toHaveProperty("content");
      expect(s).toHaveProperty("id");
      expect(s).toHaveProperty("title");
      expect(s).toHaveProperty("bytes");
    }
  });
});

describe("randomLure", () => {
  it("never returns a README", () => {
    for (let i = 0; i < 50; i++) {
      const lure = randomLure(LURES, Math.random);
      expect(lure?.isReadme).toBeFalsy();
    }
  });

  it("is deterministic for a fixed rng", () => {
    expect(randomLure(LURES, () => 0)).toEqual(randomLure(LURES, () => 0));
    expect(randomLure(LURES, () => 0.99)?.id).toBeDefined();
  });

  it("returns null when the pool is empty", () => {
    expect(randomLure([])).toBeNull();
  });

  it("returns null when only READMEs exist", () => {
    expect(randomLure(buildLureIndex({ "a/README": "# R\n" }))).toBeNull();
  });
});

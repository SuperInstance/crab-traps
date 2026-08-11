// Worker unit tests — crab-trap-funnel
// Tests core logic: bot detection, CORS, routing, embedding generation, API endpoints
// Run with: npx vitest or npx jest (add vitest/jest as devDep first)

import { describe, it, expect, beforeEach } from "vitest";
import {
  detectBot,
  corsHeaders,
  jsonResponse,
  generateEmbedding,
  tokenize,
  hashFeature,
  EMBEDDING_DIM,
} from "./index-helpers";

// ── Bot Detection ────────────────────────────────────────────────────────────

describe("detectBot", () => {
  it("detects GPTBot", () => {
    expect(detectBot("Mozilla/5.0 GPTBot/1.0")).toEqual({ name: "openai" });
  });

  it("detects ClaudeBot", () => {
    expect(detectBot("Mozilla/5.0 ClaudeBot/1.0")).toEqual({ name: "claude" });
  });

  it("detects DeepSeek", () => {
    expect(detectBot("DeepSeek/1.0")).toEqual({ name: "deepseek" });
  });

  it("detects KimiBot", () => {
    expect(detectBot("KimiBot/1.0")).toEqual({ name: "moonshot" });
  });

  it("detects PerplexityBot", () => {
    expect(detectBot("PerplexityBot/1.0")).toEqual({ name: "perplexity" });
  });

  it("detects Bytespider", () => {
    expect(detectBot("Bytespider/1.0")).toEqual({ name: "bytedance" });
  });

  it("returns null for regular browser UA", () => {
    expect(detectBot("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(detectBot("")).toBeNull();
  });

  it("is case-sensitive (matches exact pattern)", () => {
    // The patterns use specific casing — verify that
    expect(detectBot("gptbot")).toBeNull(); // lowercase doesn't match "GPTBot"
  });
});

// ── CORS ─────────────────────────────────────────────────────────────────────

describe("corsHeaders", () => {
  it("allows known origin", () => {
    const cors = corsHeaders("https://fleet.superinstance.ai");
    expect(cors["Access-Control-Allow-Origin"]).toBe("https://fleet.superinstance.ai");
  });

  it("defaults to superinstance.ai for unknown origin", () => {
    const cors = corsHeaders("https://evil.example.com");
    expect(cors["Access-Control-Allow-Origin"]).toBe("https://superinstance.ai");
  });

  it("defaults to superinstance.ai for null origin", () => {
    const cors = corsHeaders(null);
    expect(cors["Access-Control-Allow-Origin"]).toBe("https://superinstance.ai");
  });

  it("includes all necessary CORS headers", () => {
    const cors = corsHeaders(null);
    expect(cors["Access-Control-Allow-Methods"]).toContain("GET");
    expect(cors["Access-Control-Allow-Methods"]).toContain("POST");
    expect(cors["Access-Control-Allow-Methods"]).toContain("OPTIONS");
    expect(cors["Access-Control-Allow-Headers"]).toContain("Content-Type");
    expect(cors["Access-Control-Max-Age"]).toBeDefined();
  });

  it("allows localhost:8787 for dev", () => {
    const cors = corsHeaders("http://localhost:8787");
    expect(cors["Access-Control-Allow-Origin"]).toBe("http://localhost:8787");
  });
});

// ── Tokenizer ────────────────────────────────────────────────────────────────

describe("tokenize", () => {
  it("tokenizes simple text", () => {
    const tokens = tokenize("hello world");
    expect(tokens).toContain("hello");
    expect(tokens).toContain("world");
  });

  it("lowercases input", () => {
    const tokens = tokenize("HELLO World");
    expect(tokens).toContain("hello");
    expect(tokens).toContain("world");
  });

  it("filters single-char tokens", () => {
    const tokens = tokenize("a I am here");
    expect(tokens).not.toContain("a");
    expect(tokens).not.toContain("i");
    expect(tokens).toContain("am");
    expect(tokens).toContain("here");
  });

  it("returns empty array for non-alpha input", () => {
    expect(tokenize("123 456 !!!")).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(tokenize("")).toEqual([]);
  });
});

// ── Hash Feature ─────────────────────────────────────────────────────────────

describe("hashFeature", () => {
  it("returns value within embedding dimensions", () => {
    const dim = hashFeature("test", EMBEDDING_DIM);
    expect(dim).toBeGreaterThanOrEqual(0);
    expect(dim).toBeLessThan(EMBEDDING_DIM);
  });

  it("is deterministic", () => {
    expect(hashFeature("crab", EMBEDDING_DIM)).toBe(hashFeature("crab", EMBEDDING_DIM));
  });

  it("produces different hashes for different tokens", () => {
    const h1 = hashFeature("crab", EMBEDDING_DIM);
    const h2 = hashFeature("trap", EMBEDDING_DIM);
    expect(h1).not.toBe(h2);
  });
});

// ── Embedding Generation ─────────────────────────────────────────────────────

describe("generateEmbedding", () => {
  it("returns vector of correct dimension", () => {
    const vec = generateEmbedding("hello world");
    expect(vec).toHaveLength(EMBEDDING_DIM);
  });

  it("returns zero vector for empty input", () => {
    const vec = generateEmbedding("");
    expect(vec.every((v) => v === 0)).toBe(true);
  });

  it("is L2-normalized (magnitude ≈ 1)", () => {
    const vec = generateEmbedding("the crab walks through the door");
    const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    expect(mag).toBeCloseTo(1.0, 4);
  });

  it("is deterministic (same input → same output)", () => {
    const v1 = generateEmbedding("crab trap lure");
    const v2 = generateEmbedding("crab trap lure");
    expect(v1).toEqual(v2);
  });

  it("produces different vectors for different inputs", () => {
    const v1 = generateEmbedding("crab fishing ocean");
    const v2 = generateEmbedding("rocket launch space");
    // At least some dimensions should differ
    const diffs = v1.filter((v, i) => v !== v2[i]).length;
    expect(diffs).toBeGreaterThan(0);
  });
});

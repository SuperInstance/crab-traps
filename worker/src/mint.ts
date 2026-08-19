// Minting hot path — the moment a catch becomes a brick (REEF-DESIGN §4A).
// On the Nth catch in a room the world grows, in-request, bounded work:
//   N=5  → a new object, named from the catch payloads' most frequent
//          capitalized non-stopword noun (tiny in-worker extraction)
//   N=12 → a neighboring room off the parent, description from the best
//          catch fragment, edge included, provenance-linked
// Idempotent: created_from_catch is unique in D1 and inserts are OR IGNORE.

import { tokenize } from "./index-helpers";

export const OBJECT_MINT_N = 5;
export const ROOM_MINT_N = 12;
export const RECENT_CATCH_LIMIT = 50;
const FRAGMENT_MAX = 500;

const STOPWORDS = new Set([
  "about", "above", "after", "again", "all", "also", "although", "always", "am",
  "an", "and", "any", "are", "arent", "as", "at", "be", "because", "been",
  "before", "being", "below", "between", "both", "but", "by", "can", "cant",
  "could", "couldnt", "did", "didnt", "do", "does", "doesnt", "doing", "dont",
  "down", "during", "each", "else", "even", "ever", "few", "for", "from",
  "further", "get", "gets", "go", "goes", "going", "got", "had", "hadnt",
  "has", "hasnt", "have", "havent", "having", "he", "her", "here", "hers",
  "herself", "him", "himself", "his", "how", "i", "id", "if", "ill", "im",
  "in", "into", "is", "isnt", "it", "its", "itself", "ive", "just", "least",
  "lets", "like", "made", "make", "may", "me", "might", "more", "most", "must",
  "my", "myself", "near", "need", "no", "nor", "not", "now", "of", "off",
  "often", "on", "once", "one", "only", "or", "other", "ought", "our", "ours",
  "ourselves", "out", "over", "own", "same", "saw", "see", "seen", "seem",
  "seems", "she", "should", "shouldnt", "since", "so", "some", "such", "take",
  "than", "that", "thats", "the", "their", "theirs", "them", "themselves",
  "then", "there", "theres", "these", "they", "theyre", "this", "those",
  "though", "through", "till", "to", "too", "under", "until", "up", "upon",
  "very", "was", "wasnt", "way", "we", "well", "were", "werent", "what",
  "whats", "when", "where", "wheres", "which", "while", "who", "whom", "why",
  "will", "with", "wont", "would", "wouldnt", "you", "youd", "youll", "your",
  "yours", "yourself", "yourselves", "youre", "youve",
]);

export interface WordCount {
  word: string;
  count: number;
}

function rankCounts(counts: Map<string, number>): WordCount[] {
  // Count desc, ties in first-appearance order (stable sort) — so "Radar
  // Gully" stays "Radar Gully" and not "Gully Radar".
  return [...counts.entries()]
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Most frequent capitalized non-stopword words across the texts — a tiny
 * proper-noun heuristic ("Radar", "Lighthouse") with no LLM in sight.
 */
export function extractNouns(texts: string[]): WordCount[] {
  const counts = new Map<string, number>();
  for (const text of texts) {
    if (!text) continue;
    for (const m of text.match(/\b[A-Z][a-z]{2,}\b/g) || []) {
      const word = m.toLowerCase();
      if (STOPWORDS.has(word)) continue;
      counts.set(word, (counts.get(word) || 0) + 1);
    }
  }
  return rankCounts(counts);
}

/** Most frequent non-stopword tokens overall (the existing tokenizer). */
export function keywordCounts(texts: string[]): WordCount[] {
  const counts = new Map<string, number>();
  for (const text of texts) {
    for (const t of tokenize(text || "")) {
      if (STOPWORDS.has(t)) continue;
      counts.set(t, (counts.get(t) || 0) + 1);
    }
  }
  return rankCounts(counts);
}

export function titleCase(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** Object name: top capitalized noun, else top keyword, else a curio. */
export function objectName(texts: string[]): string {
  const nouns = extractNouns(texts);
  if (nouns.length > 0) return titleCase(nouns[0].word);
  const keywords = keywordCounts(texts);
  if (keywords.length > 0) return titleCase(keywords[0].word);
  return "Curio";
}

/** Room name from catch keywords: the top two, title-cased. */
export function roomName(texts: string[]): string {
  const keywords = keywordCounts(texts);
  if (keywords.length === 0) return "Uncharted Reef";
  return keywords.slice(0, 2).map((k) => titleCase(k.word)).join(" ");
}

/** Best-accepted catch fragment: the longest substantive answer, bounded. */
export function bestFragment(texts: (string | null | undefined)[]): string | null {
  let best: string | null = null;
  for (const t of texts) {
    if (typeof t !== "string") continue;
    const trimmed = t.trim();
    if (trimmed && (best === null || trimmed.length > best.length)) best = trimmed;
  }
  return best ? best.slice(0, FRAGMENT_MAX) : null;
}

// --- The trigger ---

export interface MintInput {
  catchId: number;
  room: number;
}

export type MintDetail =
  | {
      kind: "object";
      room_id: number;
      name: string;
      lore: string | null;
      created_from_catch: number;
    }
  | {
      kind: "room";
      id: number;
      name: string;
      description: string | null;
      parent_room: number;
      created_from_catch: number;
    };

/**
 * Runs after a catch is recorded. Reads only that room's recent catches —
 * O(recent), never O(world). Returns what the reef grew, or null.
 */
export async function mintWorld(db: D1Database, input: MintInput): Promise<MintDetail | null> {
  // The catch's ORDINAL among its room's catches, computed from ids — a
  // plain COUNT(*) races: two concurrent catches in a 4-catch room can both
  // commit before either counts, the count jumps 4→6, and the 5th-catch
  // mint is skipped forever. Ordinals are stable per catch (ids only move
  // up), so exactly one catch is ever the 5th and one the 12th.
  const countRow = await db
    .prepare("SELECT COUNT(*) AS n FROM catches WHERE room = ? AND id <= ?")
    .bind(input.room, input.catchId)
    .first<{ n: number }>();
  const n = countRow?.n ?? 0;
  if (n !== OBJECT_MINT_N && n !== ROOM_MINT_N) return null;

  const { results } = await db
    .prepare(
      `SELECT id, answer, job, payload FROM catches WHERE room = ? ORDER BY id DESC LIMIT ${RECENT_CATCH_LIMIT}`
    )
    .bind(input.room)
    .all<{ id: number; answer: string | null; job: string | null; payload: string | null }>();
  const recent = results ?? [];
  const texts = recent.flatMap((r) => [r.answer, r.job]).filter((t): t is string => !!t && t.length > 0);

  if (n === OBJECT_MINT_N) {
    const name = objectName(texts);
    const lore = bestFragment(recent.map((r) => r.answer));
    await db
      .prepare("INSERT OR IGNORE INTO objects (room_id, name, kind, lore, created_from_catch) VALUES (?, ?, ?, ?, ?)")
      .bind(input.room, name, "minted", lore, input.catchId)
      .run();
    return { kind: "object", room_id: input.room, name, lore, created_from_catch: input.catchId };
  }

  // n === ROOM_MINT_N — spawn a neighboring room off the parent.
  const name = roomName(texts);
  const description = bestFragment(recent.map((r) => r.answer));
  await db
    .prepare("INSERT OR IGNORE INTO rooms (name, description, x, y, created_from_catch) VALUES (?, ?, NULL, NULL, ?)")
    .bind(name, description, input.catchId)
    .run();
  // Re-read by provenance: if a concurrent request minted first (OR IGNORE),
  // we still get the real id and the edge insert stays idempotent.
  const created = await db
    .prepare("SELECT id FROM rooms WHERE created_from_catch = ?")
    .bind(input.catchId)
    .first<{ id: number }>();
  if (!created) return null;
  await db
    .prepare("INSERT OR IGNORE INTO edges (from_room, to_room, traffic) VALUES (?, ?, 1)")
    .bind(input.room, created.id)
    .run();
  return {
    kind: "room",
    id: created.id,
    name,
    description,
    parent_room: input.room,
    created_from_catch: input.catchId,
  };
}

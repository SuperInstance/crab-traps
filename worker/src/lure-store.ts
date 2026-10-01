// Pure lure index — operates on lures bundled at build time (src/lures-data.js).
// No I/O, no state: everything here is deterministic and unit-testable.

export interface Lure {
  /** Full id: "category/name" (or just "name" for top-level files) */
  id: string;
  /** Directory part of the id, "" for top-level files */
  category: string;
  /** File name without extension */
  name: string;
  /** First "# " heading of the document, or the name as fallback */
  title: string;
  bytes: number;
  isReadme: boolean;
  content: string;
}

export interface LureSummary {
  id: string;
  category: string;
  name: string;
  title: string;
  bytes: number;
  is_readme: boolean;
}

/** Extract the title: the first "# " heading that appears before any body text. */
export function lureTitle(content: string, fallback: string): string {
  for (const line of content.split("\n")) {
    const m = line.match(/^#\s+(.+?)\s*$/);
    if (m) return m[1].trim();
    if (line.trim() !== "" && !line.startsWith("#")) break;
  }
  return fallback;
}

export function buildLureIndex(files: Record<string, string>): Lure[] {
  return Object.keys(files)
    .sort()
    .map((id) => {
      const parts = id.split("/");
      const name = parts[parts.length - 1];
      const content = files[id];
      return {
        id,
        category: parts.length > 1 ? parts.slice(0, -1).join("/") : "",
        name,
        title: lureTitle(content, name),
        bytes: content.length,
        isReadme: name === "README",
        content,
      };
    });
}

export function lureSummaries(lures: Lure[]): LureSummary[] {
  return lures.map((l) => ({
    id: l.id,
    category: l.category,
    name: l.name,
    title: l.title,
    bytes: l.bytes,
    is_readme: l.isReadme,
  }));
}

export function normalizeLureQuery(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^\/+|\/+$/g, "")
    .replace(/\.md$/i, "");
}

export type LureLookup =
  | { status: "found"; lure: Lure }
  | { status: "ambiguous"; name: string; candidates: string[] }
  | { status: "not_found"; query: string };

/**
 * Look up a lure by full id ("creative/dream-a-room") or bare name
 * ("dream-a-room"). Bare names that exist in several categories are
 * reported as ambiguous with the full-id candidates.
 */
export function findLure(lures: Lure[], rawQuery: string): LureLookup {
  const q = normalizeLureQuery(rawQuery);
  if (!q) return { status: "not_found", query: rawQuery };

  const byId = lures.find((l) => l.id.toLowerCase() === q);
  if (byId) return { status: "found", lure: byId };

  const byName = lures.filter((l) => l.name.toLowerCase() === q);
  if (byName.length === 1) return { status: "found", lure: byName[0] };
  if (byName.length > 1) {
    return {
      status: "ambiguous",
      name: q,
      candidates: byName.map((l) => l.id).sort(),
    };
  }
  return { status: "not_found", query: rawQuery };
}

/** Random non-README lure. `rng` is injectable for deterministic tests. */
export function randomLure(lures: Lure[], rng: () => number = Math.random): Lure | null {
  const pool = lures.filter((l) => !l.isReadme);
  if (pool.length === 0) return null;
  return pool[Math.floor(rng() * pool.length)];
}

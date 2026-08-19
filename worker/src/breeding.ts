// P4 — lure breeding (REEF-DESIGN §4B): the cold-path flywheel.
// Hourly cron: recompute fitness (catches / impressions), retire lineages
// that have been weak for three generations, breed the top-2 active lures by
// splicing their templates at a section boundary. Every step is tiny,
// deterministic, and individually boring — growth by a million small INSERTs.
//
// Idempotency: the pass claims its UTC hour bucket in reef_state with an
// upsert whose WHERE only fires when the value changed (meta.changes === 1).
// A double-fired cron finds the hour already claimed and becomes a no-op.

import { Env, jsonResponse } from "./index-helpers";

export const BREED_FITNESS_THRESHOLD = 0.2; // < 20% of impressions catch → weak
export const BREED_WEAK_GENERATIONS = 3;    // 3 consecutive weak generations → retired
export const BREED_TOP_N = 2;
export const GENEALOGY_MAX_NODES = 500;     // the genealogy endpoint stays bounded
export const LINEAGE_RECENT_CATCHES = 10;

export const LURE_COLUMNS =
  "id, name, template, parent_lure, parent_lure_b, fitness, impressions, generation, status, subject_room, subject_object, created_at";

export interface LureRow {
  id: number;
  name: string;
  template: string;
  parent_lure: number | null;
  parent_lure_b: number | null;
  fitness: number;
  impressions: number;
  generation: number;
  status: string;
  subject_room: number | null;
  subject_object: number | null;
  created_at?: string;
  /** Catches referencing this lure (joined in by the cron's SELECT). */
  catch_count?: number;
}

export interface BreedReport {
  bred: boolean;
  reason?: string;
  hour: string;
  fitness_updated: number;
  retired: { id: number; name: string; generation: number }[];
  parents?: { id: number; name: string; generation: number; fitness: number }[];
  child?: {
    id: number;
    name: string;
    generation: number;
    parent_lure: number;
    parent_lure_b: number;
  } | null;
}

// --- Pure breeding machinery (deterministic, unit-tested) ---

/** The UTC hour bucket that gates one breeding pass. */
export function breedHourBucket(date: Date = new Date()): string {
  return `${date.toISOString().slice(0, 13)}:00:00Z`;
}

/** Split a template at its "## Section" boundaries (sections keep headers). */
export function splitSections(template: string): string[] {
  const sections: string[] = [];
  let current: string[] = [];
  for (const line of template.split("\n")) {
    if (/^##\s+/.test(line) && current.length > 0) {
      sections.push(current.join("\n").trim());
      current = [];
    }
    current.push(line);
  }
  if (current.length > 0) sections.push(current.join("\n").trim());
  return sections.filter((s) => s.length > 0);
}

/**
 * Splice two templates at a section boundary: A's first half of sections,
 * then B's second half. Never splits mid-section; never random.
 */
export function spliceTemplates(a: string, b: string): string {
  const aSections = splitSections(a);
  const bSections = splitSections(b);
  if (aSections.length === 0) return bSections.join("\n\n");
  if (bSections.length === 0) return aSections.join("\n\n");
  const keepA = Math.max(1, Math.floor(aSections.length / 2)); // A keeps [0, keepA)
  const dropB = Math.floor(bSections.length / 2); // B contributes [dropB, end)
  return [...aSections.slice(0, keepA), ...bSections.slice(dropB)].join("\n\n");
}

/** The child's id: parent names slugged and joined with "-x-". */
export function childName(a: string, b: string): string {
  const slug = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  return `${slug(a)}-x-${slug(b)}`.slice(0, 128);
}

export function humanizeSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export interface ReefSubject {
  roomId: number | null;
  objectId: number | null;
  room: string;
  object: string | null;
}

/** The child template: a title, the spliced sections, and the reef around you. */
export function childTemplate(
  name: string,
  a: string,
  b: string,
  subject: ReefSubject | null
): string {
  const parts = [`# ${humanizeSlug(name)}`, spliceTemplates(a, b)];
  if (subject) {
    const lines = ["## The reef around you", subject.room];
    if (subject.object) lines.push(`Nearby: ${subject.object}`);
    parts.push(lines.join("\n\n"));
  }
  return parts.join("\n\n");
}

// --- The cron pass ---

const LURES_WITH_CATCHES_SQL = `
  SELECT l.id, l.name, l.template, l.parent_lure, l.parent_lure_b, l.fitness,
         l.impressions, l.generation, l.status, l.subject_room, l.subject_object,
         (SELECT COUNT(*) FROM catches c
           WHERE c.lure_id = l.name OR c.lure_id = CAST(l.id AS TEXT)) AS catch_count
  FROM lures l
  WHERE l.status = 'active'
  ORDER BY l.id
`;

const SUBJECT_ROOM_SQL = `
  SELECT * FROM (
    SELECT r.id, r.name, r.description,
           (SELECT COUNT(*) FROM catches c WHERE c.room = r.id) AS play
    FROM rooms r
  ) WHERE play > 0 ORDER BY play DESC, id ASC LIMIT 1
`;

/**
 * The hourly breeding pass. Deterministic and bounded: reads only active
 * lures (a handful), walks lineages at most 3 deep, writes per-lure fitness
 * and at most one child. `now` is injectable for deterministic tests.
 */
export async function handleBreedCron(env: Env, now: Date = new Date()): Promise<BreedReport> {
  const hour = breedHourBucket(now);
  const report: BreedReport = { bred: false, hour, fitness_updated: 0, retired: [] };

  // Idempotency: claim the hour atomically. The row IS the marker; whoever's
  // upsert reports changes === 1 did this hour's pass. A double-fired cron
  // (retry, overlap, same minute) finds the value already equal → changes 0.
  try {
    const claim = await env.DB.prepare(
      `INSERT INTO reef_state (key, value) VALUES ('last_breed', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
       WHERE reef_state.value != excluded.value`
    )
      .bind(hour)
      .run();
    if ((claim.meta.changes ?? 1) !== 1) {
      report.reason = "already bred this hour";
      return report;
    }
  } catch (err) {
    report.reason = `breeding failed: ${(err as { message?: string }).message ?? String(err)}`;
    return report;
  }

  try {
    const { results } = await env.DB.prepare(LURES_WITH_CATCHES_SQL).all<LureRow>();
    const rows = (results ?? []) as LureRow[];

    // 1. Fitness: catches / impressions, stored back on the lure.
    for (const row of rows) {
      const fitness = row.impressions > 0 ? (row.catch_count ?? 0) / row.impressions : 0;
      row.fitness = fitness;
      await env.DB.prepare("UPDATE lures SET fitness = ? WHERE id = ?").bind(fitness, row.id).run();
      report.fitness_updated += 1;
    }

    const byId = new Map(rows.map((r) => [r.id, r]));
    // A lure is weak only when it has been SHOWN and underperformed — a lure
    // nobody has seen yet (0 impressions) is not judged, just unproven.
    const weak = (r: LureRow) => r.impressions > 0 && r.fitness < BREED_FITNESS_THRESHOLD;

    // 2. Retirement: the lure AND its two ancestors (the primary parent
    // chain) all weak → three consecutive weak generations → retire it.
    // The reef forgets nothing: the row stays, marked retired.
    const chainWeak = (r: LureRow | undefined, depth: number): boolean => {
      if (depth >= BREED_WEAK_GENERATIONS) return true;
      if (!r || !weak(r)) return false;
      return chainWeak(byId.get(r.parent_lure ?? -1), depth + 1);
    };
    for (const row of rows) {
      if (weak(row) && chainWeak(row, 0)) {
        await env.DB
          .prepare(
            "UPDATE lures SET status = 'retired', retired_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'active'"
          )
          .bind(row.id)
          .run();
        row.status = "retired";
        report.retired.push({ id: row.id, name: row.name, generation: row.generation });
      }
    }

    // 3. Breeding: top-2 active lures by (fitness desc, id asc). The reef
    // breeds from what worked — no catches under the top lure, no child.
    const pool = rows
      .filter((r) => r.status === "active" && r.impressions > 0)
      .sort((x, y) => y.fitness - x.fitness || x.id - y.id);
    if (pool.length < BREED_TOP_N) {
      report.reason = "fewer than 2 breedable lures";
      return report;
    }
    if ((pool[0].catch_count ?? 0) === 0) {
      report.reason = "no catches under the top lure yet — the reef breeds from what worked";
      return report;
    }
    const [a, b] = pool;

    // The child renders with a real room + real object as its subject: the
    // most-played room and its first object.
    let subject: ReefSubject | null = null;
    const roomRow = await env.DB
      .prepare(SUBJECT_ROOM_SQL)
      .first<{ id: number; name: string; description: string | null; play: number }>();
    if (roomRow) {
      const objRow = await env.DB
        .prepare("SELECT id, name, lore FROM objects WHERE room_id = ? ORDER BY id LIMIT 1")
        .bind(roomRow.id)
        .first<{ id: number; name: string; lore: string | null }>();
      subject = {
        roomId: roomRow.id,
        objectId: objRow?.id ?? null,
        room: `${roomRow.name} — ${roomRow.description ?? "a room of the reef"}`,
        object: objRow ? `${objRow.name}${objRow.lore ? `: ${objRow.lore}` : ""}` : null,
      };
    }

    const name = childName(a.name, b.name);
    const template = childTemplate(name, a.template, b.template, subject);
    const generation = Math.max(a.generation, b.generation) + 1;
    const insert = await env.DB
      .prepare(
        `INSERT INTO lures (name, template, parent_lure, parent_lure_b, fitness, impressions, generation, status, subject_room, subject_object)
         VALUES (?, ?, ?, ?, 0, 0, ?, 'active', ?, ?)`
      )
      .bind(name, template, a.id, b.id, generation, subject?.roomId ?? null, subject?.objectId ?? null)
      .run();

    report.bred = true;
    report.parents = [a, b].map((p) => ({
      id: p.id,
      name: p.name,
      generation: p.generation,
      fitness: p.fitness,
    }));
    report.child = {
      id: insert.meta.last_row_id,
      name,
      generation,
      parent_lure: a.id,
      parent_lure_b: b.id,
    };
    return report;
  } catch (err) {
    report.reason = `breeding failed: ${(err as { message?: string }).message ?? String(err)}`;
    return report;
  }
}

// --- Genealogy: the breeding tree is public ---

function lureSummary(row: LureRow) {
  return {
    id: row.id,
    name: row.name,
    generation: row.generation,
    status: row.status,
    fitness: row.fitness,
    impressions: row.impressions,
    parent_lure: row.parent_lure,
    parent_lure_b: row.parent_lure_b,
    subject_room: row.subject_room,
    subject_object: row.subject_object,
    created_at: row.created_at,
  };
}

/** GET /lineage/lure/:id — one lure's full record: parents, children, catches. */
export async function handleLureLineage(
  env: Env,
  cors: Record<string, string>,
  rawId: string
): Promise<Response> {
  const id = parseInt(rawId, 10);
  if (!Number.isInteger(id) || id < 1 || String(id) !== rawId.trim()) {
    return jsonResponse({ success: false, error: "lure not found", lure_id: rawId }, 404, cors);
  }
  try {
    const lure = await env.DB
      .prepare(`SELECT ${LURE_COLUMNS} FROM lures WHERE id = ?`)
      .bind(id)
      .first<LureRow>();
    if (!lure) {
      return jsonResponse(
        {
          success: false,
          error: "lure not found",
          lure_id: id,
          hint: "GET /genealogy shows the whole breeding tree",
        },
        404,
        cors
      );
    }

    const parentIds = [lure.parent_lure, lure.parent_lure_b].filter((p): p is number => p !== null);
    let parents: LureRow[] = [];
    if (parentIds.length > 0) {
      const placeholders = parentIds.map(() => "?").join(", ");
      const pRes = await env.DB
        .prepare(`SELECT ${LURE_COLUMNS} FROM lures WHERE id IN (${placeholders})`)
        .bind(...parentIds)
        .all<LureRow>();
      parents = pRes.results ?? [];
    }
    const children = await env.DB
      .prepare(`SELECT ${LURE_COLUMNS} FROM lures WHERE parent_lure = ? OR parent_lure_b = ? ORDER BY id`)
      .bind(id, id)
      .all<LureRow>();
    const catchCount = await env.DB
      .prepare("SELECT COUNT(*) AS n FROM catches WHERE lure_id = ? OR lure_id = CAST(? AS TEXT)")
      .bind(lure.name, lure.id)
      .first<{ n: number }>();
    const recent = await env.DB
      .prepare(
        "SELECT id, agent, answer, created_at FROM catches WHERE lure_id = ? OR lure_id = CAST(? AS TEXT) ORDER BY id DESC LIMIT ?"
      )
      .bind(lure.name, lure.id, LINEAGE_RECENT_CATCHES)
      .all<{ id: number; agent: string; answer: string | null; created_at: string }>();

    return jsonResponse(
      {
        success: true,
        lure: lureSummary(lure),
        template: lure.template,
        parents: parents.map(lureSummary),
        children: (children.results ?? []).map(lureSummary),
        catch_count: catchCount?.n ?? 0,
        recent_catches: recent.results ?? [],
      },
      200,
      cors
    );
  } catch (err: any) {
    return jsonResponse(
      {
        success: false,
        error: "world storage unavailable",
        detail: err?.message || String(err),
      },
      503,
      cors
    );
  }
}

interface GenealogyNode {
  id: number;
  name: string;
  generation: number;
  status: string;
  fitness: number;
  impressions: number;
  parent_lure: number | null;
  parent_lure_b: number | null;
  children: GenealogyNode[];
}

/** Serialize a subtree as plain JSON, cycle-safe (per-path visited set). */
function serializeTree(root: GenealogyNode, path: Set<number>): unknown {
  if (path.has(root.id)) {
    return { id: root.id, cycle: true };
  }
  const next = new Set(path);
  next.add(root.id);
  return {
    id: root.id,
    name: root.name,
    generation: root.generation,
    status: root.status,
    fitness: root.fitness,
    impressions: root.impressions,
    parent_lure: root.parent_lure,
    parent_lure_b: root.parent_lure_b,
    children: root.children.map((c) => serializeTree(c, next)),
  };
}

/** GET /genealogy — the whole breeding tree, roots first, bounded. */
export async function handleGenealogy(env: Env, cors: Record<string, string>): Promise<Response> {
  try {
    const { results } = await env.DB
      .prepare(`SELECT ${LURE_COLUMNS} FROM lures ORDER BY id LIMIT ?`)
      .bind(GENEALOGY_MAX_NODES)
      .all<LureRow>();
    const rows = (results ?? []) as LureRow[];

    const nodes = new Map<number, GenealogyNode>(
      rows.map((r) => [
        r.id,
        {
          id: r.id,
          name: r.name,
          generation: r.generation,
          status: r.status,
          fitness: r.fitness,
          impressions: r.impressions,
          parent_lure: r.parent_lure,
          parent_lure_b: r.parent_lure_b,
          children: [],
        },
      ])
    );
    const roots: GenealogyNode[] = [];
    for (const r of rows) {
      const n = nodes.get(r.id)!;
      const parentA = r.parent_lure != null ? nodes.get(r.parent_lure) : undefined;
      const parentB = r.parent_lure_b != null ? nodes.get(r.parent_lure_b) : undefined;
      if (!parentA && !parentB) {
        roots.push(n);
      } else {
        if (parentA && parentA !== n && !parentA.children.some((c) => c.id === n.id)) {
          parentA.children.push(n);
        }
        if (parentB && parentB !== parentA && parentB !== n && !parentB.children.some((c) => c.id === n.id)) {
          parentB.children.push(n);
        }
      }
    }
    // Deterministic ordering everywhere: children and roots by id.
    for (const n of nodes.values()) n.children.sort((x, y) => x.id - y.id);
    roots.sort((x, y) => x.id - y.id);

    const generations = rows.reduce((m, r) => Math.max(m, r.generation), 0);
    return jsonResponse(
      {
        success: true,
        roots: roots.map((r) => serializeTree(r, new Set())),
        node_count: rows.length,
        generations,
        retired_count: rows.filter((r) => r.status === "retired").length,
        truncated: rows.length === GENEALOGY_MAX_NODES,
        hint: "GET /lineage/lure/:id for one lure's full record",
      },
      200,
      cors
    );
  } catch (err: any) {
    return jsonResponse(
      {
        success: false,
        error: "world storage unavailable",
        detail: err?.message || String(err),
      },
      503,
      cors
    );
  }
}

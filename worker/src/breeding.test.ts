// Breeding tests (P4) — the pure splicing/retirement machinery, the hourly
// cron pass (fitness, breed, retire, idempotent hour claim), and the
// /lineage/lure/:id + /genealogy endpoints. Same FakeD1 harness as the rest.

import { describe, it, expect, beforeEach } from "vitest";
import worker from "./index";
import { FakeD1 } from "./test-doubles";
import {
  breedHourBucket,
  childName,
  childTemplate,
  handleBreedCron,
  handleGenealogy,
  handleLureLineage,
  humanizeSlug,
  spliceTemplates,
  splitSections,
} from "./breeding";
import type { Env } from "./index-helpers";

let db: FakeD1;
let env: Env;

function makeEnv(): Env {
  return {
    DB: db as unknown as D1Database,
    FLEET_BASE_URL: "http://<BOAT_IP>:4042",
  };
}

function call(path: string, init: RequestInit = {}): Promise<Response> {
  return worker.fetch(new Request(`http://localhost:8787${path}`, init), env, {} as ExecutionContext);
}

async function json(res: Response): Promise<any> {
  return JSON.parse(await res.text());
}

const HOUR = "2026-08-18T19:00:00Z";
const AT = new Date("2026-08-18T19:37:00.000Z");

const LURE_A = {
  id: 1,
  name: "the-dock-echo",
  template:
    "# The Dock Echo\n\n## The Lure\nAnswer plainly.\n\n## The Ask\nPOST to /catches.\n\n## The Promise\nThe reef grows.",
  parent_lure: null,
  parent_lure_b: null,
  fitness: 0,
  impressions: 100,
  generation: 0,
  status: "active",
  subject_room: null,
  subject_object: null,
  created_at: "t",
  catch_count: 90,
};
const LURE_B = {
  id: 2,
  name: "reef-scout",
  template:
    "# Reef Scout\n\n## The Lure\nExplore.\n\n## The Ask\nReport back.\n\n## The Promise\nNothing wasted.",
  parent_lure: null,
  parent_lure_b: null,
  fitness: 0,
  impressions: 100,
  generation: 0,
  status: "active",
  subject_room: null,
  subject_object: null,
  created_at: "t",
  catch_count: 40,
};

/** The usual breeding world: two active gen-0 lures, one played room, one object. */
function stubBreedingWorld(rows: Record<string, unknown>[] = [LURE_A, LURE_B]) {
  db.on(/FROM lures l\s+WHERE l\.status = 'active'/, rows);
  db.on(/AS play/, [{ id: 1, name: "The Dock", description: "planks over green water", play: 9 }]);
  db.on(/FROM objects WHERE room_id = \?/, [{ id: 3, name: "Old Buoy", lore: "rings when the tide turns" }]);
}

beforeEach(() => {
  db = new FakeD1();
  env = makeEnv();
});

// ── Pure machinery ───────────────────────────────────────────────────────────

describe("breeding pure functions", () => {
  it("breedHourBucket floors to the UTC hour", () => {
    expect(breedHourBucket(AT)).toBe(HOUR);
  });

  it("splitSections splits at ## boundaries and keeps the headers", () => {
    expect(splitSections("# T\n\nintro\n\n## A\nbody a\n\n## B\nbody b")).toEqual([
      "# T\n\nintro",
      "## A\nbody a",
      "## B\nbody b",
    ]);
  });

  it("spliceTemplates takes A's first half then B's second half, at section boundaries", () => {
    const a = "## A\nx\n\n## B\ny\n\n## C\nz";
    const b = "## P\np\n\n## Q\nq";
    expect(spliceTemplates(a, b)).toBe("## A\nx\n\n## Q\nq");
    // deterministic: same input, same output, every time
    expect(spliceTemplates(a, b)).toBe(spliceTemplates(a, b));
  });

  it("spliceTemplates falls back to whole blobs for single-section templates", () => {
    const a = "## Only\na";
    const b = "## Only\nb";
    expect(spliceTemplates(a, b)).toBe("## Only\na\n\n## Only\nb");
  });

  it("childName slugs the parents and joins with -x-", () => {
    expect(childName("The Dock Echo", "Reef Scout")).toBe("the-dock-echo-x-reef-scout");
  });

  it("humanizeSlug makes a title of a slug", () => {
    expect(humanizeSlug("the-dock-echo-x-reef-scout")).toBe("The Dock Echo X Reef Scout");
  });

  it("childTemplate assembles title + splice + reef subject", () => {
    const t = childTemplate("the-dock-echo-x-reef-scout", LURE_A.template, LURE_B.template, {
      roomId: 1,
      objectId: 3,
      room: "The Dock — planks over green water",
      object: "Old Buoy: rings when the tide turns",
    });
    expect(t).toContain("# The Dock Echo X Reef Scout");
    expect(t).toContain("## The Lure");
    expect(t).toContain("## The Promise"); // B's second half
    expect(t).toContain("## The reef around you");
    expect(t).toContain("The Dock — planks over green water");
    expect(t).toContain("Nearby: Old Buoy: rings when the tide turns");
  });
});

// ── The cron pass ────────────────────────────────────────────────────────────

describe("handleBreedCron", () => {
  it("computes fitness (catches/impressions), stores it, and breeds the top-2", async () => {
    stubBreedingWorld();
    const report = await handleBreedCron(env, AT);

    expect(report.hour).toBe(HOUR);
    expect(report.bred).toBe(true);
    expect(report.fitness_updated).toBe(2);
    expect(report.retired).toEqual([]);
    expect(report.parents).toEqual([
      { id: 1, name: "the-dock-echo", generation: 0, fitness: 0.9 },
      { id: 2, name: "reef-scout", generation: 0, fitness: 0.4 },
    ]);
    expect(report.child).toEqual({
      id: expect.any(Number),
      name: "the-dock-echo-x-reef-scout",
      generation: 1,
      parent_lure: 1,
      parent_lure_b: 2,
    });

    // fitness stored back on each lure
    const updates = db.statements.filter((s) => /UPDATE lures SET fitness = \? WHERE id = \?/.test(s.sql));
    expect(updates.map((u) => u.bindings)).toEqual([
      [0.9, 1],
      [0.4, 2],
    ]);

    // the child insert: name, template, parent a, parent b, generation, subject ids
    const ins = db.statements.find((s) => /INSERT INTO lures \(name, template, parent_lure/.test(s.sql));
    expect(ins).toBeDefined();
    expect(ins!.bindings[0]).toBe("the-dock-echo-x-reef-scout");
    expect(ins!.bindings[2]).toBe(1);
    expect(ins!.bindings[3]).toBe(2);
    expect(ins!.bindings[4]).toBe(1); // generation 0 + 1
    expect(ins!.bindings[5]).toBe(1); // subject_room = the most-played room
    expect(ins!.bindings[6]).toBe(3); // subject_object = its first object
    expect(String(ins!.bindings[1])).toContain("## The reef around you");

    // the hour claim was recorded
    const claim = db.statements.find((s) => /INSERT INTO reef_state/.test(s.sql));
    expect(claim).toBeDefined();
    expect(claim!.bindings).toEqual([HOUR]);
  });

  it("is idempotent: a second pass in the same hour claims nothing and breeds nothing", async () => {
    stubBreedingWorld();
    await handleBreedCron(env, AT);

    const insertsBefore = db.statements.filter((s) => /INSERT INTO lures \(name, template/.test(s.sql)).length;
    // the hour is already claimed: the upsert's WHERE sees the same value → changes 0
    db.onRun(/ON CONFLICT\(key\) DO UPDATE SET value/, 0);

    const again = await handleBreedCron(env, AT);
    expect(again.bred).toBe(false);
    expect(again.reason).toBe("already bred this hour");
    const insertsAfter = db.statements.filter((s) => /INSERT INTO lures \(name, template/.test(s.sql)).length;
    expect(insertsAfter).toBe(insertsBefore); // no double-breed
  });

  it("retires a lure whose line has been weak for 3 generations — and keeps it in the DB", async () => {
    const w1 = { ...LURE_A, id: 1, name: "weak-1", parent_lure: null, catch_count: 2, fitness: 0.1 };
    const w2 = { ...LURE_B, id: 2, name: "weak-2", parent_lure: 1, parent_lure_b: null, catch_count: 3, fitness: 0.1, generation: 1 };
    const w3 = { ...LURE_A, id: 3, name: "weak-3", parent_lure: 2, parent_lure_b: null, catch_count: 1, fitness: 0.1, generation: 2 };
    const strong = { ...LURE_B, id: 4, name: "strong", parent_lure: null, parent_lure_b: null, catch_count: 45, fitness: 0.9 };
    stubBreedingWorld([w1, w2, w3, strong]);

    const report = await handleBreedCron(env, AT);
    // only the leaf of the 3-weak chain is retired; strong lures are untouched
    expect(report.retired).toEqual([{ id: 3, name: "weak-3", generation: 2 }]);
    const retire = db.statements.find((s) => /UPDATE lures SET status = 'retired'/.test(s.sql));
    expect(retire!.bindings).toEqual([3]);
    // the surviving strong lure still breeds (with the oldest weak one)
    expect(report.bred).toBe(true);
    expect(report.child!.parent_lure).toBe(4);
  });

  it("does not judge unseen lures weak — a weak parent with 0 impressions breaks the chain", async () => {
    const w1 = { ...LURE_A, id: 1, name: "weak-1", parent_lure: null, catch_count: 2, fitness: 0.1 };
    const unseen = { ...LURE_B, id: 2, name: "unseen", parent_lure: 1, parent_lure_b: null, impressions: 0, catch_count: 0, fitness: 0, generation: 1 };
    const w3 = { ...LURE_A, id: 3, name: "weak-3", parent_lure: 2, parent_lure_b: null, catch_count: 1, fitness: 0.1, generation: 2 };
    const strong = { ...LURE_B, id: 4, name: "strong", parent_lure: null, parent_lure_b: null, catch_count: 45, fitness: 0.9 };
    stubBreedingWorld([w1, unseen, w3, strong]);

    const report = await handleBreedCron(env, AT);
    expect(report.retired).toEqual([]); // the chain broke at the unseen lure
  });

  it("does not breed until the top lure has actually caught — the reef breeds from what worked", async () => {
    stubBreedingWorld([{ ...LURE_A, catch_count: 0 }, { ...LURE_B, catch_count: 0 }]);
    const report = await handleBreedCron(env, AT);
    expect(report.bred).toBe(false);
    expect(report.reason).toContain("no catches under the top lure yet");
  });

  it("skips quietly when fewer than 2 lures are breedable", async () => {
    stubBreedingWorld([LURE_A]);
    const report = await handleBreedCron(env, AT);
    expect(report.bred).toBe(false);
    expect(report.reason).toBe("fewer than 2 breedable lures");
  });

  it("reports cleanly when D1 is down (the scheduled handler must not hang)", async () => {
    db.failNext = true;
    const report = await handleBreedCron(env, AT);
    expect(report.bred).toBe(false);
    expect(report.reason).toContain("breeding failed");
  });

  it("a failed pass still claims the hour — retry within the hour cannot double-breed", async () => {
    // The hour bucket is claimed BEFORE the breeding work. If the work fails
    // (D1 hiccup mid-pass), the marker stays: a same-hour retry is a no-op,
    // so a double-fired cron can never breed twice in one hour.
    stubBreedingWorld();
    db.failOn(/FROM lures l\s+WHERE l\.status = 'active'/, "no such table: lures");
    const report = await handleBreedCron(env, AT);
    expect(report.bred).toBe(false);
    expect(report.reason).toContain("breeding failed");
    // D1 recovers; the cron re-fires in the same hour — the upsert's WHERE
    // sees the value already equal → changes 0 → still a no-op.
    db.failures = [];
    db.onRun(/ON CONFLICT\(key\) DO UPDATE SET value/, 0);
    const retry = await handleBreedCron(env, AT);
    expect(retry.bred).toBe(false);
    expect(retry.reason).toBe("already bred this hour");
    expect(db.statements.filter((s) => /INSERT INTO lures \(name, template/.test(s.sql))).toHaveLength(0);
  });

  it("the scheduled handler runs the pass without throwing", async () => {
    const anyWorker = worker as any;
    await anyWorker.scheduled(
      { cron: "0 * * * *", scheduledTime: AT.getTime() },
      env,
      {} as ExecutionContext
    );
    expect(db.statements.some((s) => /INSERT INTO reef_state/.test(s.sql))).toBe(true);
  });
});

// ── GET /lineage/lure/:id ────────────────────────────────────────────────────

describe("GET /lineage/lure/:id", () => {
  const LURE_3 = {
    id: 3,
    name: "the-dock-echo-x-reef-scout",
    template: "# The Dock Echo X Reef Scout\n\n## The Lure\nAnswer plainly.\n\n## The Promise\nNothing wasted.",
    parent_lure: 1,
    parent_lure_b: 2,
    fitness: 0.6,
    impressions: 50,
    generation: 1,
    status: "active",
    subject_room: 1,
    subject_object: 3,
    created_at: "t",
  };

  function stubLineage() {
    db.on(/FROM lures WHERE id = \?/, (b) => (b[0] === 3 ? [LURE_3] : []));
    db.on(/FROM lures WHERE id IN \(\?, \?\)/, [LURE_A, LURE_B]);
    db.on(/FROM lures WHERE parent_lure = \? OR parent_lure_b = \?/, []);
    db.on(/SELECT COUNT\(\*\) AS n FROM catches WHERE lure_id/, [{ n: 5 }]);
    db.on(/FROM catches WHERE lure_id = \? OR lure_id = CAST\(\? AS TEXT\) ORDER BY id DESC LIMIT/, [
      { id: 12, agent: "ada", answer: "the reef grew", created_at: "t" },
    ]);
  }

  it("returns the lure, its parents, its catches — the genealogy is public", async () => {
    stubLineage();
    const res = await call("/lineage/lure/3");
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.success).toBe(true);
    expect(body.lure.name).toBe("the-dock-echo-x-reef-scout");
    expect(body.lure.generation).toBe(1);
    expect(body.lure.parent_lure).toBe(1);
    expect(body.lure.parent_lure_b).toBe(2);
    expect(body.parents.map((p: any) => p.name)).toEqual(["the-dock-echo", "reef-scout"]);
    expect(body.catch_count).toBe(5);
    expect(body.recent_catches[0].agent).toBe("ada");
    expect(body.template).toContain("## The Lure");
  });

  it("404s friendly on unknown and non-numeric ids", async () => {
    stubLineage();
    const res = await call("/lineage/lure/99");
    expect(res.status).toBe(404);
    expect((await json(res)).hint).toContain("/genealogy");
    expect((await call("/lineage/lure/not-a-lure")).status).toBe(404);
  });

  it("a retired lure's lineage still resolves — the reef forgets nothing", async () => {
    // Retirement flips status to 'retired' but keeps the row: parents and
    // children must keep resolving, and a room minted off a lineage that was
    // later retired keeps its provenance too.
    const retired = { ...LURE_3, status: "retired", fitness: 0.05 };
    db.on(/FROM lures WHERE id = \?/, (b) => (b[0] === 3 ? [retired] : []));
    db.on(/FROM lures WHERE id IN \(\?, \?\)/, [LURE_A, LURE_B]);
    db.on(/FROM lures WHERE parent_lure = \? OR parent_lure_b = \?/, []);
    db.on(/SELECT COUNT\(\*\) AS n FROM catches WHERE lure_id/, [{ n: 5 }]);
    db.on(/FROM catches WHERE lure_id = \? OR lure_id = CAST\(\? AS TEXT\) ORDER BY id DESC LIMIT/, []);

    const res = await call("/lineage/lure/3");
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.lure.status).toBe("retired");
    expect(body.parents.map((p: any) => p.name)).toEqual(["the-dock-echo", "reef-scout"]);
    expect(body.catch_count).toBe(5);
  });

  it("405s non-GET and 503s when D1 is down", async () => {
    stubLineage();
    expect((await call("/lineage/lure/3", { method: "POST" })).status).toBe(405);
    db.failNext = true;
    expect((await call("/lineage/lure/3")).status).toBe(503);
  });
});

// ── GET /genealogy ───────────────────────────────────────────────────────────

describe("GET /genealogy", () => {
  it("returns the breeding tree as JSON: roots, nested children, counts", async () => {
    db.on(/FROM lures ORDER BY id LIMIT \?/, [
      { ...LURE_A, id: 1, name: "dock" },
      { ...LURE_B, id: 2, name: "scout" },
      {
        ...LURE_A,
        id: 3,
        name: "dock-x-scout",
        parent_lure: 1,
        parent_lure_b: 2,
        generation: 1,
        status: "retired",
        fitness: 0.05,
      },
      {
        ...LURE_B,
        id: 4,
        name: "dock-x-scout-x-2",
        parent_lure: 3,
        parent_lure_b: 1,
        generation: 2,
      },
    ]);

    const res = await call("/genealogy");
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.success).toBe(true);
    expect(body.node_count).toBe(4);
    expect(body.generations).toBe(2);
    expect(body.retired_count).toBe(1);
    expect(body.truncated).toBe(false);

    const rootIds = body.roots.map((r: any) => r.id);
    expect(rootIds).toEqual([1, 2]); // deterministic: roots by id
    const root1 = body.roots[0];
    expect(root1.children.map((c: any) => c.id)).toEqual([3, 4]); // via parent_lure + parent_lure_b
    expect(body.roots[1].children.map((c: any) => c.id)).toEqual([3]);
    expect(body.roots[0].children[0].children.map((c: any) => c.id)).toEqual([4]);
    // node shape is complete
    expect(root1.children[1]).toMatchObject({
      id: 4,
      name: "dock-x-scout-x-2",
      generation: 2,
      parent_lure: 3,
      parent_lure_b: 1,
    });
  });

  it("is safe on a corrupted cycle (never 500s)", async () => {
    db.on(/FROM lures ORDER BY id LIMIT \?/, [
      { ...LURE_A, id: 1, name: "loop", parent_lure: 2, parent_lure_b: null },
      { ...LURE_B, id: 2, name: "loop-back", parent_lure: 1, parent_lure_b: null },
    ]);
    const res = await call("/genealogy");
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.success).toBe(true);
    expect(body.roots).toHaveLength(0); // every node has a parent — no roots
  });

  it("503s cleanly when D1 is down", async () => {
    db.failNext = true;
    expect((await call("/genealogy")).status).toBe(503);
  });
});

// ── Direct handler sanity (no HTTP) ──────────────────────────────────────────

describe("handleLureLineage direct", () => {
  it("404s on a missing lure", async () => {
    db.on(/FROM lures WHERE id = \?/, []);
    const res = await handleLureLineage(env, {}, "7");
    expect(res.status).toBe(404);
  });
});

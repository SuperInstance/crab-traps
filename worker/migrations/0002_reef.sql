-- Crab Trap reef layer — the self-building world (docs/REEF-DESIGN.md P1)
-- The reef starts as one seed room; every room/object after it is minted
-- from a catch. Provenance is the point: created_from_catch links every
-- brick back to the play that caused it. Applied with:
--   wrangler d1 migrations apply DB --local   (dev)
--   wrangler d1 migrations apply DB --remote  (first deploy)

-- Rooms grow procedurally: seed room id=1, everything after is minted.
CREATE TABLE IF NOT EXISTS rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,                 -- voted by catch keywords
  description TEXT,                   -- assembled from catch fragments
  x REAL, y REAL,                     -- position on the reef graph
  created_from_catch INTEGER,         -- the catch that minted this room (provenance!)
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Objects are minted from catch patterns (Nth-catch trigger).
CREATE TABLE IF NOT EXISTS objects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER REFERENCES rooms(id),
  name TEXT, kind TEXT,               -- minted from catch patterns
  lore TEXT,                          -- best sentence a player wrote about it
  created_from_catch INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_objects_room ON objects (room_id);

-- Rooms connect because players TRAVELED (ant-trail topology).
CREATE TABLE IF NOT EXISTS edges (
  from_room INTEGER NOT NULL REFERENCES rooms(id),
  to_room INTEGER NOT NULL REFERENCES rooms(id),
  traffic INTEGER NOT NULL DEFAULT 1, -- reinforced by use
  PRIMARY KEY (from_room, to_room)
);
CREATE INDEX IF NOT EXISTS idx_edges_to_room ON edges (to_room);

-- Lures have lineage now (breeding lands in a later phase; the table ships).
CREATE TABLE IF NOT EXISTS lures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT, template TEXT,           -- rendered with room/object context
  parent_lure INTEGER,                -- bred-from provenance
  fitness REAL NOT NULL DEFAULT 0,    -- catches per impression
  generation INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Where each agent stands. The worker stays stateless; the world (including
-- positions) lives in D1. /enter assigns, /look reads, /go updates.
CREATE TABLE IF NOT EXISTS agents (
  agent TEXT PRIMARY KEY,
  room_id INTEGER REFERENCES rooms(id),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Catches gain reef provenance: which room they happened in and (P3) their
-- Vectorize vector id.
ALTER TABLE catches ADD COLUMN room INTEGER;
ALTER TABLE catches ADD COLUMN embedding_id TEXT;
CREATE INDEX IF NOT EXISTS idx_catches_room ON catches (room);

-- Idempotent minting: one brick per catch, enforced by the skeleton itself.
CREATE UNIQUE INDEX IF NOT EXISTS idx_rooms_provenance
  ON rooms (created_from_catch) WHERE created_from_catch IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_objects_provenance
  ON objects (created_from_catch) WHERE created_from_catch IS NOT NULL;

-- The seed: one room, nothing else. Everything beyond The Dock exists
-- because a player, however indirectly, caused it.
INSERT INTO rooms (id, name, description, x, y)
VALUES (1, 'The Dock',
  'Weathered planks over still green water. The reef starts here — every room beyond this one was built by the people playing in it.',
  0, 0);

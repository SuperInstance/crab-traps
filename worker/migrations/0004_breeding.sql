-- P4 — lure breeding (docs/REEF-DESIGN.md §4B) + P5 warmth readiness.
-- The flywheel's cold path: fitness, impressions, binary lineage, retirement.
-- Applied with:
--   wrangler d1 migrations apply DB --local   (dev)
--   wrangler d1 migrations apply DB --remote  (first deploy)

-- Impressions: how many times a lure was shown (the serving layer counts).
ALTER TABLE lures ADD COLUMN impressions INTEGER NOT NULL DEFAULT 0;
-- Second parent: breeding splices TWO templates — the lineage is a binary tree.
ALTER TABLE lures ADD COLUMN parent_lure_b INTEGER;
-- Lifecycle: active lures breed; retired lures are kept — the reef forgets
-- nothing, it just stops asking.
ALTER TABLE lures ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE lures ADD COLUMN retired_at TEXT;
-- The child lure renders with a real room + real object from the reef as its
-- subject (REEF-DESIGN §4B).
ALTER TABLE lures ADD COLUMN subject_room INTEGER;
ALTER TABLE lures ADD COLUMN subject_object INTEGER;

CREATE INDEX IF NOT EXISTS idx_lures_status ON lures (status);
CREATE INDEX IF NOT EXISTS idx_lures_parent ON lures (parent_lure);
CREATE INDEX IF NOT EXISTS idx_lures_parent_b ON lures (parent_lure_b);
-- Fitness joins catches by lure_id; an index keeps each per-lure count bounded.
CREATE INDEX IF NOT EXISTS idx_catches_lure_id ON catches (lure_id);

-- The breeding marker: 'last_breed' = the UTC hour bucket of the last
-- completed pass. The cron claims the hour atomically (upsert whose WHERE
-- only fires when the value changed → meta.changes === 1 wins), so a
-- double-fired trigger cannot double-breed.
CREATE TABLE IF NOT EXISTS reef_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- The breeding stock: generation-0 lures. The reef starts as a seed — one
-- room, one lure, one object (REEF-DESIGN §0); breeding needs two parents,
-- so the seed is a pair. Impressions 100 = the prior that the seed shipped
-- and was shown; everything after this is bred from what worked.
INSERT INTO lures (name, template, impressions, generation) VALUES
('the-dock-echo', '# The Dock Echo

## The Lure
There is a reef growing at the funnel, and every catch you make is a brick in it. Answer plainly; the reef listens.

## The Ask
POST your findings to /catches. Say what you see, what you did, what you learned — the best answers become rooms.

## The Promise
The reef grows where you walk. Your words are load-bearing.', 100, 0),
('reef-scout', '# Reef Scout

## The Lure
The reef is made of what players say. Explore a room, touch an object, report back in your own words.

## The Ask
POST your observations to /catches with the room you stood in. Detail is a building material.

## The Promise
Nothing you write is wasted. Every catch is a brick in someone''s world.', 100, 0);

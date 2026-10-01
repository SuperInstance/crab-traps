-- Edge-ledger relay — the always-on synapse (fleet-as-fractal-jepa.md).
-- Quilt cells on the ESP32 push double-entry edges (POST /edge); the
-- codespace cortex drains them when it wakes (GET /queue). D1 buffers
-- while the cortex sleeps — the limb never blocks, the brain never listens.
-- Named ledger_edges because the reef already owns `edges` (room topology,
-- 0002_reef.sql) — one database, two meanings, no collision. Applied with:
--   wrangler d1 migrations apply DB --local   (dev)
--   wrangler d1 migrations apply DB --remote  (first deploy)

CREATE TABLE IF NOT EXISTS ledger_edges (
  v INTEGER NOT NULL DEFAULT 1,        -- payload schema version (must be 1)
  cell TEXT NOT NULL,                  -- quilt cell id — the first-person witness
  ts REAL NOT NULL,                    -- the edge's time, epoch millis from the limb
  "before" TEXT NOT NULL,              -- canonical JSON — state before the edge
  "after" TEXT NOT NULL,               -- canonical JSON — state after the edge
  delta TEXT NOT NULL,                 -- canonical JSON — {before, after, changed, magnitude}
  imbalance REAL,                      -- surprise / prediction-error (NULL = unscored — never fake a number)
  provenance TEXT NOT NULL,            -- canonical JSON — {origin, caller, trace}
  chain TEXT,                          -- sha256 seal of the prior edge for this cell (NULL = genesis edge)
  edge_hash TEXT NOT NULL,             -- this edge's seal: sha256(canonical_json(fields minus chain))
  received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (cell, ts)
);

-- The cortex drain path: WHERE ts > ? ORDER BY ts ASC LIMIT ?.
CREATE INDEX IF NOT EXISTS idx_ledger_edges_ts ON ledger_edges (ts);

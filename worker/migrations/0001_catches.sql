-- Crab Trap catch layer — D1 schema
-- Every catch is recorded here and survives anything the home boat does
-- (sleep, IP change, restart). Applied with:
--   wrangler d1 migrations apply DB --local   (dev)
--   wrangler d1 migrations apply DB --remote  (first deploy)

CREATE TABLE IF NOT EXISTS catches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  agent TEXT NOT NULL,
  job TEXT,
  lure_id TEXT,
  answer TEXT,
  user_agent TEXT,
  source_ip TEXT,
  payload TEXT
);

CREATE INDEX IF NOT EXISTS idx_catches_created_at ON catches (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_catches_agent ON catches (agent);

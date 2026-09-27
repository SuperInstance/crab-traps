-- Arena v0 (docs/ARENA-V0.md): session-zero consent receipts.
-- One row per acknowledgement. The receipt IS the point: the arena refuses to
-- open unless this write succeeds — no durable consent, no tank. Rows are
-- append-only; nothing here is ever rewritten (the tavern rule).
CREATE TABLE IF NOT EXISTS arena_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player TEXT NOT NULL,
  plaque_seal TEXT NOT NULL,
  ticket TEXT NOT NULL,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_arena_sessions_player ON arena_sessions(player);
CREATE INDEX IF NOT EXISTS idx_arena_sessions_ts ON arena_sessions(ts);

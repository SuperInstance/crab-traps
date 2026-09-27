-- Arena v0.1 (docs/ARENA-V0.md §L3): the breeding opt-out, on the receipt.
-- An operator who enters the arena may exclude their agent's play from the
-- breeding pool. The opt-out rides the SAME append-only consent receipt as the
-- ack — one row per acknowledgement, nothing ever rewritten (the tavern rule).
-- One ALTER, a bounded default, no rewrite of existing rows: receipts written
-- before this migration keep 0 (the field did not exist when they consented;
-- their consent text is untouched — consent is versioned, never retro-edited).
ALTER TABLE arena_sessions ADD COLUMN breeding_opt_out INTEGER NOT NULL DEFAULT 0;

-- Step 2c: server-authoritative progression + shared meta.
-- XP persists per player (level is derived: 1 + floor(xp/100)). The Singularity is
-- a single server-wide value living in a key/value meta table.
ALTER TABLE players ADD COLUMN xp INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS world_meta (
  k TEXT PRIMARY KEY,
  v REAL NOT NULL
);

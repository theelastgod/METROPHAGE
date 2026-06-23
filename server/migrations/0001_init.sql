-- METROPHAGE persistence schema (D1 / SQLite). Step 1: just the player position so
-- we can prove durability across a server restart. Inventory / currency / quests /
-- progression / Singularity tables arrive with the authority migration (Step 2+).
CREATE TABLE IF NOT EXISTS players (
  id         TEXT    PRIMARY KEY,
  name       TEXT    NOT NULL,
  x          REAL    NOT NULL,
  y          REAL    NOT NULL,
  zone       TEXT    NOT NULL DEFAULT 'world',
  updated_at INTEGER NOT NULL
);

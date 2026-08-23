-- Callsign is a unique display name, never the player id.
-- Guest ids are g:<uuid>; wallet ids stay w:<address>. Additive only.
ALTER TABLE players ADD COLUMN name_norm TEXT;

-- Stamp unique UPPER(name) values. Colliding leftovers stay NULL (SQLite UNIQUE
-- allows multiple NULLs); /player/available and claim still treat those names as taken.
UPDATE players
SET name_norm = UPPER(name)
WHERE name_norm IS NULL
  AND name IS NOT NULL AND name != ''
  AND id IN (
    SELECT id FROM (
      SELECT MIN(id) AS id
      FROM players
      WHERE name_norm IS NULL AND name IS NOT NULL AND name != ''
      GROUP BY UPPER(name)
      HAVING COUNT(*) = 1
    )
  );

-- Collision groups stay NULL; claim/available treat UPPER(name) as taken.
CREATE UNIQUE INDEX IF NOT EXISTS players_name_norm ON players(name_norm);

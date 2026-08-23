-- Callsign is a unique display name, never the player id.
-- Guest ids are g:<uuid>; wallet ids stay w:<address>. Additive only.
-- name_norm is nullable so pre-wipe rows cannot fail this migrate on collisions;
-- new claims always write it. SQLite UNIQUE allows multiple NULLs.
ALTER TABLE players ADD COLUMN name_norm TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS players_name_norm ON players(name_norm);

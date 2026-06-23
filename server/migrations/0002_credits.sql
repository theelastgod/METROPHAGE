-- Step 2b: server-authoritative currency. Credits are awarded by the server on a
-- kill and persisted so a player's balance survives a restart.
ALTER TABLE players ADD COLUMN credits INTEGER NOT NULL DEFAULT 0;

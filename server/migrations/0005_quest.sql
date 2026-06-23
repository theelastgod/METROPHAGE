-- Step 6: per-player questline progress (The Blank). Only the step index needs to
-- persist; progress within a step resets on relogin (you re-earn the current beat).
ALTER TABLE players ADD COLUMN quest_step INTEGER NOT NULL DEFAULT 0;

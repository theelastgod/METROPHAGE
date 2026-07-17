-- Consecutive-day login streak. streak_day is the last UTC day index a streak
-- reward was granted (the anti-replay guard — D1 is the only source of truth,
-- never DO memory); streak_days is the current run length for display/reward.
ALTER TABLE players ADD COLUMN streak_day INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN streak_days INTEGER NOT NULL DEFAULT 0;

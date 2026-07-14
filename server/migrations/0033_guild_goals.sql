-- Weekly Cell (guild) goal progress + claim tracking (ex-mint deep game).
CREATE TABLE IF NOT EXISTS guild_goal_progress (
  guild_id   INTEGER NOT NULL,
  week       INTEGER NOT NULL,
  goal_id    TEXT    NOT NULL,
  progress   INTEGER NOT NULL DEFAULT 0,
  claimed    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, week)
);
CREATE INDEX IF NOT EXISTS idx_guild_goal_week ON guild_goal_progress(week);

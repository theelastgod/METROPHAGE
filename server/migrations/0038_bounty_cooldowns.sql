-- Prevent repeatable world-boss jobs from becoming an unlimited credit faucet.
CREATE TABLE IF NOT EXISTS bounty_completions (
  player       TEXT    NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  bounty_id    TEXT    NOT NULL,
  completed_at INTEGER NOT NULL,
  PRIMARY KEY (player, bounty_id)
);

CREATE INDEX IF NOT EXISTS idx_bounty_completions_player_time
  ON bounty_completions(player, completed_at);

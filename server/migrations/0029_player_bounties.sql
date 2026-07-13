-- Authored NPC bounty tracker. This is separate from the rotating daily contracts:
-- a runner may hold one authored bounty at a time, and it must follow them across
-- zone Durable Objects and survive isolate eviction.
CREATE TABLE IF NOT EXISTS player_bounties (
  player     TEXT    PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  bounty_id  TEXT    NOT NULL,
  progress   INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0),
  updated_at INTEGER NOT NULL
);

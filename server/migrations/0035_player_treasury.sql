-- Per-player treasury memory: exact credits + $METRO position and lifetime bridge totals.
-- players.credits / players.metro remain the live game balances; this table is the
-- authoritative treasury view (balances mirrored + lifetime deposited/withdrawn).
-- metro amounts use integer micro-units (1_000_000 = 1 $METRO) to avoid float drift.

CREATE TABLE IF NOT EXISTS player_treasury (
  player                TEXT    PRIMARY KEY,
  credits               INTEGER NOT NULL DEFAULT 0,
  metro_units           INTEGER NOT NULL DEFAULT 0,
  deposited_metro_micro INTEGER NOT NULL DEFAULT 0,
  withdrawn_metro_micro INTEGER NOT NULL DEFAULT 0,
  deposited_credits     INTEGER NOT NULL DEFAULT 0,
  withdrawn_credits     INTEGER NOT NULL DEFAULT 0,
  pending_credits       INTEGER NOT NULL DEFAULT 0,
  pending_metro_micro   INTEGER NOT NULL DEFAULT 0,
  updated_at            INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS player_treasury_events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  player          TEXT    NOT NULL,
  kind            TEXT    NOT NULL,
  credits         INTEGER NOT NULL DEFAULT 0,
  metro_micro     INTEGER NOT NULL DEFAULT 0,
  rate            INTEGER,
  ref             TEXT,
  bal_credits     INTEGER,
  bal_metro_units INTEGER,
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_player_treasury_events_player
  ON player_treasury_events(player, created_at DESC);

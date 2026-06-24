-- Daily contracts — per-player, per-day progress on the day-seeded daily bounties. Kept in
-- D1 so a player's progress survives logoff and follows them across zones (a kill in any
-- district advances the same daily). Reputation itself is stored as a cross-zone counter in
-- player_stats (stat='rep'), reusing that infra — no new players column needed.
CREATE TABLE IF NOT EXISTS player_dailies (
  player      TEXT    NOT NULL,
  day         INTEGER NOT NULL,
  contract_id TEXT    NOT NULL,
  progress    INTEGER NOT NULL DEFAULT 0,
  done        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (player, day, contract_id)
);

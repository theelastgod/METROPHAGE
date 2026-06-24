-- Achievements + leaderboards. Cross-zone, so it MUST live in the shared store (D1),
-- not in any single zone DO. player_stats is a generic per-player counter bag (kills,
-- bosses, captures, credits earned, pvp kills, deepest district) that every zone DO
-- contributes to via additive UPSERTs; leaderboards just ORDER BY across it. player_achv
-- records unlocked achievements once (the (player,ach) PK makes a re-award a no-op).
CREATE TABLE IF NOT EXISTS player_stats (
  player TEXT    NOT NULL,
  stat   TEXT    NOT NULL,
  v      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (player, stat)
);
CREATE INDEX IF NOT EXISTS idx_player_stats_board ON player_stats(stat, v);

CREATE TABLE IF NOT EXISTS player_achv (
  player TEXT    NOT NULL,
  ach    TEXT    NOT NULL,
  at     INTEGER NOT NULL,
  PRIMARY KEY (player, ach)
);

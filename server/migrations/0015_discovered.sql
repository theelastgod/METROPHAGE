-- Map discovery — which zones a player has actually ARRIVED at. Drives the fast-travel map:
-- a zone is black/locked until visited, then lit + fast-travelable. Per-account (follows the
-- wallet identity), so it's shared D1, marked INSERT-OR-IGNORE on each arrival (login to a zone).
CREATE TABLE IF NOT EXISTS player_discovered (
  player TEXT    NOT NULL,
  zone   TEXT    NOT NULL,
  at     INTEGER NOT NULL,
  PRIMARY KEY (player, zone)
);

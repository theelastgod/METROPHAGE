-- Organic discovery — fast travel only to zones you reached without teleporting.
-- `organic=1` means the player walked/deployed there; `organic=0` is fog-only (seen via rumor/map).
ALTER TABLE player_discovered ADD COLUMN organic INTEGER NOT NULL DEFAULT 0;
UPDATE player_discovered SET organic = 1 WHERE organic = 0;
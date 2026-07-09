-- Home visitor book — signatures visitors leave in a player-owned estate. JSON
-- GuestEntry[] ({n,at,s}), newest first, capped at 24; stamps are server-chosen from a
-- fixed set so nothing player-written is persisted.
ALTER TABLE estates ADD COLUMN guestbook TEXT NOT NULL DEFAULT '[]';

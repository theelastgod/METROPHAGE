-- Accounts: a per-player item inventory. Items are server-authoritative loot (rolled
-- on a kill from the shared Item model) persisted as a JSON array, so a player's
-- holdings survive logoff/login. Capped in code so the row + payload stay bounded.
ALTER TABLE players ADD COLUMN inventory TEXT NOT NULL DEFAULT '[]';

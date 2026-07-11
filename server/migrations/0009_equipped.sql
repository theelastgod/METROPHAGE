-- Accounts: equipped gear (slot → Item) as JSON, so a player's loadout — and the combat
-- bonuses its mods grant — persist across logoff/login. '{}' = nothing equipped.
ALTER TABLE players ADD COLUMN equipped TEXT NOT NULL DEFAULT '{}';

-- Accounts: persist a player's appearance (PlayerLook) server-side as JSON, so their
-- traits survive logoff/login independent of the client's local save — and so a wallet
-- identity carries the same look across devices. NULL = none stored yet (use what the
-- client sends on login).
ALTER TABLE players ADD COLUMN look TEXT;

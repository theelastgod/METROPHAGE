-- Guest-identity device binding. A client-generated secret is bound to a callsign on its
-- first login and required on every later login (wallet-signature ids bypass — the sig is
-- stronger proof). Closes the hijack where anyone could log in as an existing name and
-- liquidate that player's stash/estate. NULL = legacy/unbound (binds on next login).
ALTER TABLE players ADD COLUMN secret TEXT;

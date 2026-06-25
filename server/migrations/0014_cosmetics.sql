-- Cosmetics / transmog — appearance overrides owned per identity (wallet account). Cosmetic
-- ONLY (zero power), so this never touches combat. One row per owned cosmetic; equipped=1
-- marks the active transmog (at most one). The server merges the equipped cosmetic's look
-- override onto the player's base look in the snapshot it relays, so everyone sees the skin.
-- NFT-tier cosmetics are acquirable only when the $METRO mainnet bridge is armed (counsel).
CREATE TABLE IF NOT EXISTS player_cosmetics (
  player      TEXT    NOT NULL,
  cosmetic_id TEXT    NOT NULL,
  equipped    INTEGER NOT NULL DEFAULT 0,
  at          INTEGER NOT NULL,
  PRIMARY KEY (player, cosmetic_id)
);

-- THE ESTATES — player-owned homes. One row per estate zone id (est0..estN). Ownership +
-- furniture layout persist here so any est{K} Durable Object (and a resale by another player)
-- reads a single source of truth. A missing row = never-owned, purchasable at the base price.
CREATE TABLE IF NOT EXISTS estates (
  id         TEXT PRIMARY KEY,              -- estate zone id, e.g. "est0"
  owner      TEXT,                          -- player id, or NULL when unowned
  owner_name TEXT,                          -- display name for signage
  price      INTEGER NOT NULL DEFAULT 2500, -- asking price (credits) while for_sale
  for_sale   INTEGER NOT NULL DEFAULT 1,    -- 1 = purchasable by anyone
  furniture  TEXT NOT NULL DEFAULT '[]',    -- JSON FurniturePiece[] — the owner's layout
  updated    INTEGER NOT NULL DEFAULT 0
);

-- Auction house — a server-mediated player market. Cross-zone (buyer + seller are rarely
-- in the same zone DO), so listings live in shared D1. The item is ESCROWED into the row
-- (removed from the seller's inventory) the moment it's listed, so it can't be duped/equipped
-- while for sale; a buy ATOMICALLY claims the row (guarded UPDATE) before any currency moves.
CREATE TABLE IF NOT EXISTS auctions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  seller      TEXT    NOT NULL,            -- seller player id
  seller_name TEXT    NOT NULL,
  item        TEXT    NOT NULL,            -- the escrowed Item, as JSON
  price       INTEGER NOT NULL,
  currency    TEXT    NOT NULL DEFAULT 'credits', -- credits | metro (metro is gated)
  status      TEXT    NOT NULL DEFAULT 'open',     -- open | sold | cancelled
  buyer       TEXT,                        -- set when sold
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auctions_open ON auctions(status, created_at);
CREATE INDEX IF NOT EXISTS idx_auctions_seller ON auctions(seller, status);

-- Cross-zone payout mailbox. When a sale (or any cross-zone transfer) must credit a player
-- who may be offline or in another zone DO, it drops a row here; that player's DO DRAINS it
-- (on login + on the supervisor alarm), adding the credits/cores/item to their live state and
-- deleting the row (claim-once). This is the general pattern for moving money/items between
-- the per-zone DOs without a central authority.
CREATE TABLE IF NOT EXISTS mailbox (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  player     TEXT    NOT NULL,
  credits    INTEGER NOT NULL DEFAULT 0,
  cores      INTEGER NOT NULL DEFAULT 0,
  item       TEXT,                         -- an Item as JSON, or NULL
  reason     TEXT    NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mailbox_player ON mailbox(player);

-- In-game $METRO balance (custodial premium currency for the world marketplace).
-- Separate from soft credits; funded by on-chain deposits and marketplace settlement.
ALTER TABLE players ADD COLUMN metro INTEGER NOT NULL DEFAULT 0;

-- Cross-zone mailbox: metro payouts when a seller is offline / in another zone.
ALTER TABLE mailbox ADD COLUMN metro INTEGER NOT NULL DEFAULT 0;
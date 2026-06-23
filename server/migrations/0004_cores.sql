-- Step 5b: a tradeable item. "Cores" drop from cops (data cores) and are swapped,
-- alongside credits, in secure server-mediated trades. Server-authoritative + persisted.
ALTER TABLE players ADD COLUMN cores INTEGER NOT NULL DEFAULT 0;

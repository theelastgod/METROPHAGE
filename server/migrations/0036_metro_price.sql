-- Cached $METRO market USD price (EVM). Refreshed ~every 30 minutes.
-- Single-row table: id=1 is the live quote used for credits↔$METRO rates.

CREATE TABLE IF NOT EXISTS metro_price (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  usd REAL NOT NULL,
  source TEXT NOT NULL,
  mint TEXT,
  chain_id INTEGER,
  fetched_at INTEGER NOT NULL,
  raw TEXT
);

INSERT OR IGNORE INTO metro_price (id, usd, source, mint, chain_id, fetched_at, raw)
VALUES (1, 1.0, 'bootstrap', NULL, NULL, 0, NULL);

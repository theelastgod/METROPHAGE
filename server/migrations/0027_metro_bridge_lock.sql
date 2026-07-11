-- Serialize EVM treasury withdraw claim builds (nonce race on concurrent cash-outs).
CREATE TABLE IF NOT EXISTS metro_bridge_lock (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  locked_until INTEGER NOT NULL DEFAULT 0,
  last_nonce INTEGER
);
INSERT OR IGNORE INTO metro_bridge_lock (id, locked_until, last_nonce) VALUES (1, 0, NULL);

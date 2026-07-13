CREATE TABLE IF NOT EXISTS pvp_escrows (
  player      TEXT    PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  amount      INTEGER NOT NULL CHECK (amount > 0),
  zone        TEXT    NOT NULL,
  state       TEXT    NOT NULL DEFAULT 'active'
                       CHECK (state IN ('active', 'refunding', 'transferring')),
  transfer_to TEXT    REFERENCES players(id),
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  CHECK (
    (state IN ('active', 'refunding') AND transfer_to IS NULL) OR
    (state = 'transferring' AND transfer_to IS NOT NULL AND transfer_to <> player)
  )
);

CREATE INDEX IF NOT EXISTS idx_pvp_escrows_state ON pvp_escrows(state, updated_at);

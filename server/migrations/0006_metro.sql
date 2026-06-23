-- Phase 5: $METRO custodial-bridge ledger. The off-chain, server-authoritative
-- `credits` balance is the live in-game currency; the bridge converts it to/from the
-- on-chain $METRO token at explicit withdraw/deposit moments. This ledger makes both
-- sides dupe-proof and auditable.
--
-- Withdraw: debit credits atomically, record a row, then settle on-chain (2b). A
-- failed settlement flips the row to 'failed' and refunds the credits.
CREATE TABLE IF NOT EXISTS metro_withdrawals (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  player     TEXT    NOT NULL,
  wallet     TEXT    NOT NULL,
  credits    INTEGER NOT NULL,           -- credits debited
  metro      REAL    NOT NULL,           -- $METRO owed (credits / rate)
  status     TEXT    NOT NULL DEFAULT 'pending', -- pending | done | failed
  tx_sig     TEXT,                       -- on-chain settlement reference
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_metro_withdrawals_player ON metro_withdrawals(player, created_at);

-- Deposit: an on-chain $METRO transfer INTO the treasury, claimed for credits exactly
-- once. tx_sig is the primary key, so the same transfer can never be credited twice.
CREATE TABLE IF NOT EXISTS metro_deposits (
  tx_sig     TEXT    PRIMARY KEY,        -- a given chain tx is claimable at most once
  player     TEXT    NOT NULL,
  wallet     TEXT    NOT NULL,
  metro      REAL    NOT NULL,           -- $METRO received
  credits    INTEGER NOT NULL,           -- credits granted (metro * rate)
  created_at INTEGER NOT NULL
);

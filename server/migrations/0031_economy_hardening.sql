-- Economy / session hardening:
-- * session_zone + session_at: last zone to claim the player; other DOs skip inventory/balance overwrites
-- * claim_nonce on withdrawals: EVM pre-signed cash-out nonces can be burned on TTL reclaim

ALTER TABLE players ADD COLUMN session_zone TEXT;
ALTER TABLE players ADD COLUMN session_at INTEGER NOT NULL DEFAULT 0;

ALTER TABLE metro_withdrawals ADD COLUMN claim_nonce INTEGER;

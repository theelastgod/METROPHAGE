-- Cached $METRO Solana oracle: spot + TWAPs + circuit-breaker state.
-- Additive only. id=1 remains the live quote row from 0036.

ALTER TABLE metro_price ADD COLUMN spot REAL;
ALTER TABLE metro_price ADD COLUMN twap_5m REAL;
ALTER TABLE metro_price ADD COLUMN twap_15m REAL;
ALTER TABLE metro_price ADD COLUMN prev_spot REAL;
ALTER TABLE metro_price ADD COLUMN reference_usd REAL;
ALTER TABLE metro_price ADD COLUMN reference_frozen_at INTEGER;
ALTER TABLE metro_price ADD COLUMN bridge_frozen INTEGER NOT NULL DEFAULT 0;
ALTER TABLE metro_price ADD COLUMN freeze_reason TEXT;
ALTER TABLE metro_price ADD COLUMN stable_quotes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE metro_price ADD COLUMN samples TEXT;

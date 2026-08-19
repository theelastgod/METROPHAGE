-- Quarantine smoke/test accounts so launch metrics read real players only.
-- is_bot=1 rows keep working normally in-game; they are excluded from /funnel,
-- the deploy fingerprint, and any human-facing counts. Additive only.
ALTER TABLE players ADD COLUMN is_bot INTEGER NOT NULL DEFAULT 0;

-- Backfill: known fixed fixtures (smoke-seed.sql + smoke.mjs modes)…
UPDATE players SET is_bot = 1 WHERE name IN (
  'abuser','flooder','whale','pauper','mseller','mbuyer','dresser','crafter',
  'galice','gbob','repvip','shopcash','zoologist','holdr','walletuser','blank',
  'insufficient_fun','fresh_random_sku','item_delta_test','proto_verify',
  'econ_test','mechanism_test','test_attacker','test_hunter'
);
-- …probe/tour prefixes (world-tour, tutorial, subway, guard probes)…
UPDATE players SET is_bot = 1 WHERE
  name LIKE 'smk_%'   OR name LIKE 'tur-%' OR name LIKE 'tut-%' OR
  name LIKE 'sub-%'   OR name LIKE 'grd-%' OR name LIKE 'gr2-%' OR
  name LIKE 'gr3-%'   OR name LIKE 'cls-%' OR name LIKE 'skb-%' OR
  name LIKE 'ct2-%'   OR name LIKE 'crt-%' OR name LIKE 'delver_%' OR
  name LIKE 'test_%'  OR name LIKE '%_test';
-- …and legacy timestamped smoke identities: two letters + digits (mv689193, st35091…).
UPDATE players SET is_bot = 1 WHERE
  name GLOB '[a-z][a-z][0-9]*' AND length(name) BETWEEN 4 AND 8
  AND name NOT GLOB '*[^a-z0-9]*';

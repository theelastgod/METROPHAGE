-- Smoke-battery pre-seed fixture. Some smoke modes assert against known balances;
-- run this against a MIGRATED local D1 with wrangler STOPPED (live DOs flush player
-- state over reseeds), then start wrangler and run the modes:
--
--   cd server
--   npx wrangler d1 execute metrophage --local --file scripts/smoke-seed.sql
--
-- Seeded expectations (from the mode headers in smoke.mjs):
--   metro:    whale 10000₵ · pauper 600₵ · metro ledger cleared
--   market:   mseller/mbuyer 2000₵ · empty bags · auctions+mail cleared
--   cosmetic: dresser 3000₵ · cosmetics cleared
--   craft:    crafter 6000₵ 60◈ · empty bag
--   guild:    galice 2000₵ · gbob 1000₵ · cells cleared
--   shop:     repvip 5000₵ · rep=300 (vendor tier 1) · shopcash 2000₵ (buy mechanics)
--
-- x/y are 0,0 on purpose — login-time spawn sanitation snaps out-of-bounds players
-- to the zone spawn, so fixtures never need to know walkable coordinates.

INSERT OR REPLACE INTO players (id, name, x, y, zone, updated_at, credits, cores, inventory, equipped)
VALUES
  ('whale',   'whale',   0, 0, 'safe', 0, 10000, 0,  '[]', '{}'),
  ('pauper',  'pauper',  0, 0, 'safe', 0,   600, 0,  '[]', '{}'),
  ('mseller', 'mseller', 0, 0, 'safe', 0,  2000, 0,  '[]', '{}'),
  ('mbuyer',  'mbuyer',  0, 0, 'safe', 0,  2000, 0,  '[]', '{}'),
  ('dresser', 'dresser', 0, 0, 'safe', 0,  3000, 0,  '[]', '{}'),
  ('crafter', 'crafter', 0, 0, 'safe', 0,  6000, 60, '[]', '{}'),
  ('galice',  'galice',  0, 0, 'safe', 0,  2000, 0,  '[]', '{}'),
  ('gbob',    'gbob',    0, 0, 'safe', 0,  1000, 0,  '[]', '{}'),
  ('repvip',  'repvip',  0, 0, 'safe', 0,  5000, 0,  '[]', '{}'),
  ('shopcash','shopcash',0, 0, 'safe', 0,  2000, 0,  '[]', '{}');

-- vendor tier 1 for the shop mode
INSERT OR REPLACE INTO player_stats (player, stat, v) VALUES ('repvip', 'rep', 300);

-- clean ledgers the seeded modes assert against
DELETE FROM metro_withdrawals;
DELETE FROM metro_deposits;
DELETE FROM auctions;
DELETE FROM mailbox;
DELETE FROM player_cosmetics WHERE player = 'dresser';
DELETE FROM guild_invites;
DELETE FROM guild_members;
DELETE FROM guilds;

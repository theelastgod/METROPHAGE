-- AUTHORIZED Solana relaunch wipe (one-time). New pump.fun mint = old ledger is junk.
-- Additive SQL only. Do NOT `d1 delete`. Do NOT change database_id. DO tag stays v1.
-- This PR does not run this against production. Ops night: run this wipe BEFORE
-- inserting the new metro_seed / buying treasury inventory. DELETE metro_seed clears
-- the old mint's seed row so a later INSERT is the live number.
--
-- Identity: DELETE players and every player-keyed table (callsign-as-id is gone after this).
-- Bridge: DELETE metro_* (EVM-shaped sigs / old mint / $1 bootstrap cannot be reused).
-- Estates: unown + list for sale + empty furniture/guestbook. Keep token / nft if present
-- (Genesis Key 1..50 and on-chain mint, filled after Metaplex mint).

DELETE FROM bounty_completions;
DELETE FROM player_bounties;
DELETE FROM player_discovered;
DELETE FROM player_cosmetics;
DELETE FROM player_dailies;
DELETE FROM player_achv;
DELETE FROM player_stats;
DELETE FROM pvp_escrows;
DELETE FROM mailbox;
DELETE FROM auctions;
DELETE FROM guild_goal_progress;
DELETE FROM guild_invites;
DELETE FROM guild_members;
DELETE FROM guilds;
DELETE FROM player_treasury_events;
DELETE FROM player_treasury;

DELETE FROM metro_deposits;
DELETE FROM metro_withdrawals;
DELETE FROM metro_seed;
DELETE FROM metro_price;
DELETE FROM metro_bridge_lock;

-- Plots stay. Deed columns (token, nft) are not touched.
UPDATE estates
SET owner = NULL,
    owner_name = NULL,
    for_sale = 1,
    furniture = '[]',
    guestbook = '[]',
    updated = 0;

DELETE FROM players;

-- 0026 NPC homes are not re-applied on migrate. Restore after the street wipe.
UPDATE estates SET owner='__npc_sparrow', owner_name='SPARROW', price=2500, for_sale=0,
  furniture='[{"k":"bed","x":2,"y":2},{"k":"shelf","x":4,"y":2},{"k":"bookcase","x":5,"y":2},{"k":"lamp","x":1,"y":3},{"k":"rug","x":6,"y":4},{"k":"sofa","x":9,"y":3},{"k":"table","x":11,"y":3},{"k":"chair","x":12,"y":4},{"k":"plant","x":13,"y":2},{"k":"poster","x":3,"y":1},{"k":"aquarium","x":10,"y":7},{"k":"jukebox","x":1,"y":6},{"k":"crate","x":12,"y":8},{"k":"neon_sign","x":7,"y":1}]',
  guestbook='[{"n":"RIN","at":1783500000000,"s":"was here"},{"n":"OLD MAREK","at":1783550000000,"s":"the neon suits you"}]',
  updated=1783600000000 WHERE id='est7';
UPDATE estates SET owner='__npc_velvet', owner_name='VELVET', price=2500, for_sale=0,
  furniture='[{"k":"bar_counter","x":4,"y":3},{"k":"bar_counter","x":6,"y":3},{"k":"jukebox","x":9,"y":2},{"k":"neon_sign","x":6,"y":1},{"k":"sofa","x":2,"y":6},{"k":"sofa","x":10,"y":6},{"k":"table","x":6,"y":6},{"k":"chair","x":5,"y":7},{"k":"chair","x":8,"y":7},{"k":"lamp","x":1,"y":2},{"k":"lamp","x":12,"y":2},{"k":"vending","x":13,"y":7},{"k":"poster","x":3,"y":1}]',
  guestbook='[{"n":"VEX","at":1783520000000,"s":"rent?"}]',
  updated=1783600000000 WHERE id='est10';
UPDATE estates SET owner='__npc_borne', owner_name='BORNE', price=4800, for_sale=1,
  furniture='[{"k":"crate","x":2,"y":2},{"k":"crate","x":3,"y":2},{"k":"crate","x":2,"y":3},{"k":"locker","x":5,"y":2},{"k":"locker","x":6,"y":2},{"k":"server_rack","x":12,"y":2},{"k":"weapon_rack","x":11,"y":2},{"k":"desk","x":8,"y":4},{"k":"chair","x":9,"y":5},{"k":"lamp","x":1,"y":4},{"k":"rug","x":6,"y":6},{"k":"terminal","x":13,"y":4}]',
  guestbook='[]',
  updated=1783600000000 WHERE id='est11';

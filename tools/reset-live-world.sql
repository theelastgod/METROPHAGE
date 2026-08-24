-- AUTHORIZED Solana relaunch wipe (one-time). New pump.fun mint = old ledger is junk.
-- Additive SQL only. Do NOT `d1 delete`. Do NOT change database_id. DO tag stays v1.
-- This PR does not run this against production. Ops night only, after treasury seed buy.
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

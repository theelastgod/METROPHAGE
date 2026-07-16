-- Authorized live-world reset, 2026-07-16.
-- Preserve bridge transaction ids for replay protection, but redact prior identities.
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
UPDATE metro_deposits SET player = '__world_reset__', wallet = '__redacted__';
UPDATE metro_withdrawals SET player = '__world_reset__', wallet = '__redacted__';
UPDATE estates
SET owner = NULL,
    owner_name = NULL,
    for_sale = 1,
    furniture = '[]',
    guestbook = '[]',
    updated = 0;
DELETE FROM players;

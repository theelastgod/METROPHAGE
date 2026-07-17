# Economy by player count (no daily earn / withdraw caps)

**Earn from play is unlimited.**  
**Daily cash-out volume is unlimited** (only the player-funded pool can refuse: *Check back later.*).

When registered players **exceed** 500 / 1000 / 1500 / 2500, only **bridge rates**
and a short anti-spam cooldown change — never a per-day earn or withdraw ceiling.

**Pool:** `dev seed (1% = 10M $METRO) + deposits − withdrawals`  
**Count:** `SELECT COUNT(*) FROM players`

## Tier table (rates only)

| Players | Tier | Daily emit | Daily WD | Deposit | Withdraw | Cooldown |
|---------|------|------------|----------|---------|----------|----------|
| **1–500** | launch | **unlimited** | **unlimited** | 1◈ → **100 ₵** | **150 ₵** → 1◈ | 30s |
| **501–1000** | growth | unlimited | unlimited | 100 ₵ | **160 ₵** | 35s |
| **1001–1500** | scale | unlimited | unlimited | **95 ₵** | **170 ₵** | 40s |
| **1501–2500** | mass | unlimited | unlimited | **90 ₵** | **185 ₵** | 45s |
| **2501+** | mega | unlimited | unlimited | **85 ₵** | **200 ₵** | 50s |

## What still limits cash-out
- Pool empty / too small for the amount → **Check back later.**
- Minimum withdraw floor (tier-dependent, ~300–400 ₵)
- Short cooldown between withdraw *requests* (not a daily max)
- On-chain treasury balance for live settlement
- EVM market USD price of $METRO (refreshed ~every 30 minutes) scales credits-per-$METRO
  rates so deposits/cash-outs track real token value (reference design: $1 / $METRO)

## Code
- `src/game/economyPolicy.ts` — policy
- `server/src/metro.ts` — withdraw (no daily SUM cap)
- `server/src/world.ts` — `grantEmit` (no daily emit cap)

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

Coverage stress (`<40%`) and crisis (`<15%`) widen the cash-out spread further.
They still do **not** add daily caps.

## Oracle (Solana / pump.fun)

Bridge rates are `pop-tier × priceMult`, with

`priceMult = clamp(twap_15m / reference, 0.05, 20)`

- **Refresh:** ~60s (Cloudflare cron `* * * * *`).
- **Rates use 15m TWAP.** HUD may show spot.
- **Reference** is frozen from the first 15 stable minutes after arm, or ops
  `METRO_USD_PRICE` / `METRO_USD_REFERENCE`. It is **not** forever $1 — a
  0.000008 pump.fun print must not pretend to be a dollar.
- **Source order:** `METRO_USD_PRICE` → Jupiter Price API v2 vs USDC →
  DexScreener (Solana, highest liquidity) → GeckoTerminal `networks/solana` →
  pump.fun bonding-curve while pre-graduation → last TWAP marked stale.
- Base58 mints are **never** `.toLowerCase()`d.
- A **null quote never becomes $1**. The bridge freezes instead.

## Circuit breaker (`bridge_frozen`)

Trips when any of:

- no fresh quote in 3 minutes
- spot vs previous spot moves **> 40%**
- spot vs 15m TWAP diverges **> 60%**
- treasury ATA vs D1 pool diverges materially (~20%)

While frozen, **deposits and withdraws** return **"Check back later."** until
**3 consecutive stable quotes**. High 5m realized vol adds extra cash-out
spread (farmers should not drain the pool on a green candle). Spread is always
positive; the ratio is not held constant at the 0.05× / 20× clamps.

## What still limits cash-out

- Pool empty / too small for the amount → **Check back later.**
- Oracle frozen / missing quote → **Check back later.**
- Minimum withdraw floor (tier-dependent, ~300–400 ₵, scaled by priceMult)
- Short cooldown between withdraw *requests* (not a daily max)
- On-chain treasury SOL + ATA for live settlement

## ₵ sinks (city burn)

Playing is the faucet. The city must burn ₵ or the bridge is the only exit.
Counted in `npm run sim:economy`: estate base **₵60,000**, furniture, forge,
cosmetics, PvP pots.

## Code

- `src/game/economyPolicy.ts` — policy
- `server/src/metroPrice.ts` — Jupiter TWAP + circuit breaker
- `server/src/metro.ts` — withdraw / deposit (no daily SUM cap; respects freeze)
- `server/src/world.ts` — `grantEmit` (no daily emit cap)
- `tools/economy-sim.mjs` — pump.fun price-path gate (`npm run sim:economy`)

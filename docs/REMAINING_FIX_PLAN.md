# Remaining problems plan (ex-mainnet)

Scope: product/ops issues **except** mainnet arming (`METRO_MAINNET_ARMED`).

## Status (2026-07-14)

| Problem | Status |
|---------|--------|
| Social UX chat-command heavy | **Done** — player context menu + pin contacts + `/contacts` |
| ESC dumps to menu | **Done** (prior) |
| Pathfind big maps | **Done** (prior) |
| Guild chat hops drop | **Done** (prior) |
| Content depth thin | **Done** — more bounties, dailies, VOID HERALD boss, coach funnel |
| Bridge pre-CA unfinished | **Done** — dual-path checklist + clearer phases (testnet without mainnet) |
| D1 / economy sinks | **Done** — higher vendor prices, lower kill/daily emit, supply_kit pure sink |
| Mobile | **Done** — cache headers, coach, panel smoke in CI (physical QA still recommended) |
| Cache after deploy | **Done** — `_headers` + build stamp in Options |
| Soul / identity promo | **Partial** — promo stills from cast; Soul train needs HF credits |
| Mainnet arm | **Out of scope** (counsel) |

## Testnet mint (no mainnet)

```sh
cd server
npx wrangler secret put METRO_MINT          # 0x… RH testnet CA or base58 Solana
npx wrangler secret put METRO_TREASURY_SECRET
npx wrangler deploy
# Client: VITE_METRO_MINT=<same> VITE_METRO_CLUSTER=robinhood-testnet npm run deploy:client
# Leave METRO_MAINNET_ARMED unset
```

## Verify

```sh
npm run verify:ship
cd server && npx wrangler deploy
npm run deploy:client
```

# Remaining problems plan (ex-mainnet)

## Status (current)

| Area | Status |
|------|--------|
| Soul Character | **Dropped** — no HF credits; use `public/assets/promo/` stills |
| Economy sinks | Tuned (vendor/NPC/forge/market/death tax) — recheck `/economy` after traffic |
| Bridge pre-CA | Dual-path checklist live; mint CA still ops-configured |
| Content | Bounties/dailies/boss roster expanded; per-boss raid variants |
| Social | Context menu + pin + `/contacts` |
| Cache / build stamp | Pages `_headers` + Options build id |
| Mainnet | **Out of scope** (counsel) |

## Ops still external

1. Set testnet mint when ready (`docs/METRO_CHAIN_CHOICE.md`) — leave `METRO_MAINNET_ARMED` off.
2. Real-device mobile QA checklist: `docs/MOBILE-QA.md`.
3. Mainnet arm only with counsel + CA.

## Verify

```sh
npm run verify:ship
cd server && npx wrangler deploy
npm run deploy:client
```

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
| Cell goals | Cross-zone mailbox payout + milestone toasts + integrity caps |
| Home buffs | Server sim + client prediction parity |
| Share cards | Opt-in (Options) + kill-credit only (`SHARE_KILL`) |
| Second hour | Requires boss touch; capture only if you channelled |
| Death UX | Levy + spawn + bag clarity on reboot card |
| Solo presence | Ambient roster + rotating city chatter |
| Discoverability | Systems hint strip after 2nd hour |
| Boss telegraphs | Thicker pulsing rings |
| Economy sinks | Kill 10₵, death ~10%, vendor/forge/market/furniture up; dailies/ach down |
| Mid-game spine | District War + 3rd hour coach |
| Guestbook tips | Visitor ₵25 burn, host ₵15 mail (net sink) |
| Dormant $METRO | Offline chip explains CA not armed |
| Mainnet | **Out of scope** (counsel) |

## Ops still external

1. Set testnet mint when ready (`docs/METRO_CHAIN_CHOICE.md`) — leave `METRO_MAINNET_ARMED` off.
2. Real-device mobile QA checklist: `docs/MOBILE-QA.md` (physical devices only).
3. Mainnet arm only with counsel + CA.
4. After traffic: rebalance via `/economy` report.

## Verify

```sh
npm run verify:ship
cd server && npx wrangler deploy
npm run deploy:client
```

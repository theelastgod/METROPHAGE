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

## July 2026 remediation pass

The locally actionable audit findings are fixed:

- Earnings are unlimited. The obsolete 2,500-credit emission-cap flag and
  configuration were removed; compatibility responses report a zero cap.
- Boss bounty rewards are protected by a persisted 24-hour cooldown and an
  atomic, cross-zone payout claim.
- Estate furnishing charges the server-computed layout delta before committing
  the layout; failed persistence restores the player's credits.
- Shard identity self-heals stale Durable Object instance metadata, and the
  router keeps small groups on a warm shard instead of waking every cold shard.
- Panel open/close behavior passes the automated desktop and mobile smoke gate.
- Large world-art groups load per zone instead of blocking initial boot.
- City business assignment avoids repeated environment/kind pairs and adds
  ripperdoc, pawn, arcade, garage, and radio identities.
- Vulnerable transitive bigint/UUID packages are replaced or overridden without
  downgrading the Solana integration.

These are release gates, not code defects that can be signed off locally:

- the physical-device checklist;
- sustained single-shard load verification in an uncontended environment;
- post-launch economy tuning from real traffic;
- mint/treasury production configuration and counsel approval before mainnet.

## Launch hardening (shipped)

See **`docs/LAUNCH_HARDENING.md`**: kill switches, hub soft-cap, enriched `/health`, prod smoke CI, rollback.

## Ops still external

1. Set testnet mint when ready (`docs/METRO_CHAIN_CHOICE.md`) — leave `METRO_MAINNET_ARMED` off.
2. Real-device mobile QA checklist: `docs/MOBILE-QA.md` (physical devices only).
3. Mainnet arm only with counsel + CA.
4. After traffic: rebalance via `/economy` report.
5. Run the single-shard load gate in an uncontended staging/production-equivalent
   Worker and watch the scheduled GitHub **Prod smoke** workflow.

## Verify

```sh
npm run verify:ship
cd server && npm run smoke:load
cd .. && npm run deploy:safe
```

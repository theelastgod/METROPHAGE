# Remaining problems plan (ex-mainnet)

## 2026-07-16 follow-through pass

- The July expansion work (art, six new venues, hotel rest, subway modules) is
  now COMMITTED and pushed (`feat/hf-environment-art`, tag `deployed-20260716`
  marks the tree production was serving while it was still uncommitted).
- Build stamps append `+dirty` when the tree doesn't match HEAD, and
  `release-client` warns loudly — git-SHA rollback is trustworthy again.
- Boot loader no longer wedges in hidden/background tabs: Phaser only pumps its
  load queue from the RAF loop, so a boot begun in a background tab stalled
  forever after the first 32 files (reproduced on prod). `pumpLoaderWhileHidden`
  (BootScene + OnlineScene zone loads) re-pumps on a timer.
- Panel smoke waits for `__bootDone` + a settled Select scene instead of racing
  the boot; `__enterCity` stops straggler scenes deterministically.
- The six expansion venues now actually show their authored occupants (TALLOW,
  MERCY, HOLLOW, ROOK, CINDER, STATIC) — the kind-keyed INTERIOR_PLAN was
  unreachable for `h{K}` hub zones; keeper-name collisions resolved.
- Districts gained NOODLE COUNTER + RIPPERDOC venues (7 of 9 buildings
  enterable; two stay scenery so the district kits keep the street identity).
  The `index >= 5` literals in server world.ts / sceneConfig now use
  DISTRICT_VENUE_COUNT.
- Hotel rest is covered end to end: unit tests on the service data and a
  `smoke.mjs rest` mode (refusal at full, ₵35 debit, heal, HEAT clear, 120 s
  cooldown, no double charge).
- MAREK's greeting escalates with your device-local reprint count; district
  bar patrons already leak the daily condition (`districtBarIntelLine`).
- Noodle got an infected-art fallback; three never-drawn room images no longer
  load on venue entry; SUBWAY_WARDEN has his own lines; a test now locks the
  three hand-synced kind tables together.

## 2026-07-16 evening pass (fix-all continuation)

- **Guest login was broken in production**: `signInThenConnect`'s `stillHere()`
  guard used `sys.isActive()`, which is FALSE during `create()` — the fully
  synchronous guest path returned before ever opening a socket (wallet paths
  survived only because their awaits resumed after create). Fixed to treat only
  SHUTDOWN/DESTROYED as gone. This was also the "black screen after tutorial on
  mobile" (first guest connect happens exactly there). `npm run smoke:panels` is
  GREEN end to end (desktop + mobile) for the first time.
- **Solana mobile wallet handoff**: WalletConnect/AppKit is the primary path in
  ordinary Safari/Chrome and opens a fitted Solana wallet picker with Phantom
  featured. AppKit initialization is awaited before the modal opens; after a
  wallet is chosen, connection and the free login signature are approved in the
  wallet app while play stays in the original browser. Phantom's encrypted
  connect/signMessage protocol remains only as the no-AppKit fallback. The old
  `phantom.app/ul/browse` game-in-wallet route has been removed. Physical-wallet
  approval still belongs in the real-device QA run.
- **World design**: the inner civic ring (citycenter/hotel/hospital at 7–11
  tiles from spawn) is gone — the centre is an open, furnished civic commons;
  landmark promotion keeps those kinds on the nearest street blocks. Every
  district plaza gained an authored centrepiece (docks tide pool, wastes slag
  crater, spire parade cross, stacks bazaar matting, undercity canal, relay
  antenna apron, kernel signal rings, core medallion) — ground-paint only,
  reachability tests green.
- **Quests/story**: every expansion keeper now has an authored, server-granted
  job (the "Job" buttons with nothing behind them are gone); the four story
  allies escalate to bigger late-act jobs (`LATE_BOUNTIES`) once THE WAKE
  reaches its final act — offer text and rewards phase-aware on both client
  and server.

## Status (current)

| Area | Status |
|------|--------|
| Soul Character | **Dropped** — no HF credits; use `public/assets/promo/` stills |
| Economy sinks | Tuned (vendor/NPC/forge/market fees; death is not a burn) — recheck `/economy` after traffic |
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
| Professions | Server-owned D1 XP; validated combat/trade/craft/discovery/archive awards |
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

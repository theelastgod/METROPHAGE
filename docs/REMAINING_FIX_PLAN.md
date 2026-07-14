# Remaining problems plan (ex-mainnet)

Scope: address remaining product/ops issues **except** mainnet arming (`METRO_MAINNET_ARMED`).

## Goals

| Problem | Approach |
|---------|----------|
| Social UX is chat-command heavy | Right-click / long-press players: Whisper, Trade, Party invite, Mute |
| ESC dumps to menu | Confirm “Quit to title?” when nothing else is open |
| Pathfind fails on big maps | Binary-heap A*, larger budget, wider goal snap |
| Guild chat hops drop | Touch `session_zone` on every persist; retry relay once |
| Content depth thin | More varied bounties (boss/HVT/collect mix) + regional NPCs |
| Bridge pre-CA feels unfinished | Clearer pool panel + docs for **testnet** mint without mainnet |
| D1 load | Cache guild zone set 2s; batch relay; slightly faster mail drain |
| Mobile | Context menu already on long-press; ensure player targets work |

## Non-goals

- Arm mainnet / counsel gate
- Invent a real mint CA (user configures secrets when ready)
- Full rewrite of questline or art pipeline

## Testnet mint (no mainnet)

When ready for real bridge rehearsal **without** mainnet:

```sh
cd server
# ERC-20 mint on Robinhood Chain *testnet* (46630)
npx wrangler secret put METRO_MINT          # 0x… testnet CA
# or METRO_DEVNET_MINT for legacy
npx wrangler secret put METRO_TREASURY_SECRET
npx wrangler deploy
# Client: VITE_METRO_MINT=<same> VITE_METRO_CLUSTER=robinhood-testnet npm run deploy:client
# Leave METRO_MAINNET_ARMED unset/off
```

## Implementation status

1. Pathfind heap + LOS simplify + larger budget
2. ESC double-tap quit confirm
3. Player social context menu (whisper/trade/party/mute)
4. Guild relay cache + session_zone touch + retry
5. Bounty/NPC variety pass
6. Metro pre-CA / testnet-facing copy
7. Deploy + commit

## Verify

- `tsc` both sides, `vitest run`
- Deploy Worker + Pages production
- Push `main`

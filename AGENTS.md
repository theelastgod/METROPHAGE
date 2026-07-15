# METROPHAGE — engineering notes

Top-down neon-noir cyberpunk **action-RPG MMO** in the browser. Phaser 3 + Vite + TS
client; **server-authoritative** world on Cloudflare (Worker + per-zone Durable
Objects at 20Hz + D1). The server owns every number — clients only render and send
intents. Campaign ("THE WAKE"), four classes with full kits, districts, dives,
world events, parties/guilds/trade/market/PvP, $METRO bridge.

## Live endpoints

- **Game:** https://metrophagev1.pages.dev (Cloudflare Pages, project `metrophagev1`, branch `main`)
- **Server:** https://metrophage-server.wendellphillips.workers.dev (Workers Paid, SQLite-backed DO)

## Redeploy (progress-safe)

```sh
npm run deploy:safe          # D1 fingerprint → additive migrate → Worker → re-check → client
npm run deploy:safe:server   # Worker only
npm run deploy:safe:client   # Pages only
npm run ship:scrub           # refuse AI/tool fingerprint markers before any ship
```

Never change `database_id`, never `d1 delete`, never unscoped `DELETE FROM players`
on remote. DO migration tag must stay `v1`.

`VITE_SERVER_URL` is **build-time**. Always bake
`wss://metrophage-server.wendellphillips.workers.dev/ws` for production client builds.
Always `--branch=main` for Pages or the deploy becomes a preview URL.

## Dev

```sh
export PATH="$HOME/.local/node/bin:$PATH"
npm run dev                  # client
cd server && npm run dev     # worker :8787
npm run typecheck            # root + server separately
```

Shared sim/game code under `src/` is imported by `server/src/world.ts` — nothing
under `src/net|game|world` may touch DOM globals.

## Testing

```sh
cd server && node scripts/smoke.mjs <mode>
```

- Prefer standalone smoke modes when diagnosing battery flakes.
- Reseed harness D1 only with wrangler **stopped**.
- Fresh bot callsigns each run; melee at ~45px for combat tests.
- World dims come from the login welcome, not hardcodes.

## Economy constraints

- Robinhood Chain ERC-20 primary; rates baseline **100 in / 150 out** (population
  tiers may widen the withdraw spread). Min withdraw ~**300 ₵**.
- **No daily earn cap. No daily withdraw cap.** Pool empty → **"Check back later."**
- See `docs/ECONOMY_POP_TIERS.md` and `src/game/economyPolicy.ts`.
- Mainnet: `METRO_MAINNET_ARMED` counsel-gated. CA go-live: server secrets first,
  then client `VITE_METRO_MINT` (0x).
- Treasury pays gas on cash-outs when funded (player-pays only if treasury ETH is empty).

## Art / render constraints

- `TILESET_PX` must equal `TILE` (32).
- Characters/cops/NPCs are code-baked from `src/assets/charart.ts` (32×32,
  4 facings × 4 steps). Don't point manifest entries at files without updating
  anim + origins.

## Docs

- `docs/ECONOMY_POP_TIERS.md` — population rate tiers
- `docs/BRIDGE_GO_LIVE.md` — bridge checklist
- `SHIPPING.md` — deploy runbook
- `README.md` — world map, kits, smoke modes
- `marketing/copy/opening-tweets-live.md` — launch social copy

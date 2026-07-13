# METROPHAGE

A neon-noir cyberpunk **action-MMO in the browser**. One shared, server-authoritative
city; a personal campaign about waking the minds the corps froze; a player-funded
**$METRO** economy on Solana. Phaser 3 + TypeScript client, Cloudflare Durable
Objects + D1 server.

**Premise:** every mind in Metro City is leased. You are a *Blank* — a repossessed
mind that booted free. The Human Security System wants you back on the ledger.
Push the Singularity; wake the rest.

## Play

- **WASD / arrows** move · **mouse** aim + fire · **SPACE** dash (i-frames)
- **Q / E** class abilities · **I** bag · **G** forge · **M** map · **J** quests
- **H** surface from interiors/dungeons · **ENTER** area chat · **V** emotes
- Touch devices: tap to walk/attack/enter; on-screen dash/Q/E buttons.

Four classes, each with a full server-validated kit:

| Class | Q | E |
|---|---|---|
| METROPHAGE | INFECTION POD (lobbed AoE) | CONTAGION BLOOM (nova + slow) |
| K-GUERILLA | DASH-STRIKE (attack dash) | AIRSTRIKE (called strike) |
| WINTERMUTE | HACK CONE (stun) | DEPLOY DRONES (sentry escort) |
| SWARM | SWARM TIDE (radial burst) | MINION PACK (swarm escort) |

## The world

- **Metro City** — the shared social hub: THE FIXER (campaign + contracts),
  market, forge, guilds, tailor, world map, leaderboards.
- **8 combat districts** — territory war over infection nodes (3 factions),
  world bosses, daily contracts, bounties, PvP crucible with $METRO buy-ins.
- **ICE VAULTS (v0–v7)** — instanced dives, one per district: fight a
  depth-scaled garrison (ICE WARDEN bosses from v2; THE CUSTODIAN guards v7),
  channel the fragment core, recover a **memory fragment** (claim-once per
  player, 16 authored) + a guaranteed gear cache whose rarity scales with depth.
- **THE UNDERLINE** — the subway dungeon.
- **Dynamic world events** — NEON STORM / BLACKOUT / REPO PURGE WAVE /
  CONTAGION OUTBREAK run on the server per district: telegraph → real sim
  effects → payout to everyone alive.
- **Campaign** — 9 quests across 3 acts (THE WAKE → THE AWAKENING),
  per-player progress inside the shared world, journal + waypoints.
- **Seasonal meltdown** — the save-wide Singularity tips into a new era.

## The $METRO economy

$METRO is a tradeable on-chain token bridged to server-authoritative `credits`.
**Preferred settlement: Robinhood Chain** (Ethereum L2, chain id **4663** mainnet /
**46630** testnet) via MetaMask. Solana SPL remains supported as legacy.

- In-game currency is off-chain `credits`.
- Sign-up: MetaMask + free message; wallet is auto-switched to Robinhood Chain.
- Cash-out pool is **100% player-funded** (starts empty).
- **Rate spread** (Robinhood launch): deposit 1 ◈ → **100 ₵**, withdraw **125 ₵** → 1 ◈
  (~20% stays in the pool). Min cash-out **250 ₵** (2 ◈). Daily cap **50k ₵** / player.
- On Robinhood Chain, treasury signs ERC-20 payouts (needs a little ETH for gas);
  players pay gas on deposits.
- Mainnet stays disarmed (`METRO_MAINNET_ARMED`) until counsel signs off.
  See `SHIPPING.md` §5.

## Develop

```sh
# client (Vite, http://localhost:5173 or the launch config port)
npm install && npm run dev

# server (Cloudflare Workers local; WebSocket on :8787)
cd server && npm install && npm run migrate:local && npm run dev

# bridge accounting smoke only (explicitly enables trusted simulated settlement)
cd server && npm run dev:sim

# both at once
npm run dev:online
```

- `npm run typecheck` / `npm test` — client checks.
- `cd server && npm run smoke:pvp-escrow` — isolated SQLite proof for atomic
  Crucible buy-in, elimination transfer, replay protection, and crash refund.
- `cd server && npm run smoke <mode>` — headless server proofs. Modes:
  `move combat kit mp zones quest trade territory social market daily look
  abuse subway interior safehouse dive event metro load` (see the header of
  `server/scripts/smoke.mjs` for battery-ordering constraints).
  The `metro` and `market` modes require the server to be started with
  `npm run dev:sim`; ordinary `npm run dev` keeps simulated ledger mutations locked.
- `npm run smoke:load -- 50` — 50-player local load/reconnect proof against the
  running server. It reports client snapshot rate/stalls, reconnect recovery,
  authoritative tick cost, and snapshot bandwidth from `/stats`. Soak duration
  and pass thresholds are configurable, for example:
  `LOAD_DURATION_MS=30000 LOAD_RECONNECT_FRACTION=.3 npm run smoke:load -- 100`.
  Useful gates are `LOAD_MIN_HZ`, `LOAD_MAX_SNAPSHOT_GAP_MS`,
  `LOAD_MAX_RECONNECT_MS`, and `LOAD_MAX_TICK_AVG_MS`.
  The normal 20-player local gate passes on one machine. Treat 50+ as a stress
  profile unless the Worker and clients run on separate hosts; local workerd,
  D1, and every Node bot otherwise compete for the same event loop/CPU budget.
- `SHIPPING.md` — one-command-per-side production deploy.
- `marketing/` — 30s gameplay trailer + posters (`build-trailer.sh`).

## Architecture (one paragraph)

The client never decides anything that matters: movement is intent-only
(server-validated speed, dash is the one sanctioned burst), every hit, drop,
cooldown, quest beat, trade, and $METRO settlement resolves in a per-zone
Durable Object; global state (players, market, guilds, stats, fragments,
bridge ledger) persists in D1. The client predicts locally, reconciles on ack,
and spends its budget on presentation: neon post-FX, kill-streak hit-stop,
boss title cards, SIGNAL LOST death sequences, and a city that feels wet.

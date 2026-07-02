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

## The $METRO economy (pump.fun launch reality)

$METRO is a fixed-supply token — **the developer cannot seed the treasury**.
The bridge encodes that honestly:

- In-game currency is off-chain, server-authoritative `credits`.
- The **cash-out pool is 100% player-funded**: deposits fill it, withdrawals
  drain it, and it starts at ZERO. Withdrawals reserve atomically and refund
  when the pool can't cover them.
- The **rate spread** funds the game: deposit 1 ◈ → 110 ₵, withdraw 125 ₵ → 1 ◈.
  ~12% of every round trip stays in the pool and pays players who only earn.
- Mainnet-value settlement stays disarmed (`METRO_MAINNET_ARMED`) until counsel
  signs off. Devnet rehearsal first. See `SHIPPING.md`.

## Develop

```sh
# client (Vite, http://localhost:5173 or the launch config port)
npm install && npm run dev

# server (Cloudflare Workers local; WebSocket on :8787)
cd server && npm install && npm run migrate:local && npm run dev

# both at once
npm run dev:online
```

- `npm run typecheck` / `npm test` — client checks.
- `cd server && npm run smoke <mode>` — headless server proofs. Modes:
  `move combat kit mp zones quest trade territory social market daily look
  abuse subway interior safehouse dive event metro load` (see the header of
  `server/scripts/smoke.mjs` for battery-ordering constraints).
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

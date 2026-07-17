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
  effects → explicit survive-to-resolution condition → payout to everyone alive;
  party reboots before resolution count as successful rescues.
- **Living districts** — every district has its own history, power blocs,
  residents, landmarks, secrets, and a rotating server-authoritative public
  operation. Purges, captures, bosses, and event survival directly help locals;
  completed operations build a shared daily aftermath visible in maps, rumours,
  arrivals, and retaliatory world events across every shard of that district.
- **Four political Cells** — classes are competing ideas of freedom, not just
  colors on a territory score; control messages name what each Cell promises.
- **People remember** — named contacts recognize meetings and completed work across
  devices; trust unlocks personal disclosures and better local intelligence.
  Districts likewise remember civic contribution as local standing. Sixteen recurring
  residents keep visible street/work/refuge/home schedules, and local testimony learned
  from one person changes what their district counterpart can reveal. Corroborating
  2/4/8 districts opens a durable city casefile and cross-district fieldwork directives;
  every confirmed counterpart has an optional evidence-driven follow-up job.
- **Campaign** — 10-part main arc plus 3 linked side jobs (THE WAKE → THE AWAKENING),
  per-player progress inside the shared world, journal + waypoints. Completed acts echo
  through allies, residents, maps, and recovered memories; the FIXER judgment persists
  as SPARE or EXPOSE and changes later callbacks, four ally positions, eight district
  aftermaths, and each Cell's political interpretation.
- **Reconstruction after the ending** — every district opens an authored post-Awakening
  resident job; completed work matures from CREW to COMMON to INSTITUTION and remains
  visible in resident dialogue and maps.
- **Ordered memory synthesis** — the order in which dive fragments are recovered changes
  eight district interpretations; the journal records recovery number and combination
  readings instead of flattening memory into an unordered checklist.
- **Weekly city chronicle** — shared Cell war, civic operations, command-chassis deaths,
  and collective goals become a server-authored city-center edition rather than a
  disposable client feed. Public work uses a bounded weekly district ledger, so the
  edition no longer forgets six days of civic history at UTC midnight.
- **Civic courier routes** — weekly public work opens four character-authored deliveries
  between districts, city center, the Clinic, and THE UNDERLINE. Only authoritative zone
  arrival completes them, and durable 24-hour settlements prevent fast-travel payouts.
- **Daily relay charters** — territory flips leave a bounded public memory of the latest
  Cell and its civic use for each district. Maps, arrivals, and the chronicle remember the
  contest, while live nodes remain the sole authority for control and rewards.
- **Seasonal meltdown** — the save-wide Singularity tips into a new era.
- **Co-op attribution** — nearby party allies share story/contract/public-operation/job
  progress, while base kill value and Cell tally remain attached to the killing blow.
- **Social memory** — party reboots persist as bounded rescuer/recipient history, and
  contacts recognize mutual aid plus the authored provenance of equipped cosmetics.

## The $METRO economy

$METRO is a tradeable on-chain token bridged to server-authoritative `credits`.
**Preferred settlement: Solana SPL** via Phantom. Robinhood Chain ERC-20 remains in the
tree as a dormant alternate (`METRO_SETTLEMENT=robinhood`), not the launch path.

- In-game currency is off-chain `credits`.
- Sign-up: Phantom + free message (no gas).
- Cash-out pool is **100% player-funded** (starts empty). Empty/short pool →
  **"Check back later."**
- **Rate spread**: deposit 1 ◈ → **100 ₵**, withdraw **150 ₵** → 1 ◈.
  Min cash-out **300 ₵** (2 ◈). There is no daily earn or withdrawal cap.
- Cash-outs: treasury preferably pays SOL and sends $METRO; player-pays only if treasury SOL is empty.
- Go-live: server `METRO_MINT` + `METRO_TREASURY_SECRET` (base64 keypair) first, then
  client `VITE_METRO_MINT`. Mainnet stays disarmed (`METRO_MAINNET_ARMED`) until counsel
  signs off. See `SHIPPING.md` §5 / `docs/METRO_CHAIN_CHOICE.md`.

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

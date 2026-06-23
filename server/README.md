# METROPHAGE server — Phase 4 (online / server-authoritative)

Cloudflare **Worker + Durable Objects + D1**. The authoritative game simulation
lives server-side; clients send *intent* and render what the server decides.

**Phase 4 is complete** — all seven steps below, built incrementally with a runnable,
verified commit at each one: a single-player browser game is now a server-authoritative
shared world (movement, combat, loot, currency, progression, territory, a shared
Singularity + seasonal meltdown, chat/parties, secure trading, a per-player questline),
hardened with anti-cheat + a hibernatable production lifecycle.

## Status

### Step 1 — architecture spike ✅

- **Authoritative DO** (`WorldDO`) runs a fixed 20 Hz tick and is the source of
  truth for player position. Clients send movement **intent only** (`mx,my` in
  `-1..1`) and never a position — so they cannot teleport or speed-hack.
- **D1 persistence** — positions written every ~2 s and on disconnect, so state
  survives the DO being evicted or the server fully restarting.
- **Acks** — each snapshot reports the last processed input seq per player.

### Step 2 — authority migration (movement) ✅

The local player's movement is now **server-authoritative in the real game**, with
**client-side prediction + reconciliation**:

- **Shared deterministic sim** (`src/net/sim.ts` in the client repo, imported by
  BOTH sides) — fixed-step movement + axis-separated tile collision against the
  real district grid (`buildGrid`). Because client and server run the *exact same*
  code, prediction reconciles to ~0 px error.
- **Server** integrates movement through that sim against `buildGrid(DISTRICTS[0])`
  and spawns at the real walkable spawn point — walls, speed and bounds enforced
  server-side. (The worker bundles the client's pure `src/` modules directly; no
  duplication.)
- **Client** (`src/net/NetClient.ts` + `src/scenes/OnlineScene.ts`, reachable from
  the Select screen's "⊕ ONLINE" button) predicts locally, then on each snapshot
  snaps to the authoritative position and replays still-unacked inputs. A net-debug
  HUD shows predicted vs server position and the reconciliation error (verified at
  0.00 px in lockstep).

### Step 2b — server-authoritative combat ✅

The server simulates **enemies and projectiles** and decides every outcome:

- **Enemies** (cops) spawn at the district's cop-posts, chase the nearest player
  through the shared movement sim, and fire on a cooldown.
- **Fire** — the client sends only a `fire` intent (aim angle). The server enforces
  the fire rate, spawns a projectile, integrates it, and resolves hits with
  **swept collision** (a fast shot can't tunnel past a point-blank target).
- The server owns **HP, damage, kills, death/respawn**, and awards **credits** on a
  cop kill — **server-authoritative currency**, persisted to D1 (migration `0002`).
  The client never reports a hit, a kill, damage, or a balance.

Verified headless (`smoke.mjs combat`): 4 enemies simulated, player shots spawned,
the server damaged/killed cops and paid credits, and cops damaged the player. In
the browser: cops render and chase, shooting them awards credits, and cop fire can
eliminate + respawn the player.

### Step 2c — loot / progression / shared Singularity ✅

All server-authoritative, all persisted to D1 (migration `0003`):

- **Loot** — a cop kill rolls a drop (credit cache / data core) at the corpse;
  walking over it grants it. The server decides the roll and the grant.
- **Progression** — a kill awards XP; level is derived (`1 + floor(xp/100)`); XP
  persists per player. The client only renders LV / XP.
- **Singularity** — a single **server-wide** meter that *every* player's kills push,
  broadcast in every snapshot and persisted in a `world_meta` row. It survives a
  restart (reloads its value) — the seed of the shared meta that Step 4 expands.

Verified (`smoke.mjs combat`): server awarded XP, rolled loot drops, and raised the
shared Singularity; browser HUD shows LV/XP/₵/HP + the shared Singularity, and the
meter reloaded its persisted value after a restart.

### Step 3a — multiplayer + area-of-interest ✅

- **Multiplayer** — 2+ players share a zone and see each other move in real time
  (remote players are interpolated + labelled, faded when dead). Each player's
  kills push the same shared Singularity.
- **AOI** — the server builds a **per-client snapshot**: each player is only sent
  the players / enemies / shots / pickups within `AOI_RADIUS` of their own
  position (always including itself). This is what makes scale possible.

Verified (`smoke.mjs mp`): two clients near spawn see each other; driven 1420 px
apart, the AOI culls them (neither appears in the other's snapshot). A `bot` mode
(`smoke.mjs bot <name>`) runs a wandering 2nd player for the browser demo.

### Step 3b — zones + handoff ✅

- **One Durable Object per district.** The Worker routes `/ws?zone=dN` to
  `idFromName("dN")`; the DO reads the same `?zone=` and binds itself to that
  district (grid, spawn, cops). Players in different zones are in different DOs and
  can't see each other.
- **Handoff** — the client travels with keys `1‥N`; it reconnects to the new zone's
  DO and spawns at that district's entrance. Credits / XP / level carry across
  (D1 is the shared identity store; the player's current zone is tracked too).
- **Singularity is shared across ALL zones** — each DO flushes its kill
  contribution to one `world_meta` row with an atomic increment and re-reads the
  global value, so the meter is genuinely server-wide.

Verified (`smoke.mjs zones`): two clients in d0/d1 have different spawns, don't see
each other, and a kill in d0 raises the Singularity the d1 client reads. Browser:
travelled d0→d1 ("THE STACKS"), spawned at the new entrance with XP/credits intact.

### Step 4a — territory control + faction war ✅

The shared world becomes contested. All server-authoritative:

- **Territory** — each district has infection nodes the server owns. A player within
  range channels a node toward **their faction** (the four cells = the four classes,
  assigned from the player's signature colour). Capturing flips ownership; an enemy
  faction (or uncontested decay, modelling the HSS) erodes a held node back toward
  neutral. **District control** = whichever faction holds the most nodes.
- **Faction war** — a **server-wide contribution leaderboard** per faction, fed by
  node captures (+holds) and kills, shared across ALL zones via the same atomic D1
  meta sync as the Singularity (generalized into `bumpMeta`/`syncMeta`).

Verified (`smoke.mjs territory`): a player channelled a node, captured it for their
faction, the faction's contribution rose (0→12), and it took district control.
Browser HUD shows CELL / DISTRICT CONTROL / FACTION WAR (M/K/W/S) live.

### Step 4b — seasonal meltdown + new era ✅

When the shared Singularity caps at 100, a **server-wide meltdown** runs for a fixed
window (the HSS goes berserk — cops faster + firing twice as often), which every
player experiences together. Then the world **resets into a new era**: the
Singularity drops to 0 and the **season** increments. The reset is guarded (only the
DO that actually zeroes the meter bumps the season), so it fires once even across
zones. The client shows a meltdown overlay during it and a "NEW ERA — SEASON N"
banner on the reset.

Verified (`smoke.mjs meltdown`, with the meter pre-armed near max): the Singularity
hit 100 → meltdown went active → it reset and the season incremented (1→2). Browser
caught the "NEW ERA — SEASON 4" banner + ERA counter in the HUD.

### Step 5a — chat / presence / parties ✅

Server-mediated social, within a zone:

- **Chat** — `zone` (everyone in the DO), `party` (party members), and `whisper`
  (a single player). Rate-limited (~3/s) + length-capped server-side; recipients can
  **mute** a player (their messages are dropped server-side).
- **Presence** — every snapshot carries a roster of everyone in the zone (id /
  faction / level); the client shows an ONLINE panel.
- **Parties** — `/party <name>` invite → `/join` accept → `/leave`; party membership
  is broadcast to members and cleaned up on disconnect.

Client: press ENTER to chat; plain text is zone chat, `/w /p /party /join /mute` are
commands. Verified (`smoke.mjs social`): two clients exchanged zone + whisper + party
chat, formed a party, and saw each other in the roster.

### Step 5b — secure server-mediated trading ✅

Two players swap credits + **cores** (a tradeable item dropped by cops) through a
strictly server-mediated trade. The security properties:

- **Both must confirm** before anything moves.
- **Changing an offer voids both confirmations** (no sneaking a change in after the
  partner confirms).
- **Dupe-proof / atomic** — at execution the server re-validates against *live*
  balances (not the offered amounts) and applies the swap all-or-nothing. If either
  side can't cover its offer, the trade resets with no change.
- **Server-owned balances** — the client only sends offer amounts and confirm/cancel;
  it never reports a balance or moves an item itself.

Verified (`smoke.mjs trade`): 100₵/5◈ + 50₵/2◈ → after the swap exactly 80₵/4◈ +
70₵/3◈; and offering 999999₵ you don't have resets the trade with balances intact.
Browser shows the live SECURE TRADE panel (both offers + confirm state).

### Step 6 — the questline, in the shared world ✅

*The Blank* runs as a **server-authoritative** per-player arc (`src/net/quest.ts`,
shared by client + server). Five beats across three acts — THE WAKE → THE CURRENT →
THE CONVERGENCE — each tied to an objective the shared world already produces:

| step | act | objective | driven by |
| --- | --- | --- | --- |
| 0 | THE WAKE | kill 2 cops | combat (Step 2b) |
| 1 | THE WAKE | capture 1 node | territory (Step 4a) |
| 2 | THE CURRENT | kill 6 cops | combat |
| 3 | THE CURRENT | collect 3 cores | loot (Step 2c) |
| 4 | THE CONVERGENCE | survive 1 meltdown | seasonal meltdown (Step 4b) |

Lore made literal: every player is a Blank carrying their *own* progress through the
*same* arc, advancing among other real Blanks — phasing as canon. The server owns the
truth: it counts kills/captures/cores/meltdowns server-side (`questEvent`), advances
`questStep` only when the live count is met, and pushes a `story` beat on each
advance. `quest_step` persists in D1 (migration `0005_quest`); progress *within* a
step re-earns on relogin. The client never reports progress — it only renders the
tracker (`[n/count]`) and the story banner.

Verified (`smoke.mjs quest`): start step 0 → kill 2 cops advances to step 1 → capture
a node advances to step 2 → 3 story beats delivered → reconnect after restart and the
step is still 2 (persisted). Browser shows the top-center quest tracker and the
bottom-left story banner on each beat.

### Step 7 — anti-cheat + ops hardening ✅

The production lifecycle + abuse resistance pass.

**Hibernatable WebSockets + a durable supervisor alarm.** Sockets are now accepted
via the **Hibernation API** (`state.acceptWebSocket` + `webSocketMessage/Close/Error`
handlers) and each carries a `serializeAttachment({id,name,faction})`, so they
survive DO eviction. The constructor's `blockConcurrencyWhile` re-binds the zone
(persisted to storage) and **rehydrates** every still-open socket's player from D1
before processing any event. A self-rescheduling **alarm** (`SUPERVISOR_ALARM_MS`)
is the lifecycle backstop: it resumes the sim if the isolate was recycled
mid-session (alarms survive eviction; the spike's `setInterval` did not) and
heartbeat-persists, then lapses when a zone empties so the DO hibernates cleanly.
The 20 Hz loop itself stays an in-memory interval *while a zone is hot* — that is
deliberate: a real-time authoritative sim must run continuously, and continuous
duration is cheaper and more precise than 20 alarms/second. The alarm makes that
loop **supervised + durable** rather than fire-and-forget.

**Anti-cheat.** A per-socket flood guard drops messages past a soft cap (~400/s)
and closes the socket on a real flood (~1200/s), with oversized payloads rejected
outright (`MAX_MSG_BYTES`) and a `console.warn` on every trip. This is defense in
depth: movement was already flood-immune (intent is integrated **once per server
tick**, never per message, so spamming inputs cannot speed-hack) and the fire rate
was already server-enforced — the guard stops raw volume from exhausting CPU/bandwidth.

**Ops.** `/health` returns JSON; `/stats?zone=dN` returns a live per-zone probe
(players, enemies, shots, tick, running, singularity, meltdown, season) for monitoring.

Verified headless: `smoke.mjs abuse` (an 8× input flood travels no farther than
wall-clock allows; malformed/oversized/unknown messages are survived; a 200-message
burst gets the offending socket force-closed while a well-behaved socket is
untouched) and `smoke.mjs load 20` (20 concurrent players: none dropped, the server
keeps broadcasting to every one). All Step 1–6 smoke modes still pass, including
position-persists-across-restart through the new close/login path. (Local
`wrangler dev` does not actually evict DOs, so the rehydration *wake* path is
correct-by-construction + exercised by the cold-start constructor on every restart,
rather than directly forced.)

### What's intentionally NOT here yet

Crews (persistent cross-session groups, vs. the in-session parties here); global
(cross-zone) chat/presence via a hub DO; lag compensation for the hitscan/beam
weapon; per-class weapons in the online path; and story-critical questline beats as
true instanced/phased rooms (Step 6 phases progress per-player, but every beat
resolves in the shared city). These are post-Phase-4 polish.

## Run it

```bash
cd server
npm install
npm run migrate:local          # apply D1 schema to the local SQLite db
npm run dev                    # wrangler dev on http://127.0.0.1:8787

# in another shell — prove the loop:
node scripts/smoke.mjs move    # log in, move under server validation, record pos
# ...restart `npm run dev`...
node scripts/smoke.mjs check   # log in again, assert the position persisted
```

`smoke.mjs` is a headless WebSocket client (Node's built-in `WebSocket`) with a mode
per system:
`move`/`check` (movement + persistence), `combat`, `mp` (AOI), `zones`, `territory`,
`meltdown`, `social`, `trade`, `quest`, `abuse` (anti-cheat), `load [N]` (concurrency),
`metro` ($METRO bridge), and `bot <name>` (a wandering player for browser demos). A few
modes expect the harness to pre-seed D1 — e.g. `trade` wants alice/bob to hold balances,
`metro` wants whale=10000 / pauper=600 credits with the metro ledger cleared, and
`meltdown` pre-arms `world_meta.singularity` near the cap.

Ops probes: `curl /health` (JSON liveness) and `curl "/stats?zone=d0"` (live per-zone
counts — players, enemies, tick, running, singularity, season).

## Layout

- `src/world.ts` — `WorldDO`, the authoritative per-zone simulation (Hibernatable
  WebSockets, the 20 Hz loop, combat/territory/quest/trade, supervisor alarm).
- `src/index.ts` — Worker entry; routes `/ws`, `/stats`, `/health`, `/metro/*`.
- `src/metro.ts` — $METRO custodial-bridge accounting (Phase 5; see below).
- `migrations/` — D1 schema (`0001_init` … `0006_metro`).
- `scripts/smoke.mjs` — headless acceptance tests (modes listed under **Run it**).
- The deterministic sim + protocol are **imported from the client repo**
  (`../../src/net/*`, `../../src/world/*`, `../../src/game/*`) — a single source of
  truth, not duplicated server-side.

## Deploy

Local dev uses a SQLite file under `.wrangler/state` and the placeholder
`database_id` in `wrangler.toml`. To deploy for real:

```bash
npx wrangler d1 create metrophage          # paste the returned database_id into wrangler.toml
npx wrangler d1 migrations apply metrophage # apply schema to the remote D1
npx wrangler deploy                         # publish the Worker + WorldDO
```

The DO migration (`[[migrations]] tag = "v1"`) and the Hibernation API need no extra
config. Cloudflare provides edge DDoS protection in front of the Worker; the
per-socket flood guard (Step 7) is the in-DO complement. Bump `compatibility_date`
to `≥ 2026-04-07` to let the runtime auto-complete WebSocket close handshakes (until
then `webSocketClose` reciprocates `ws.close()` itself).

## $METRO custodial bridge (Phase 5 · devnet)

The live in-game currency stays the off-chain, server-authoritative `credits` ledger —
you cannot run a 20 Hz authoritative loop on-chain. "$METRO as a P2E currency" is a
**server-mediated convertibility bridge** that moves value across that boundary:

- `GET  /metro/account?player=ID` — credits, rate, $METRO value, daily-cap + cooldown state.
- `GET  /metro/quote?credits=N` — credits → $METRO at the configured rate.
- `POST /metro/withdraw {player,wallet,credits}` — **atomically** debits credits (a
  conditional `UPDATE … WHERE credits >= ?`, so no double-spend), records the row, then
  settles on-chain. A failed settlement refunds the credits.
- `POST /metro/deposit {player,wallet,txSig,metro}` — credits the off-chain balance for a
  verified on-chain transfer, **claim-once** (`tx_sig` is a PRIMARY KEY).

Authority holds: the server owns every balance and authorizes every settlement; the
client never mints, reports a balance, or double-spends. Anti-abuse (because credits now
carry cash value): per-player withdraw minimum, cooldown, and a rolling daily cap.

`src/metro.ts` is **step 2a — the accounting**, with the actual Solana settlement behind a
`Settlement` seam (currently `simSettlement`, a devnet stub) so the whole ledger is
headlessly testable (`smoke.mjs metro`, 8/8). **Step 2b** swaps in real devnet transfers +
tx verification; **2c** adds wallet-connect (Sign-In-With-Solana) + UI.

**Not yet (deliberate, by the agreed constraint):** real wallet-ownership auth bound to an
authenticated game identity (Phase 4 login is name-only — fine for devnet, a mainnet
blocker), and **mainnet/real-value arming, which waits for counsel sign-off** (the client
`METRO_MAINNET_ARMED` flag stays off; `$METRO` is a fixed-supply pump.fun token, so
withdrawals are paid from a finite treasury, never minted).

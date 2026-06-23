# METROPHAGE server — Phase 4 (online / server-authoritative)

Cloudflare **Worker + Durable Objects + D1**. The authoritative game simulation
lives server-side; clients send *intent* and render what the server decides. This
is the foundation for the single-player → shared-world migration.

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

### What's intentionally NOT here yet

Seasonal meltdown + new-era reset — Step 4b (the Singularity hitting 100 becomes a
server-wide event that resets into a new season); lag compensation for the
hitscan/beam weapon; per-class weapons in the online path (generic stats for now);
social — chat / parties / trading (Step 5); and the WebSocket Hibernation API +
alarms (production tick model — the spike uses an in-memory `setInterval`).

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

`smoke.mjs` is a headless WebSocket client (Node's built-in `WebSocket`). It
asserts: server-moved-on-intent, speed is server-enforced (a `mx=999` cheat does
not accelerate), bounds clamp, intent expiry on silence, and
position-persists-across-restart.

## Layout

- `src/protocol.ts` — message shapes + simulation constants (tick, speed, world).
- `src/world.ts` — `WorldDO`, the authoritative per-zone simulation.
- `src/index.ts` — Worker entry; routes `/ws` to the zone DO.
- `migrations/` — D1 schema.
- `scripts/smoke.mjs` — Step-1 acceptance test.

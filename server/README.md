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

### What's intentionally NOT here yet

Loot rolls, progression, and Singularity authority (next, same pattern); lag
compensation for hitscan/beam weapons; multiple players / AOI / zones (Step 3); and
the WebSocket Hibernation API + alarms (production tick model — the spike uses an
in-memory `setInterval`, fine with a live connection).

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

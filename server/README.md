# METROPHAGE server — Phase 4 (online / server-authoritative)

Cloudflare **Worker + Durable Objects + D1**. The authoritative game simulation
lives server-side; clients send *intent* and render what the server decides. This
is the foundation for the single-player → shared-world migration.

## Status: Step 1 — architecture spike ✅

Proves the hard part before migrating any game systems:

- **Authoritative DO** (`WorldDO`) runs a fixed 20 Hz tick and is the source of
  truth for player position. Clients send movement **intent only** (`mx,my` in
  `-1..1`) and never a position — so they cannot teleport or speed-hack. The
  server clamps intent to a unit vector, integrates at a fixed speed, clamps to
  world bounds, and expires stale intent (a lost "stop" packet can't slide a
  player forever).
- **D1 persistence** — positions are written to D1 (every ~2 s and on disconnect),
  so state survives the DO being evicted or the server fully restarting.
- **Acks** — each snapshot reports the last processed input seq per player, the
  hook client-side reconciliation will use in Step 2.

### What's intentionally NOT here yet

Client prediction/reconciliation in the real game (Step 2), multiple players /
AOI / zones (Step 3), and the WebSocket Hibernation API + alarms (the production
tick model; spike uses an in-memory `setInterval`, fine with a live connection).

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

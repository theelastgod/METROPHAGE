# METROPHAGE — multiplayer deploy + scale notes

The online game is a Cloudflare Worker + Durable Objects (`WorldDO`, one per zone) + D1.
Everything runs locally today (`127.0.0.1:8787`); going live is config + your Cloudflare
account, not feature work. Both production builds are verified to bundle (see below).

## Progress survives redeploys (hard rule)

Player progression lives in **remote D1** (`metrophage`, id fixed in `server/wrangler.toml`).
`wrangler deploy` replaces Worker **code only** — it does **not** recreate D1 or wipe rows.

| Store | Survives `wrangler deploy`? | Notes |
| --- | --- | --- |
| D1 `players` + ledger | **Yes** | Source of truth for XP, credits, inventory, campaign, bridge |
| DO SQLite (zone metadata) | **Yes** if DO migration tag stays `v1` | Never add `deleted_classes` / new class renames lightly |
| In-memory zone state | No | ≤~1.2s dirty buffer; clients reconnect and reload from D1 |

**Always deploy with the progress guard:**

```sh
npm run deploy:safe          # server + client, fingerprint before/after
npm run deploy:safe:check    # dry-run fingerprint only
npm run migrations:safe      # scan SQL for DROP/DELETE wipe patterns
```

Never: `d1 create` a second prod db, `d1 delete`, `DELETE FROM players` on remote,
or point `database_id` at a new empty database.

### Auto-redeploy every 3h (after $METRO is live)

GitHub Actions schedule (`deploy.yml`) + local helper:

```sh
npm run deploy:auto   # no-ops until /metro/status reports live mint+settlement
```

Stop auto-redeploy: create `.metro-auto-redeploy.stop` in the repo root, or set
`METRO_AUTO_REDEPLOY=0`, or disable the workflow schedule.

## Fastest: ship single-player, no backend (others can play in ~2 min)

The single-player game (THE CITY hub + class runs + dives + customization) is **100%
client-side** — no server needed. If someone clicks ONLINE without a server configured, it
now shows a clear "SERVER OFFLINE — press ESC" message instead of hanging. The build uses
relative asset paths, so `dist/` runs from any host (domain root, a subpath, or an itch.io zip).

1. `npm run build` → portable `dist/`.
2. Host `dist/` on any static host:
   - **itch.io** (easiest public link): zip the *contents* of `dist/`, upload as an HTML
     game, tick "This file will be played in the browser".
   - **Cloudflare Pages**: `npx wrangler pages deploy dist`
   - **Netlify**: drag `dist/` onto the dashboard, or `npx netlify deploy --dir dist --prod`.
   - **Quick LAN share**: `npm run preview` (vite serves `dist/` on a `--host` URL).

That's a complete, shippable game on its own. Add the multiplayer server (below) when you
want ONLINE live.

## What's verified
- **Client build** (`npm run build`): ✓ 114 modules → `dist/` (index ~127 KB gzip + phaser
  ~340 KB gzip).
- **Worker bundle** (`wrangler deploy --dry-run`): ✓ ~202 KB gzip, bindings `WORLD` (DO) +
  `DB` (D1) resolved. (web3.js is lazy-imported so it stays off the game hot path.)
- **Load**: 30 concurrent players in one zone DO sustain ~18 Hz/player on a single local box
  (near the 20 Hz ideal), 0 drops. 50 in one zone stays up with 0 drops but the per-player
  rate falls — that's the local box (workerd + D1 + the test client share one CPU), and
  architecturally 50-in-one-DO is what zone-sharding avoids: players spread across districts
  (`d0..dN`), each its own isolate. See `server/scripts/smoke.mjs load <N>`.

## Deploy the server (needs a Cloudflare account + Workers paid plan for Durable Objects)
1. `cd server && npx wrangler login`
2. Create the D1 db and put its id in `wrangler.toml`:
   - `npx wrangler d1 create metrophage` → copy the printed `database_id`
   - replace `database_id = "local-placeholder-…"` in `server/wrangler.toml` with it
3. Apply migrations to the remote db: `npx wrangler d1 migrations apply metrophage --remote`
4. (Optional, $METRO devnet bridge) set secrets — leave **METRO_MAINNET_ARMED unset**
   (mainnet stays gated behind counsel):
   - `npx wrangler secret put METRO_TREASURY_SECRET` / `METRO_DEVNET_MINT` / `METRO_RPC`
5. `npx wrangler deploy` → note the deployed origin, e.g. `https://metrophage-server.<acct>.workers.dev`

## Deploy the client (any static host; Cloudflare Pages is easiest)
1. Build pointing at the deployed Worker (wss + `/ws`):
   - `VITE_SERVER_URL="wss://metrophage-server.<acct>.workers.dev/ws" npm run build`
   - (the client falls back to `ws://127.0.0.1:8787/ws` when the var is unset — local dev)
2. Host `dist/` (e.g. `npx wrangler pages deploy dist`), then open the page and click
   **GO ONLINE** — you land in the SAFEHOUSE hub.

## Ongoing verification (local)
`cd server && wrangler dev --port 8787`, then `node scripts/smoke.mjs <mode>`:
`move check mp combat quest territory zones social meltdown trade look bot abuse load metro
inventory lookpersist auth boss equip shop bestiary safehouse craft achv guild market daily
raid cosmetic`. Several pre-seed D1 (see each mode's header comment). Run modes singly —
a back-to-back sweep shows false fails from shared-DO/D1 state pollution; `raid`/`boss` want
a freshly-restarted server (a pristine, un-engaged boss).

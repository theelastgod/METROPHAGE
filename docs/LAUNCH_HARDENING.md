# Launch hardening & rollback

How we keep METROPHAGE live under stress and recover when something breaks.

**Scale / speed / reliability on Cloudflare:** see [`CLOUDFLARE_SCALE.md`](./CLOUDFLARE_SCALE.md) (pinned).

## Kill switches (no code change)

Set Cloudflare Worker vars (wrangler.toml `[vars]` or dashboard) and **redeploy**:

| Var | Effect when `=1` |
|-----|------------------|
| `METRO_DISABLE_MARKET` | Auction house offline |
| `METRO_DISABLE_CLAIM_GOAL` | Cell goal claims offline |
| `METRO_DISABLE_DISTRICT_WAR` | War capture bonuses off |

Capacity / anti-farm:

| Var | Default | Meaning |
|-----|---------|---------|
| `METRO_HUB_CAP` | 48 | Soft max concurrent in hub (`safe`); over → redirect to `d0` |
| `METRO_DAILY_EMIT_CAP` | 2500 | Max emit credits per player per UTC day |
| `METRO_BUILD` | string | Shown on `/health` for ops |

```sh
cd server
# example incident: freeze market
# edit wrangler.toml vars or:
npx wrangler deploy   # after setting METRO_DISABLE_MARKET=1 in [vars]
```

## Health & metrics

```sh
curl -sS https://metrophage-server.wendellphillips.workers.dev/health | jq .
curl -sS 'https://metrophage-server.wendellphillips.workers.dev/stats?zone=safe' | jq .
curl -sS 'https://metrophage-server.wendellphillips.workers.dev/economy' | jq .
```

`/health` includes: `build`, `flags`, sample zone player counts / tickMs / flood kills,
`economy` snapshot (emit/burn/sinkEfficiency7d), and `warnings` (e.g. `sink_efficiency_low`).

```sh
npm run watch:health:once    # single probe
npm run watch:health         # poll every 60s
```

## Smoke gates

### Local (server running)
```sh
npm run smoke:trusted          # move combat kit quest abuse
cd server && node scripts/smoke.mjs death
cd server && node scripts/smoke.mjs reconnect
cd server && node scripts/smoke.mjs stash
cd server && node scripts/smoke.mjs launch
cd server && npm run smoke:load
```

### Production (after every deploy)
```sh
cd server && npm run smoke:prod
# or:
WS_URL=wss://metrophage-server.wendellphillips.workers.dev/ws \
  node server/scripts/prod-smoke.mjs
```

Modes: `launch,move,combat,kit,quest,abuse,reconnect,stash,market` (override with `PROD_SMOKE_MODES`).

### CI
- Unit + typecheck + prod URL bake + **panel smoke hard-fail**
- Scheduled / manual `prod-smoke` workflow against live WSS

## Deploy order

1. Apply D1 migrations if any: `cd server && npm run migrate:remote`
2. Deploy Worker: `cd server && npm run deploy` → note **Version ID**
3. Run `npm run smoke:prod` (must pass)
4. Deploy client: `npm run deploy:client`
5. Hard-refresh browser; confirm Options build stamp

## Rollback

### Worker
Cloudflare dashboard → Workers → `metrophage-server` → Deployments → **Rollback** to last good Version ID  
or redeploy previous git tag:

```sh
git checkout <good-sha>
cd server && npx wrangler deploy
```

Record Version ID after each deploy (console output: `Current Version ID: …`).

### Pages (client)
Dashboard → Pages → `metrophagev1` → Deployments → **Retry / Rollback** previous deployment  
or redeploy:

```sh
git checkout <good-sha>
npm run deploy:client
```

### Emergency feature freeze
Set kill switch vars → `wrangler deploy` (server only; client can stay).

## Launch-day watch list

| Window | Check |
|--------|--------|
| T+0 | `/health` ok, sample zones not melting (tickMsAvg ≪ 50) |
| T+15m | `/economy` emit not exploding vs burn |
| T+1h | smoke:prod still green; no floodKill spike |
| T+24h | sink efficiency trending up; hub not stuck at cap forever |

## Soft capacity notes

- Stress is **per-zone DO**, not global N.
- Hub soft-cap redirects to `d0` — players still play.
- Daily emit cap stops farms; sinks still work after cap.

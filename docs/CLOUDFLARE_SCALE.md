# Cloudflare scale — faster & more reliable METROPHAGE server

Pinned ops guide. Stack: **Worker** (edge) + **per-zone Durable Objects** (20 Hz sim) + **D1** (ledger).

Related: `LAUNCH_HARDENING.md`, `SHIPPING.md`, `server/wrangler.toml`.

## Shipped hardening (implemented in code)

| Change | Effect |
|--------|--------|
| Snapshot stride steps down earlier (40+ players) | Keeps hub tickMs under budget under load |
| Roster embedded ~1 Hz | Cuts snapshot bytes on busy zones |
| Persist every ~1s + `persistInFlight` guard | Less progress loss; no stacked D1 flushes |
| Supervisor alarm 3s | Faster recovery after DO eviction |
| D1 `batch()` for stats / dailies / session_zone | Fewer round-trips |
| `/health` probes zones in parallel | Faster ops signal |
| Cron `*/5 * * * *` → reclaim expired cash-outs | Credits return without player traffic |
| **Zone instances** `zone` / `zone#N` + load-aware `/ws` | Horizontal scale for hub, districts, subway |
| Sticky `?inst=` + welcome.inst + rebalance redirect | Reconnect stays on shard; overflow re-picks |

---

## What you have now (and why it matters)

| Piece | Role | Why it matters for speed/reliability |
|--------|------|--------------------------------------|
| Front-door **Worker** | HTTP, WS upgrade, `/metro`, `/health` | Cheap edge routing |
| **WorldDO** (`idFromName(zone)`) | One authoritative sim per zone | Latency/correctness pin to *zone*, not player |
| **D1** | Credits, inventory, metro bridge, stats | Global ledger; not on the 20 Hz path if kept off-tick |
| **Alarm supervisor** | Resume after eviction | Correctness after CF recycles the isolate |
| **Snapshot stride** | Full 20 Hz ≤100 players/zone; down to 5 Hz under crush | Bandwidth + CPU under load (`server/src/snapshotPolicy.ts`) |
| **`METRO_HUB_CAP=48`** | Soft-cap hub, overflow to `d0` | Stops one social room from melting the tick |
| **Workers Paid** + **SQLite DO** + **smart placement** | `wrangler.toml` | Required headroom for live multiplayer |

Live scoreboard:

```sh
curl -sS https://metrophage-server.wendellphillips.workers.dev/health | jq .
curl -sS 'https://metrophage-server.wendellphillips.workers.dev/stats?zone=safe' | jq .
```

`/health` reports `plan`, per-zone `tickMsAvg`, `hubFull`, `floodKills`, economy warnings.

---

## Tier 1 — Highest leverage (do these first)

### 1. Watch the real bottlenecks every deploy

**SLOs that matter for this stack:**

| Signal | Healthy | Action |
|--------|---------|--------|
| `tickMsAvg` | **&lt; ~15–20 ms** (budget is 50 ms @ 20 Hz) | Profile step: AI, shots, AOI, snapshot build |
| `tickMsAvg` | **&gt; 40 ms** (health warning `tick_hot:*`) | Cap hub, raise snapshot stride earlier, split zone |
| `floodKills` rising | input spam | Client throttle + server drop |
| D1 timeouts on login/bridge | ledger pressure | Batch writes, fewer queries per request |
| WS disconnect spikes | eviction / blips | Hibernation hygiene + soft reconnect |

Wire Cloudflare **Workers analytics + Logpush** (or dashboard graphs) so you don’t only curl on bad days.

### 2. Never put D1 on the sim tick

Keep the 20 Hz loop pure: move, combat, AOI, broadcast.

- Persist is already ~every **24 ticks (~1.2 s)** — keep that pattern.
- **Batch** credit/stat flushes (`statDelta`, economy ledger).
- Prefer **one transaction** for multi-row player writes over N sequential D1 calls.
- Bridge (`/metro/*`) stays on the Worker + D1, **never** inside WorldDO tick.
- Avoid heavy aggregates (`COUNT(*)`) on hot paths — cache counters refreshed every N seconds.

### 3. Cap and shard zones before you “need” it

Single DO = single-threaded zone. Correct for authority; also the hard limit.

**Practical sharding:**

- Keep **`METRO_HUB_CAP`** real (48 is fine for social; lower if `safe` tick climbs).
- When a combat district is hot: **instance shards** (shipped)  
  `d0` (inst 0, legacy name), `d0#1`, `d0#2`… same grid, different DO names.
- **Load-based instance picker** on the front Worker (shipped)  
  `/ws?zone=d0` probes shard loads → picks least-loaded under soft cap;  
  `/ws?zone=d0&inst=2` sticky reconnect (honored under hard cap).  
  Env: `METRO_MAX_INSTANCES` (default 4), `METRO_INSTANCE_CAP` (default 40), hub uses `METRO_HUB_CAP`.

This is the #1 way to scale multiplayer on DOs without rewriting the game.

### 4. Shrink every snapshot byte

Compact remotes + AOI already help — push harder:

- Broadcast **deltas** when possible (HP/pos only); full state on join/interval.
- Never send wallet/inventory/campaign to remotes.
- Binary or packed coords if you outgrow JSON WS frames.
- If hubs grow past ~80, **start striding earlier** for *remotes only*; keep local prediction smooth.

### 5. WS hibernation discipline

Hibernatable sockets are correct for CF. Reliability wins:

- After wake, **rebind session → player** without full welcome thrash.
- Heartbeats so dead half-open clients don’t count toward hub cap.
- On DO eviction, **alarm resumes sim**; pending inputs must not double-apply after wake.

---

## Tier 2 — Cloudflare products for *this* game

| Product | Helps? | How for Metrophage |
|---------|--------|--------------------|
| **Workers Paid** | ✅ already | Keep it; free tier will choke 20 Hz multiplayer |
| **Smart Placement** | ✅ already on Worker | Helps HTTP `/metro`, `/identity`; **does not move the DO** to the player |
| **SQLite-backed DO** | ✅ already | Stay here; don’t go back to KV-only DO |
| **D1** | ✅ core ledger | Good for global economy; bad for per-tick state |
| **Hyperdrive** | ❌ skip unless Postgres | You’re on D1, not external SQL |
| **R2** | Maybe | Big logs, trailers, art — not game sim |
| **Queues** | Yes for reliability | Async: mail, leaderboard rebuild, economy rollups, analytics |
| **Cron Triggers** | Yes | Sweep expired claims, economy day roll, stale market (off player path) |
| **Workers Analytics Engine** | Yes | Cheap custom metrics: tickMs, snap bytes, zone pop |
| **DO location hints** | Advanced | Pin busy zones near clusters only after measuring |
| **Pages + Worker same account** | UX | Client near edge; sim still zone-pinned |

**Mental model:** Players near Tokyo can still talk to a US-east zone DO if that DO lives there. Smart Placement does not fix cross-ocean zone latency. **Sharding + “join nearest instance”** does.

---

## Tier 3 — Architecture when one DO per district is full

### A. Hub vs combat split (easy)

- `safe` / estates / social: lower tick or higher snapshot stride OK  
- `dN` combat: keep 20 Hz, hard cap concurrent, overflow instances  

### B. Front Worker as sticky router (medium)

```
Client → Worker (region) → pick instance by load → WorldDO
```

Router stores only: `zone → [instanceIds]`, player counts (from DO `/stats` cache every 2–5 s).  
Never put sim in the router.

### C. Write-behind + crash safety (medium)

- Tick state in DO memory  
- Checkpoint every 1–2 s  
- Critical money ops: **D1 first, then confirm** (bridge pattern)  
- Never “trust client then write D1 later” for credits  

### D. Separate economy Worker later (only if needed)

If `/metro` and leaderboard compete with WS CPU:

- `metrophage-world` — WS + DO only  
- `metrophage-ledger` — D1 bridge, identity, boards  

---

## Tier 4 — Reliability ops

See also `LAUNCH_HARDENING.md`.

1. **Every deploy:** `migrate:remote` → Worker deploy → **record Version ID** → `smoke:prod` → client  
2. **One-click rollback:** CF Deployments → previous Version ID  
3. **Kill switches:** `METRO_DISABLE_*`, hub cap — keep them tested  
4. **SLO alerts:** `degraded: true`, `tick_hot:*`, `hub_full`, D1 error rate  
5. **Load smoke before marketing spikes:** `server npm run smoke:load` + multi-client hub stress  

---

## What *not* to spend time on

- Leaving Cloudflare “for speed” — bottleneck is **zone DO work + snapshot size**  
- Adding Redis “because multiplayer” — DO *is* room authority  
- Turning off Paid / SQLite DO  
- Solana RPC on the tick loop — chain IO only on bridge endpoints  
- Raising tick past 20 Hz when snapshots/AOI are the limit  

---

## Concrete roadmap (ordered)

| Priority | Move | Outcome |
|----------|------|---------|
| **P0** | Alerts on `tickMsAvg`, hub full, deploy smoke | Catch pain before players |
| **P0** | Confirm D1 never blocks `step()` | Steady 20 Hz under load |
| **P1** | Zone **instances** when hub/d0 &gt; ~40–60 concurrent | **Shipped** — `zoneRouting` + sticky `?inst=` |
| **P1** | Tighter remote snapshots / earlier stride on hubs | Lower bandwidth & tick cost |
| **P2** | Queues + Cron for economy/market housekeeping | Fewer flaky login/bridge spikes |
| **P2** | Analytics Engine: snap bytes, flood kills, persist lag | Capacity planning |
| **P3** | Optional ledger/world Worker split | Isolate money API from combat |

---

## Bottom line

Configured like a serious CF multiplayer game (Paid + SQLite DO + smart placement + alarm-supervised 20 Hz).

- **Meaningful speed** = lower tick work + smaller snapshots + sharded hot zones  
- **Meaningful reliability** = D1 off the tick, checkpoints, kill switches, deploy smoke, one-click rollback  

**Instance sharding is live:** `server/src/zoneRouting.ts` + Worker `/ws` load pick + client sticky `sessionStorage` (`mp_inst_<zone>`). Ops: `GET /stats?zone=d0` aggregates all shards; `GET /stats?zone=d0&inst=1` probes one.

**Highest-ROI follow-ups:** party-sticky co-routing; Analytics Engine for `tickMs` / snap bytes; binary snapshots if hubs stay huge.

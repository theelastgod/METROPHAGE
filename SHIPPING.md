# Shipping METROPHAGE

Both halves are production-ready; each ships with one command once a Cloudflare
account is logged in (`npx wrangler login`).

> **Dry-run reverified (2026-07-12).** `wrangler deploy --dry-run` bundles the
> Worker clean (460 KiB gzip, both bindings resolve); migrations `0001–0030`
> apply cleanly to an isolated SQLite-backed D1; the 20-player load/reconnect gate
> and focused escrow crash proof pass; and the client production build contains
> the live Worker URL. No account-gated deployment was performed.

## 0. Production client safety, up front

The client's server URL comes from `VITE_SERVER_URL` **at build time**. If you
forget it, a production build now **fails**. Production builds also reject non-WSS
and localhost/loopback URLs. Development continues to fall back to
`ws://127.0.0.1:8787`; there is no runtime override.

## 1. Server — Cloudflare Worker + Durable Objects + D1

```sh
cd server
npx wrangler login                       # the one step only you can do
npx wrangler d1 create metrophage        # once — copy the id it prints
#   → paste that id into wrangler.toml [[d1_databases]] database_id
npm run migrate:remote                   # apply every pending migration to the real D1
npm run deploy                           # deploy the Worker (prints its URL)
```

Current head includes migrations through `0030_pvp_escrow.sql`. Migration `0030`
must land before its Worker code. For the first escrow rollout,
empty/disconnect THE CRUCIBLE arenas first: an in-memory pot created by an older
Worker cannot be retroactively journaled after the deploy.

The DO ships as `new_sqlite_classes` (see `wrangler.toml`) — SQLite-backed,
Cloudflare's recommended default. **Workers Paid ($5)** is recommended for live
multiplayer: higher CPU/DO request budget, smart placement, and looser snapshot
thresholds (full 20 Hz through ~100 players per zone). `METRO_PAID_TIER=1` is set
in wrangler `[vars]` for ops visibility (`/health` reports `plan`).

Optional (without these, the public $METRO bridge remains read-only and fails
closed; simulated mutation is available only through local `npm run dev:sim`):

```sh
# Solana is authoritative — prepare treasury first if you don't have one:
#   node scripts/mainnet-prepare.mjs
npx wrangler secret put METRO_TREASURY_SECRET   # base64 64-byte Solana keypair
npx wrangler secret put METRO_MINT              # base58 SPL mint (or METRO_DEVNET_MINT)
# METRO_RPC defaults to Solana devnet; METRO_SETTLEMENT=solana in wrangler.toml
```

## 2. Client — static Vite build (any static host / Cloudflare Pages)

For the deployed production endpoint, use the checked release helper from the repo
root. It sets the live WSS URL, builds, verifies that URL is present in `dist/`, and
then deploys only to Pages project `metrophagev1` on production branch `main`:

```sh
npm run build:production   # same verified build, but does not deploy
npm run deploy:client      # verified build + production Pages deploy
```

For another static host or Worker endpoint, a manual production build remains
available; the WSS URL is Step 1's Worker URL + `/ws` and is not optional:

```sh
VITE_SERVER_URL=wss://<worker-url>/ws npm run build
```

`VITE_METRO_MINT` additionally wakes the in-game $METRO bridge panel (leave unset
to ship pure off-chain). Dry-run confirmed: the injected URL lands in the bundle
and the localhost string that remains is an unreachable dead fallback.

## 3. Post-deploy sanity

```sh
curl https://<worker-url>/health                 # {"ok":true,...}
curl https://<worker-url>/metro/pool             # pool status (bootstrap at launch)
WS_URL=wss://<worker-url>/ws npm run smoke move  # authoritative movement round-trip
```

Launch reality encoded in the economy: the cash-out pool starts EMPTY (no dev
seeding is possible — fixed-supply pump.fun token) and fills from player deposits;
withdrawals are pool-capped, atomic, and refunded when uncovered. Mainnet-value
settlement additionally requires the `METRO_MAINNET_ARMED` switch — leave it off
until counsel signs off.

## 4. Solana launch economics (authoritative)

Player-funded $METRO pool on **Solana SPL**. Cash-outs prefer treasury-paid SOL:

| Cost                           | Who pays                                                            |
| ------------------------------ | ------------------------------------------------------------------- |
| Token / mint creation          | You (pump.fun / SPL mint)                                           |
| Treasury wallet                | free Solana keypair (`mainnet-prepare.mjs`)                         |
| Treasury token balance         | player deposits only                                                |
| Deposit network fees           | depositing player's wallet (SOL)                                    |
| Withdrawal / claim fees        | **treasury SOL** (preferred); player SOL only if treasury is dry    |
| Hosting                        | Cloudflare Workers/D1/DO (**Paid $5** recommended)                  |

Pending claims auto-refund after 10 minutes. Local accounting without chain:
`npm run dev:sim` + `node scripts/smoke.mjs metro`. Ordinary `npm run dev` keeps
simulated ledger mutations locked.

Robinhood/EVM is a **dormant alternate** only (`docs/METRO_CHAIN_CHOICE.md`,
`ROBINHOOD_GO_LIVE.md`) — not used for launch.

## 5. Entering the $METRO mint address (when the token is live)

**Full ordered checklist:** `docs/BRIDGE_GO_LIVE.md` (devnet rehearsal → mainnet arm).

**Authoritative path: Solana SPL** (base58 mint, Phantom). EVM remains in code for
optional restore via `METRO_SETTLEMENT=robinhood` — see `docs/METRO_CHAIN_CHOICE.md`.

| Network | RPC |
| --- | --- |
| Solana Devnet (rehearsal) | `https://api.devnet.solana.com` |
| Solana Mainnet | `https://api.mainnet-beta.solana.com` |

Two layers, **in this order**:

**Layer 1 — server secrets (FIRST):**

```sh
cd server
node scripts/mainnet-prepare.mjs   # if treasury not created yet
npx wrangler secret put METRO_TREASURY_SECRET   # base64 Solana keypair
npx wrangler secret put METRO_MINT              # base58 SPL mint
npx wrangler secret put METRO_RPC               # Solana RPC
# METRO_SETTLEMENT=solana is already in wrangler.toml [vars]
npm run deploy
```

Mainnet (counsel): Solana mainnet RPC + `METRO_MAINNET_ARMED=1`.

Treasury should keep a small **SOL float** for cash-out fees (+ ATA rent when a
player has never held $METRO). Deposits: players transfer SPL $METRO to the
treasury (base58). Cash-outs: Worker builds a treasury-paid transfer and preferably
broadcasts it; falls back to player-paid if SOL is empty.

**Layer 2 — client build env (SECOND):**

```sh
VITE_SERVER_URL=wss://<worker-url>/ws \
VITE_METRO_MINT=<base58 SPL mint> \
VITE_METRO_CLUSTER=devnet \
VITE_METRO_RPC=https://api.devnet.solana.com \
VITE_METRO_SETTLEMENT=solana \
npm run build
npx wrangler pages deploy dist --project-name=metrophagev1 --branch=main
```

Mainnet client: `VITE_METRO_CLUSTER=mainnet-beta` + `VITE_METRO_MAINNET_ARMED=1` + mainnet RPC/mint.

`VITE_METRO_MINT` is the master switch — set, the ◈ bridge panel appears;
unset, the game is pure off-chain ₵ (wallet login still works via Phantom).

**⚠️ Ordering rule:** never ship Layer 2 to real players without Layer 1. With
the panel live but no server secrets, the Worker fails closed: simulated
settlement is read-only and every deposit/cash-out returns 503. Secrets first,
CA second, always.

**Mainnet arming (counsel-gated):** real-value Solana mainnet requires
`VITE_METRO_CLUSTER=mainnet-beta` AND `VITE_METRO_MAINNET_ARMED=1` at client
build, plus server secret `METRO_MAINNET_ARMED=1`. Both stay off until counsel
signs off.

**Full mainnet runbook:** `MAINNET_GO_LIVE.md` / `docs/BRIDGE_GO_LIVE.md`.
Pre-CA: `cd server && node scripts/mainnet-prepare.mjs` then put
`METRO_TREASURY_SECRET`. When you have the mint: `node scripts/mainnet-arm.mjs <base58>`.

## 6. Ship checklist (every production deploy)

1. **Same commit** on Worker + Pages — geometry/protocol mismatches hurt.
2. **`npm run deploy:client`** for the live client. It fixes `VITE_SERVER_URL` to the
   production Worker, verifies the artifact, and fixes the Pages project/branch.
3. Manual deploys must still use
   `npx wrangler pages deploy dist --project-name=metrophagev1 --branch=main --commit-dirty=true`;
   omitting `--branch=main` creates a preview URL.
4. Protocol: welcome carries `protocol` (`PROTOCOL_VERSION` in `src/net/protocol.ts`).
   Stale clients print a hard-refresh sys warning — bump the constant when wire shape breaks.
5. Smoke (trusted five, standalone): `move combat kit quest abuse` with server up.
6. `$METRO`: Solana secrets **before** `VITE_METRO_MINT` (base58). Mainnet stays counsel-gated
   (`METRO_MAINNET_ARMED` off by default). Never arm without counsel sign-off.
7. Rates: **100 in / 125 out**, min **250 ₵**, player-funded pool (see `economyPolicy`) —
   treat as launch constants; don't redesign mid-launch without a migration note.
8. PvP escrow rollout: apply `0030` before the Worker and deploy with arenas empty.
   Afterward, buy-ins, elimination transfers, disconnect refunds, and crash recovery
   are atomic in D1.

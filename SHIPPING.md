# Shipping METROPHAGE

Both halves are production-ready; each ships with one command once a Cloudflare
account is logged in (`npx wrangler login`).

> **Dry-run verified (2026-07-07).** Everything below that does NOT need your
> Cloudflare account has been exercised: `wrangler deploy --dry-run` bundles the
> Worker clean (241 KiB gzip, both bindings resolve); the Durable Object is
> **SQLite-backed → free-tier eligible** (`$0` hosting, no plan upgrade prompt);
> all 21 migrations apply with none pending; the DO round-trips + persists under
> the SQLite backing (`smoke move`); and the client build injects the production
> server URL into the bundle. The only untested steps are the four account-gated
> commands below. Expect **no surprises**.

## 0. One footgun, up front

The client's server URL comes from `VITE_SERVER_URL` **at build time**. If you
forget it, the build silently falls back to `ws://127.0.0.1:8787` and *nobody can
connect*. Always set it (Step 2). There is no runtime override.

## 1. Server — Cloudflare Worker + Durable Objects + D1

```sh
cd server
npx wrangler login                       # the one step only you can do
npx wrangler d1 create metrophage        # once — copy the id it prints
#   → paste that id into wrangler.toml [[d1_databases]] database_id
npm run migrate:remote                   # apply migrations 0001–0021 to the real D1
npm run deploy                           # deploy the Worker (prints its URL)
```

The DO ships as `new_sqlite_classes` (see `wrangler.toml`) — SQLite-backed, which
is free-tier eligible and Cloudflare's recommended default. No Workers Paid plan
required. (It has never been deployed, so this was a free choice made at creation.)

Optional (the $METRO bridge stays in devnet-sim mode without these):

```sh
npx wrangler secret put METRO_TREASURY_SECRET   # base64 64-byte treasury keypair
npx wrangler secret put METRO_DEVNET_MINT       # the $METRO mint address
# METRO_RPC defaults to devnet; set it for a custom RPC
```

## 2. Client — static Vite build (any static host / Cloudflare Pages)

```sh
# from the repo root — the wss:// URL is Step 1's worker URL + /ws (NOT optional):
VITE_SERVER_URL=wss://<worker-url>/ws npm run build
npx wrangler pages deploy dist            # prints your public play URL
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

## 4. The $0 crypto launch

The developer's on-chain cost to run this economy is **zero**, by construction:

| Cost                           | Who pays                                                            |
| ------------------------------ | ------------------------------------------------------------------- |
| Token creation                 | pump.fun launch — no LP seeding; the bonding curve IS the liquidity |
| Treasury wallet                | a keypair — generating one is free                                  |
| Treasury token balance         | player deposits only (fixed supply, mint revoked — dev *can't* seed it) |
| Deposit network fees           | the depositing player's wallet (a plain transfer; the first send also creates the treasury's token account) |
| Withdrawal network fees + rent | the withdrawing player — withdrawals are **claims**: the server partially signs a payout tx whose fee payer is the player; the player's wallet submits it (≈0.000005 SOL + their own token-account rent) |
| Hosting                        | Cloudflare Workers/D1/DO **free tier** (SQLite-backed DO); public Solana RPC |

The treasury **never holds or spends SOL** — it only signs. Claims a player never
submits auto-refund after 10 minutes (far beyond blockhash validity, so an expired
claim can never land later and double-pay). The whole flow verifies with no chain
at all: `node scripts/smoke.mjs metro` (devnet-sim settlement).

## 5. Entering the $METRO contract address (when the token is live)

Two layers, **in this order**:

**Layer 1 — server secrets (FIRST):**

```sh
cd server
npx wrangler secret put METRO_DEVNET_MINT      # paste the CA
npx wrangler secret put METRO_TREASURY_SECRET  # base64 64-byte treasury keypair
npx wrangler secret put METRO_RPC              # RPC for the token's cluster
npm run deploy                                 # redeploy so secrets take effect
```

The treasury keypair receives deposits + signs claims (it never needs SOL).
Devnet rehearsal: `node scripts/devnet-setup.mjs` generates one and prints the
env lines. Real launch: generate a FRESH keypair, never reuse devnet's — it
custodies every player deposit. `/metro/pool` publishes its public address.

**Layer 2 — client build env (SECOND):**

```sh
VITE_SERVER_URL=wss://<worker-url>/ws VITE_METRO_MINT=<the CA> npm run build
npx wrangler pages deploy dist
```

`VITE_METRO_MINT` is the master switch — set, the ◈ bridge panel appears;
unset, the game is pure off-chain. Build-time only: entering the CA = rebuild +
redeploy the client.

**⚠️ Ordering rule:** never ship Layer 2 to real players without Layer 1. With
the panel live but no server secrets, the bridge runs devnet-sim settlement,
which TRUSTS claimed deposit amounts — a player could fabricate deposits.
Secrets first, CA second, always.

**Mainnet arming (counsel-gated):** real-value mainnet additionally requires
`VITE_METRO_CLUSTER=mainnet-beta` AND `VITE_METRO_MAINNET_ARMED=1` at client
build, plus server secret `METRO_MAINNET_ARMED=1`. Both stay off until counsel
signs off; nothing arms by accident.

**Full mainnet runbook (including pre-CA treasury prep):** see `MAINNET_GO_LIVE.md`.
Pre-CA: `cd server && node scripts/mainnet-prepare.mjs` then put
`METRO_TREASURY_SECRET`. When you have the mint: `node scripts/mainnet-arm.mjs <CA>`.

## 6. Ship checklist (every production deploy)

1. **Same commit** on Worker + Pages — geometry/protocol mismatches hurt.
2. **`VITE_SERVER_URL=wss://…/ws`** on the client build (never forget — silent localhost).
3. **`npx wrangler pages deploy … --branch=main`** (else you get a preview URL).
4. Protocol: welcome carries `protocol` (`PROTOCOL_VERSION` in `src/net/protocol.ts`).
   Stale clients print a hard-refresh sys warning — bump the constant when wire shape breaks.
5. Smoke (trusted five, standalone): `move combat kit quest abuse` with server up.
6. `$METRO`: secrets **before** `VITE_METRO_MINT`. Mainnet stays counsel-gated
   (`METRO_MAINNET_ARMED` off by default). Never arm without counsel sign-off.
7. Rates 110/125 and player-funded pool are **frozen** — do not redesign mid-launch.

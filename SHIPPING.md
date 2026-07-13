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

The DO ships as `new_sqlite_classes` (see `wrangler.toml`) — SQLite-backed, which
is free-tier eligible and Cloudflare's recommended default. No Workers Paid plan
required. (It has never been deployed, so this was a free choice made at creation.)

Optional (without these, the public $METRO bridge remains read-only and fails
closed; simulated mutation is available only through local `npm run dev:sim`):

```sh
npx wrangler secret put METRO_TREASURY_SECRET   # base64 64-byte treasury keypair
npx wrangler secret put METRO_DEVNET_MINT       # the $METRO mint address
# METRO_RPC defaults to devnet; set it for a custom RPC
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

## 4. The low-cost Robinhood crypto launch

The bridge is still player-funded for $METRO liquidity, but Robinhood/EVM cash-outs
require a small treasury ETH balance for gas:

| Cost                           | Who pays                                                            |
| ------------------------------ | ------------------------------------------------------------------- |
| Token creation                 | ERC-20 deployer on Robinhood Chain                                  |
| Treasury wallet                | a keypair — generating one is free                                  |
| Treasury token balance         | player deposits only (fixed supply, mint revoked — dev *can't* seed it) |
| Deposit network fees           | the depositing player's wallet                                      |
| Withdrawal gas                 | treasury ETH float on Robinhood Chain                               |
| Hosting                        | Cloudflare Workers/D1/DO **free tier** (SQLite-backed DO); public Robinhood RPC |

The treasury never holds or spends SOL on the Robinhood path. It does need a
small ETH gas float before cash-outs can succeed. Pending claims auto-refund
after 10 minutes; the whole accounting flow still verifies with no chain at all:
`npm run dev:sim` followed by `node scripts/smoke.mjs metro` (trusted local sim
settlement). Ordinary `npm run dev` keeps simulated ledger mutations locked.

## 5. Entering the $METRO contract address (when the token is live)

**Full ordered checklist:** `docs/BRIDGE_GO_LIVE.md` (testnet rehearsal → mainnet arm → monitor).

Preferred chain: **Robinhood Chain** (ETH L2 / Arbitrum Orbit) ERC-20.

| Network | Chain ID | RPC |
| --- | --- | --- |
| Robinhood Chain Testnet (default) | **46630** | `https://rpc.testnet.chain.robinhood.com` |
| Robinhood Chain Mainnet | **4663** | `https://rpc.mainnet.chain.robinhood.com` |

MetaMask is prompted to add/switch to this network on sign-up. Legacy Solana SPL
still works if the mint is base58.

Two layers, **in this order**:

**Layer 1 — server secrets (FIRST):**

```sh
cd server
# Robinhood Chain testnet (rehearsal)
npx wrangler secret put METRO_MINT              # ERC-20 0x… deployed on Robinhood Chain
npx wrangler secret put METRO_TREASURY_SECRET   # treasury private key 0x… (hex)
npx wrangler secret put METRO_RPC               # https://rpc.testnet.chain.robinhood.com
npx wrangler secret put METRO_CHAIN_ID          # 46630
npm run deploy
```

Mainnet (counsel): `METRO_CHAIN_ID=4663`, mainnet RPC, then `METRO_MAINNET_ARMED=1`.

Treasury needs the ERC-20 + a **small ETH balance on Robinhood Chain** for gas.
Deposits: players transfer ERC-20 to `/metro/pool` treasury address.

**Layer 2 — client build env (SECOND):**

```sh
VITE_SERVER_URL=wss://<worker-url>/ws \
VITE_METRO_MINT=<0x ERC-20 on Robinhood Chain> \
VITE_METRO_CLUSTER=robinhood-testnet \
VITE_METRO_RPC=https://rpc.testnet.chain.robinhood.com \
VITE_METRO_CHAIN_ID=46630 \
npm run build
npx wrangler pages deploy dist --project-name=metrophagev1 --branch=main
```

Mainnet client: `VITE_METRO_CLUSTER=robinhood` + `VITE_METRO_MAINNET_ARMED=1` + mainnet RPC/CA.

`VITE_METRO_MINT` is the master switch — set, the ◈ bridge panel appears;
unset, the game is pure off-chain (MetaMask sign-up still uses Robinhood Chain).

**⚠️ Ordering rule:** never ship Layer 2 to real players without Layer 1. With
the panel live but no server secrets, the Worker now fails closed: simulated
settlement is read-only and every deposit/cash-out returns 503. That prevents
fabricated credits, but still ships a visibly broken money panel. Secrets first,
CA second, always.

**Mainnet arming (counsel-gated):** real-value Robinhood mainnet additionally
requires `VITE_METRO_CLUSTER=robinhood` AND `VITE_METRO_MAINNET_ARMED=1` at
client build, plus server secret `METRO_MAINNET_ARMED=1`. Both stay off until
counsel signs off; nothing arms by accident.

**Full mainnet runbook (including pre-CA treasury prep):** see `MAINNET_GO_LIVE.md`.
Pre-CA: `cd server && node scripts/mainnet-prepare.mjs` then put
`METRO_TREASURY_SECRET`. When you have the mint: `node scripts/mainnet-arm.mjs <CA>`.

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
6. `$METRO`: secrets **before** `VITE_METRO_MINT`. Mainnet stays counsel-gated
   (`METRO_MAINNET_ARMED` off by default). Never arm without counsel sign-off.
7. Rates (Robinhood launch): **100 in / 125 out**, min **250 ₵**, daily cap **50k ₵**,
   player-funded pool — treat as launch constants; don't redesign mid-launch without a migration note.
8. PvP escrow rollout: apply `0030` before the Worker and deploy with arenas empty.
   Afterward, buy-ins, elimination transfers, disconnect refunds, and crash recovery
   are atomic in D1.

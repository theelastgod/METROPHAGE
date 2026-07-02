# Shipping METROPHAGE

Both halves are production-ready; each ships with one command once a Cloudflare
account is logged in (`npx wrangler login`).

## 1. Server — Cloudflare Worker + Durable Objects + D1

```sh
cd server
npx wrangler d1 create metrophage        # once — copy the id it prints
#   → paste that id into wrangler.toml [[d1_databases]] database_id
npm run migrate:remote                   # apply migrations 0001–0021 to the real D1
npm run deploy                           # deploy the Worker (prints its URL)
```

Optional (the $METRO bridge stays in devnet-sim mode without these):

```sh
npx wrangler secret put METRO_TREASURY_SECRET   # base64 64-byte treasury keypair
npx wrangler secret put METRO_DEVNET_MINT       # the $METRO mint address
# METRO_RPC defaults to devnet; set it for a custom RPC
```

## 2. Client — static Vite build (any static host / Cloudflare Pages)

```sh
VITE_SERVER_URL=wss://<worker-url>/ws npm run build   # from the repo root
# deploy dist/ — e.g.: npx wrangler pages deploy dist
```

`VITE_METRO_MINT` additionally wakes the in-game $METRO bridge panel (leave unset
to ship pure off-chain).

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
| Hosting                        | Cloudflare Workers/D1 free tier; public Solana RPC                  |

The treasury **never holds or spends SOL** — it only signs. Claims a player never
submits auto-refund after 10 minutes (far beyond blockhash validity, so an expired
claim can never land later and double-pay). The whole flow verifies with no chain
at all: `node scripts/smoke.mjs metro` (devnet-sim settlement).

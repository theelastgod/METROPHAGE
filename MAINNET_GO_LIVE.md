# $METRO Mainnet Go-Live (Robinhood Chain)

> **Canonical ordered checklist:** [`docs/BRIDGE_GO_LIVE.md`](./docs/BRIDGE_GO_LIVE.md)

**Authoritative path: Robinhood Chain ERC-20** (MetaMask / WalletConnect, 0x mint,
chain id 4663).
The Solana SPL version is a **separate branch** (`settlement/solana`) and is not
compiled into this build. Do not use it for launch.

## Invariants

| Rule | Why |
|------|-----|
| Server secrets before client CA | A live panel without real settlement must never trust client amounts |
| `METRO_MAINNET_ARMED` is counsel-gated | Real-value mainnet cannot arm by accident |
| Treasury is an EVM 0x address | ERC-20 deposits + treasury-signed withdraws |
| Treasury pays gas on cash-outs | Keep a small native-gas float for withdraw transactions |
| Pool is player-funded | Deposits fill the pool; withdrawals cannot exceed it |
| Rates stay 100 in / 150 out, min 300 ₵, no daily cap | Launch economics (see `economyPolicy`) |

## 1. Pre-CA Readiness

```sh
cd server
node scripts/mainnet-prepare.mjs --evm
```

Creates gitignored:

- `server/.mainnet-treasury.json`

Fields:

- `treasuryAddress` — 0x deposit address on Robinhood Chain
- `treasurySecret` — 0x private key for Cloudflare
- `mint: null` — filled later by `mainnet-arm.mjs`
- `mainnetArmed: false`

Install the treasury secret on Cloudflare **before** the CA exists:

```sh
cd server
node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('.mainnet-treasury.json','utf8')).treasurySecret)" \
  | npx wrangler secret put METRO_TREASURY_SECRET
npx wrangler deploy
```

Do **not** set `METRO_MINT`, `VITE_METRO_MINT`, or either mainnet arm flag yet.

## 2. When You Have The Robinhood ERC-20 CA

```sh
cd server
node scripts/mainnet-arm.mjs <0x_MINT>
```

Prints exact Cloudflare + client commands using:

- `METRO_MINT=<0x…>`
- `METRO_RPC=https://rpc.mainnet.chain.robinhood.com`
- `METRO_CHAIN_ID=4663`
- `METRO_SETTLEMENT=robinhood`
- `VITE_METRO_CLUSTER=robinhood`

Run **server** commands first (secrets, migrations, Worker deploy), then client build.

## 3. Counsel Arm

Only after legal sign-off:

```sh
cd server
echo -n '1' | npx wrangler secret put METRO_MAINNET_ARMED
npx wrangler deploy
```

Rebuild client with `VITE_METRO_MAINNET_ARMED=1`.

## Solana version (separate branch, not launch)

```sh
git checkout settlement/solana
# then follow MAINNET_GO_LIVE.md on that branch (SPL keypair + base58 mint)
```

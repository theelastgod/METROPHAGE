# $METRO Mainnet Go-Live (Solana)

> **Canonical ordered checklist:** [`docs/BRIDGE_GO_LIVE.md`](./docs/BRIDGE_GO_LIVE.md)

**Authoritative path: Solana SPL** (Phantom, base58 mint).  
Robinhood/EVM adapters remain in the repo as a **dormant alternate** only
(`METRO_SETTLEMENT=robinhood` + `--evm` prepare scripts). Do not use them for launch.

## Invariants

| Rule | Why |
|------|-----|
| Server secrets before client CA | A live panel without real settlement must never trust client amounts |
| `METRO_MAINNET_ARMED` is counsel-gated | Real-value mainnet cannot arm by accident |
| Treasury is Solana base58 | SPL deposits + claim withdraws |
| Treasury pays SOL on cash-outs | Keep a small SOL float for withdraw fees + player ATA rent |
| Pool is player-funded | Deposits fill the pool; withdrawals cannot exceed it |
| Rates stay 100 in / 150 out, min 300 ₵, no daily cap | Launch economics (see `economyPolicy`) |

## 1. Pre-CA Readiness

```sh
cd server
node scripts/mainnet-prepare.mjs
```

Creates gitignored:

- `server/.mainnet-treasury.json`
- `server/.solana-treasury.json`

Fields:

- `treasuryAddress` / `treasuryPubkey` — Solana deposit address
- `treasurySecret` — base64 64-byte keypair for Cloudflare
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

## 2. When You Have The Solana Mint CA

```sh
cd server
node scripts/mainnet-arm.mjs <base58_MINT>
```

Prints exact Cloudflare + client commands using:

- `METRO_MINT=<base58>`
- `METRO_RPC=https://api.mainnet-beta.solana.com`
- `METRO_SETTLEMENT=solana`
- `VITE_METRO_CLUSTER=mainnet-beta`

Run **server** commands first (secrets, migrations, Worker deploy), then client build.

## 3. Counsel Arm

Only after legal sign-off:

```sh
cd server
echo -n '1' | npx wrangler secret put METRO_MAINNET_ARMED
npx wrangler deploy
```

Rebuild client with `VITE_METRO_MAINNET_ARMED=1`.

## Dormant EVM alternate (not launch)

```sh
node scripts/mainnet-prepare.mjs --evm --replace
node scripts/mainnet-arm.mjs <0x_CA> --evm
# then set METRO_SETTLEMENT=robinhood + EVM secrets
```

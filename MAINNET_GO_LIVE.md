# $METRO Mainnet Go-Live

> **Canonical ordered checklist:** [`docs/BRIDGE_GO_LIVE.md`](./docs/BRIDGE_GO_LIVE.md)

Current launch path: **Robinhood Chain mainnet** (`chainId=4663`) with an
ERC-20 `0x...` contract address.

## Invariants

| Rule | Why |
|------|-----|
| Server secrets before client CA | A live panel without real settlement must never trust client amounts |
| `METRO_MAINNET_ARMED` is counsel-gated | Real-value mainnet cannot arm by accident |
| Treasury is EVM `0x...` | Robinhood Chain settlement uses ERC-20 transfers |
| Treasury needs ETH for gas | EVM cash-outs are treasury-signed ERC-20 transfers |
| Pool is player-funded | Deposits fill the pool; withdrawals cannot exceed it |
| Rates stay 100 in / 125 out | Launch economics: min `250 ₵`, daily cap `50k ₵` |

## 1. Pre-CA Readiness

```sh
cd server
node scripts/mainnet-prepare.mjs
```

This creates or reuses gitignored `server/.mainnet-treasury.json`:

- `treasuryAddress` — public Robinhood Chain deposit / payout address
- `treasurySecret` — private EVM key for Cloudflare secret storage
- `mint: null` — filled later by `mainnet-arm.mjs`
- `mainnetArmed: false` — remains false until counsel sign-off

If an old Solana treasury file is present, the script refuses to overwrite it
unless run with `--replace-legacy`.

Install the treasury secret on Cloudflare before the CA exists:

```sh
cd server
node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('.mainnet-treasury.json','utf8')).treasurySecret)" \
  | npx wrangler secret put METRO_TREASURY_SECRET
npx wrangler deploy
```

Do **not** set `METRO_MINT`, `VITE_METRO_MINT`, or either mainnet arm flag yet.

## 2. When You Have The CA

```sh
cd server
node scripts/mainnet-arm.mjs <0x_CA>
```

The helper records the CA locally and prints the exact Cloudflare + client build
commands. It uses:

- `METRO_MINT=<0x_CA>`
- `METRO_RPC=https://rpc.mainnet.chain.robinhood.com`
- `METRO_CHAIN_ID=4663`
- `VITE_METRO_CLUSTER=robinhood`

Run the printed **server** commands first, including the remote D1 migrations and
Worker deploy. Only then run the printed **client** build and Pages deploy.

## 3. Counsel Arm

Only after legal sign-off:

```sh
cd server
echo -n '1' | npx wrangler secret put METRO_MAINNET_ARMED
npx wrangler deploy
```

Then rebuild the client with all CA flags plus:

```sh
VITE_METRO_MAINNET_ARMED=1
```

Without both server and client arm flags, mainnet-value settlement stays locked.

## 4. Verify

```sh
curl -s https://metrophage-server.wendellphillips.workers.dev/metro/status
curl -s https://metrophage-server.wendellphillips.workers.dev/metro/pool
```

Expected after CA + server deploy:

- `mintConfigured: true`
- `treasuryConfigured: true`
- `chain: "robinhood"`
- `chainId: 4663`
- `settlement: "evm"` after `METRO_MAINNET_ARMED=1`
- no `dangerousSim`

Before cash-outs, fund the treasury address with a small ETH balance on
Robinhood Chain for gas. The $METRO pool itself fills from player deposits.

## 5. Player Flow

1. Connect MetaMask on Robinhood Chain.
2. Deposit $METRO ERC-20 to the treasury through the in-game panel.
3. Claim the deposit; server verifies on-chain logs and grants credits.
4. Withdraw credits; server signs an ERC-20 payout and verifies the transaction.

## Safety Reminders

- Never ship `VITE_METRO_MINT` before Worker secrets are deployed.
- Never set `METRO_ALLOW_SIM=1` in production.
- Never arm mainnet without counsel sign-off.
- Keep `server/.mainnet-treasury.json` backed up offline and never commit it.

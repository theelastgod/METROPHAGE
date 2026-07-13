# Live $METRO bridge — go-live checklist

Single ordered checklist for turning on the player-funded cash-out bridge.
Follow **top to bottom**. Do not skip the server-before-client rule.

Related docs: `MAINNET_GO_LIVE.md`, `ROBINHOOD_GO_LIVE.md`, `SHIPPING.md` §5.

---

## Invariants (never violate)

| Rule | Why |
|------|-----|
| **Server secrets before client mint** | Client mint without live settlement lets the sim path look “ready” while still locked — or worse if misconfigured |
| **Player-funded pool only** | Deposits fill cash-outs; empty pool = honest reject + refund |
| **Rates stay 100 in / 125 out** | Min **250 ₵**, daily cap **50k ₵** (see `server/src/metro.ts` `BRIDGE`) |
| **`METRO_MAINNET_ARMED` is counsel-gated** | Real-value mainnet cannot arm by accident |
| **Treasury never spends SOL** | EVM path needs a small **ETH** gas float; Solana claims are player fee-payer |

---

## Phase 0 — Preflight (any time)

```sh
cd server
npx wrangler whoami
curl -sS https://metrophage-server.wendellphillips.workers.dev/health
curl -sS https://metrophage-server.wendellphillips.workers.dev/metro/pool | jq .
```

Expect: `health.ok`, pool `settlement` / `simLocked` / `treasuryConfigured` readable.
Note `readyForCa: true` means treasury secret is set but **mint is not**.

Local proofs:

```sh
# from repo root, local wrangler up
npm run smoke:trusted
cd server && npm run smoke:pvp-escrow
```

---

## Phase 1 — Treasury (before CA)

```sh
cd server
node scripts/mainnet-prepare.mjs
# → server/.mainnet-treasury.json  (gitignored)

node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('.mainnet-treasury.json','utf8')).treasurySecret)" \
  | npx wrangler secret put METRO_TREASURY_SECRET

npx wrangler deploy
curl -sS https://metrophage-server.wendellphillips.workers.dev/metro/pool | jq '{treasury, treasuryConfigured, readyForCa, settlement, simLocked}'
```

- [ ] Treasury address recorded  
- [ ] Secret on Worker  
- [ ] **Do not** set `METRO_MINT` / `VITE_METRO_MINT` yet  

---

## Phase 2 — Testnet rehearsal (recommended)

Deploy ERC-20 on **Robinhood Chain Testnet** (`46630`), then:

```sh
cd server
# secrets (testnet)
npx wrangler secret put METRO_MINT          # 0x… testnet
npx wrangler secret put METRO_RPC           # https://rpc.testnet.chain.robinhood.com
npx wrangler secret put METRO_CHAIN_ID      # 46630
# METRO_MAINNET_ARMED stays unset / 0
npx wrangler d1 migrations apply metrophage --remote
npx wrangler deploy
```

Client (testnet):

```sh
# from repo root
VITE_SERVER_URL=wss://metrophage-server.wendellphillips.workers.dev/ws \
VITE_METRO_MINT=<0x testnet CA> \
VITE_METRO_CLUSTER=robinhood-testnet \
VITE_METRO_RPC=https://rpc.testnet.chain.robinhood.com \
VITE_METRO_CHAIN_ID=46630 \
npm run build

npx wrangler pages deploy dist --project-name=metrophagev1 --branch=main --commit-dirty=true
```

Manual QA:

- [ ] MetaMask adds/switches to Robinhood testnet  
- [ ] Deposit small amount → credits grant once; re-claim same tx fails  
- [ ] Withdraw min **250 ₵** → claim tx → confirm  
- [ ] Empty / short pool returns honest error, credits refunded on TTL  
- [ ] `/metro/pool` shows `settlement: "evm"`, `liveBridge: true`, `simLocked: false`  
- [ ] Treasury has test ETH for gas + token balance after deposits  

---

## Phase 3 — Mainnet CA (counsel-gated)

1. Deploy fixed-supply ERC-20 on **Robinhood Chain mainnet** (`4663`).  
2. Record CA:

```sh
cd server
node scripts/mainnet-arm.mjs <0x_CA>
# prints exact secret put + deploy commands — run SERVER first
```

Server:

```sh
npx wrangler secret put METRO_MINT          # 0x mainnet CA
npx wrangler secret put METRO_RPC           # https://rpc.mainnet.chain.robinhood.com
npx wrangler secret put METRO_CHAIN_ID      # 4663
# still NOT METRO_MAINNET_ARMED
npx wrangler deploy
```

Client **without** mainnet arm (settlement still sim-locked for value mainnet until arm):

Only rebuild with mint after secrets are live. Prefer keeping panel off until arm if you want zero confusion.

3. Fund treasury with **mainnet ETH** (gas) — token pool fills only from player deposits.

4. Counsel sign-off, then:

```sh
echo -n '1' | npx wrangler secret put METRO_MAINNET_ARMED
npx wrangler deploy
```

Client mainnet build:

```sh
VITE_SERVER_URL=wss://metrophage-server.wendellphillips.workers.dev/ws \
VITE_METRO_MINT=<0x mainnet CA> \
VITE_METRO_CLUSTER=robinhood \
VITE_METRO_RPC=https://rpc.mainnet.chain.robinhood.com \
VITE_METRO_CHAIN_ID=4663 \
VITE_METRO_MAINNET_ARMED=1 \
npm run deploy:client
# or release-client.mjs after setting env in the shell
```

---

## Phase 4 — Post go-live monitoring

```sh
curl -sS https://metrophage-server.wendellphillips.workers.dev/metro/pool | jq .
curl -sS https://metrophage-server.wendellphillips.workers.dev/economy | jq .
curl -sS https://metrophage-server.wendellphillips.workers.dev/stats?zone=d0 | jq .
```

Watch:

| Signal | Action |
|--------|--------|
| `phase: "bootstrap"` | Pool < min cash-out — expected early |
| `treasuryEth` low / `treasuryWarn` | Refill ETH gas float |
| `coverageRatio` low | Emissions >> deposits — sinks / caps / messaging |
| `daysUntilDry` | EWMA forecast; consider wider spread or sink if chronic |
| Failed withdraws / support | Confirm reclaim TTL + refund path |

Hard refresh clients after every production Pages deploy (protocol bumps).

---

## Rollback

1. Unset client mint (rebuild without `VITE_METRO_MINT`) — panel hides.  
2. Server: remove or blank `METRO_MINT` secret + deploy → sim + lock.  
3. Do **not** lower `METRO_MAINNET_ARMED` after real value moved without counsel.

---

## Done when

- [ ] Testnet deposit + withdraw round-trip proven  
- [ ] Mainnet secrets live **before** client mint  
- [ ] Counsel armed both server + client flags  
- [ ] Pool bootstrap messaging understood by ops  
- [ ] Health + economy endpoints green after deploy  

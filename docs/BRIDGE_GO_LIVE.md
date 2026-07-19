# Live $METRO bridge — go-live checklist (Robinhood Chain)

Single ordered checklist for turning on the player-funded cash-out bridge.
**Robinhood Chain ERC-20 is authoritative.** Follow **top to bottom**.

Related docs: `MAINNET_GO_LIVE.md`, `METRO_CHAIN_CHOICE.md`, `SHIPPING.md`, `ROBINHOOD_GO_LIVE.md`.

---

## Invariants (never violate)

| Rule | Why |
|------|-----|
| **Server secrets before client mint** | Client mint without live settlement is dangerous |
| **Player-funded pool only** | Deposits fill cash-outs; empty pool = “Check back later.” |
| **EVM treasury** | 0x private key; address is 0x on Robinhood Chain |
| **Treasury pays gas on cash-outs** | Keep a small native-gas float funded; deposits stay player-paid |
| **`METRO_MAINNET_ARMED` is counsel-gated** | Real-value mainnet cannot arm by accident |

---

## Phase 0 — Preflight

```sh
cd server
npx wrangler whoami
curl -sS https://metrophage-server.wendellphillips.workers.dev/health
curl -sS https://metrophage-server.wendellphillips.workers.dev/metro/pool | jq '{settlement,family,treasury,treasuryChain,readyForCa}'
```

Expect: `treasuryChain: "robinhood"` once the EVM secret is installed.

---

## Phase 1 — EVM treasury (before CA)

```sh
cd server
node scripts/mainnet-prepare.mjs --evm
# → .mainnet-treasury.json (gitignored)

node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('.mainnet-treasury.json','utf8')).treasurySecret)" \
  | npx wrangler secret put METRO_TREASURY_SECRET

npx wrangler deploy
curl -sS https://metrophage-server.wendellphillips.workers.dev/metro/pool \
  | jq '{treasury, treasuryChain, treasuryConfigured, readyForCa, family}'
```

- [ ] EVM treasury address recorded  
- [ ] Secret on Worker (`METRO_TREASURY_SECRET` 0x private key)  
- [ ] **Do not** set `METRO_MINT` / `VITE_METRO_MINT` yet  

---

## Phase 2 — Testnet rehearsal (recommended)

Deploy a throwaway ERC-20 on Robinhood testnet (chain id 46630), then:

```sh
cd server
npx wrangler secret put METRO_MINT          # 0x testnet contract
npx wrangler secret put METRO_RPC           # https://rpc.testnet.chain.robinhood.com
npx wrangler secret put METRO_CHAIN_ID      # 46630
# METRO_SETTLEMENT=robinhood already in wrangler.toml
# METRO_MAINNET_ARMED stays unset
npx wrangler d1 migrations apply metrophage --remote
npx wrangler deploy
```

Client:

```sh
VITE_METRO_MINT=<0x_contract> \
VITE_METRO_CLUSTER=robinhood-testnet \
VITE_METRO_RPC=https://rpc.testnet.chain.robinhood.com \
VITE_METRO_CHAIN_ID=46630 \
VITE_METRO_SETTLEMENT=robinhood \
npm run deploy:client
```

Smoke: MetaMask connect → auto-add Robinhood Chain → Send ERC-20 to treasury → Claim deposit → Withdraw claim.

---

## Phase 3 — Mainnet mint CA

```sh
cd server
node scripts/mainnet-arm.mjs <0x_CA>
# follow printed server secrets + deploy, then client build
```

Counsel only: `METRO_MAINNET_ARMED=1` + `VITE_METRO_MAINNET_ARMED=1`.

---

## Dormant Solana alternate

Not the launch path. To restore SPL:

```sh
node scripts/mainnet-prepare.mjs --replace          # no --evm → Solana keypair
node scripts/mainnet-arm.mjs <base58_MINT> --solana
# METRO_SETTLEMENT=solana + SPL secrets
```

See `docs/METRO_CHAIN_CHOICE.md`.

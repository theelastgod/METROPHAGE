# $METRO chain choice — Solana (primary) vs Robinhood (legacy)

**Solana SPL is the active launch path.** Robinhood ERC-20 remains implemented as
legacy. The live path is chosen by the **mint / contract address (CA)** (or an
explicit force env). Until you have a CA, the game stays **credits-only**.

| Family | Mint shape | Wallet | Server adapter | Client cluster |
|--------|------------|--------|----------------|----------------|
| **Solana** (primary) | base58 pubkey (~32–44 chars) | Phantom / Solana | `server/src/solana.ts` | `VITE_METRO_CLUSTER=devnet` or `mainnet-beta` |
| **Robinhood Chain** (legacy) | `0x` + 40 hex | MetaMask | `server/src/evm.ts` | `VITE_METRO_CLUSTER=robinhood` or `robinhood-testnet` |

Shared ledger (always): server `credits` + D1 `metro_*` tables.  
Rates: **1 $METRO deposit → 100 ₵**, **125 ₵ → 1 $METRO** withdraw (see `BRIDGE` in `server/src/metro.ts`).

---

## When you get the CA

### A) CA is on Robinhood (`0x…`)

```sh
# server
npx wrangler secret put METRO_MINT              # 0x…
npx wrangler secret put METRO_TREASURY_SECRET   # 0x treasury private key
npx wrangler secret put METRO_RPC               # RH testnet or mainnet RPC
npx wrangler secret put METRO_CHAIN_ID          # 46630 testnet | 4663 mainnet
# optional force (usually auto from 0x shape):
# npx wrangler secret put METRO_SETTLEMENT      # robinhood
npx wrangler deploy

# client build
VITE_METRO_MINT=0x… \
VITE_METRO_CLUSTER=robinhood-testnet \   # or robinhood for mainnet
VITE_METRO_RPC=https://rpc.testnet.chain.robinhood.com \
VITE_METRO_CHAIN_ID=46630 \
npm run deploy:client
```

Mainnet: counsel `METRO_MAINNET_ARMED=1` + `VITE_METRO_MAINNET_ARMED=1`.

### B) CA is on Solana (base58 mint)

```sh
# server
npx wrangler secret put METRO_MINT              # base58 mint
npx wrangler secret put METRO_TREASURY_SECRET   # base64 64-byte keypair
npx wrangler secret put METRO_RPC               # https://api.devnet.solana.com (or mainnet RPC)
# optional force:
# npx wrangler secret put METRO_SETTLEMENT      # solana
npx wrangler deploy

# client build
VITE_METRO_MINT=<base58> \
VITE_METRO_CLUSTER=devnet \                 # or mainnet-beta
VITE_METRO_RPC=https://api.devnet.solana.com \
npm run deploy:client
```

Mainnet: same counsel arm flags. Treasury **never** spends SOL (player is fee-payer on claims).

### Force family (if CA shape is ambiguous)

| Env | Values |
|-----|--------|
| Client | `VITE_METRO_SETTLEMENT=robinhood` \| `solana` \| `auto` |
| Server | `METRO_SETTLEMENT=robinhood` \| `solana` \| `auto` |

Default **auto** = detect from mint shape.

---

## Code map

| Path | Role |
|------|------|
| `src/economy/chainProfile.ts` | Client dual-path resolve + status |
| `src/economy/robinhoodChain.ts` | RH L2 network defs |
| `src/economy/solanaChain.ts` | Solana network defs |
| `src/economy/metro.ts` | Mint gate, rates, UI status |
| `src/economy/claim.ts` | Broadcast claim (EVM raw tx **or** Solana wallet sign) |
| `server/src/settlementFamily.ts` | Server family resolve |
| `server/src/evm.ts` | ERC-20 settlement |
| `server/src/solana.ts` | SPL settlement |
| `server/src/metro.ts` | Bridge accounting (chain-agnostic) |
| `server/src/index.ts` `pickSettlement()` | Picks sim / evm / solana |

---

## What to tell the team when CA lands

1. Paste the **full contract/mint address**.  
2. Say **Robinhood** or **Solana** (or “auto from shape”).  
3. **Testnet vs mainnet**.  
4. We set secrets + rebuild client; no second ledger redesign required.

Until then: leave `METRO_MINT` / `VITE_METRO_MINT` **unset** — pure multiplayer credits.

# $METRO chain choice — Solana (authoritative)

**Solana SPL is the only live launch path.**  
Robinhood ERC-20 code remains in-tree as a **dormant alternate** you can re-enable
explicitly — it is not auto-selected.

| Family | Mint shape | Wallet | Server adapter | Status |
|--------|------------|--------|----------------|--------|
| **Solana** | base58 pubkey | Phantom / Solana | `server/src/solana.ts` | **Authoritative** |
| **Robinhood** | `0x` + 40 hex | MetaMask | `server/src/evm.ts` | Dormant alternate |

Shared ledger: server `credits` + D1 `metro_*` tables.  
Rates: see `src/game/economyPolicy.ts` / `server/src/metro.ts`.

---

## Live path (Solana)

```sh
# server
npx wrangler secret put METRO_MINT              # base58 mint
npx wrangler secret put METRO_TREASURY_SECRET   # base64 64-byte keypair
npx wrangler secret put METRO_RPC               # https://api.devnet.solana.com or mainnet
# wrangler.toml already has METRO_SETTLEMENT = "solana"
npx wrangler deploy

# client
VITE_METRO_MINT=<base58> \
VITE_METRO_CLUSTER=devnet \                 # or mainnet-beta
VITE_METRO_RPC=https://api.devnet.solana.com \
VITE_METRO_SETTLEMENT=solana \
npm run deploy:client
```

Mainnet: counsel `METRO_MAINNET_ARMED=1` + `VITE_METRO_MAINNET_ARMED=1`.  
Treasury **pays SOL on cash-outs** when funded (preferred). Deposits remain player-paid.

Treasury prep (no CA yet):

```sh
cd server && node scripts/mainnet-prepare.mjs
```

---

## Dormant alternate (Robinhood / EVM)

Only if you deliberately switch back:

```sh
cd server
node scripts/mainnet-prepare.mjs --evm --replace
node scripts/mainnet-arm.mjs <0x_CA> --evm
# set METRO_SETTLEMENT=robinhood + EVM METRO_TREASURY_SECRET + METRO_CHAIN_ID
```

Client: `VITE_METRO_SETTLEMENT=robinhood` + `VITE_METRO_CLUSTER=robinhood-testnet|robinhood`.

---

## Force family

| Env | Values |
|-----|--------|
| Client | `VITE_METRO_SETTLEMENT=solana` (default) \| `robinhood` \| `auto` |
| Server | `METRO_SETTLEMENT=solana` (default in wrangler.toml) \| `robinhood` \| `auto` |

`auto` restores mint-shape detection (base58 → solana, `0x` → robinhood).

---

## Code map

| Path | Role |
|------|------|
| `src/economy/chainProfile.ts` | Client family resolve |
| `src/economy/solanaChain.ts` | Solana network defs |
| `src/economy/splDeposit.ts` | Phantom deposit |
| `src/economy/robinhoodChain.ts` | RH defs (alternate) |
| `src/economy/erc20Deposit.ts` | MetaMask deposit (alternate) |
| `server/src/solana.ts` | Live settlement |
| `server/src/evm.ts` | Alternate settlement |
| `server/src/settlementFamily.ts` | Family resolution |

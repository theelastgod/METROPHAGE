# $METRO chain choice — Solana SPL (authoritative)

**This branch is Solana-only.** Settlement family is `METRO_SETTLEMENT=solana`. The
mint is whatever CA pump.fun created (base58, case-sensitive — never `.toLowerCase()`).
`server/src/evm.ts` stays in-tree unused; it is not a live path.

| Family | Mint shape | Wallet | Server adapter | Status |
|--------|------------|--------|----------------|--------|
| **Solana** | base58 pubkey | Phantom / Solflare / Backpack | `server/src/solana.ts` | **Authoritative** |

Shared ledger: server `credits` + D1 `metro_*` tables.
Rates: see `src/game/economyPolicy.ts` / `server/src/metro.ts`.

---

## Live path (Solana)

```sh
# server
cd server
node scripts/mainnet-prepare.mjs                # Solana treasury (base64 64-byte)
npx wrangler secret put METRO_TREASURY_SECRET   # from .mainnet-treasury.json
npx wrangler secret put METRO_MINT              # base58 pump.fun mint
npx wrangler secret put METRO_RPC               # Helius or https://api.mainnet-beta.solana.com
# wrangler.toml already has METRO_SETTLEMENT = "solana"
# METRO_CLUSTER = "mainnet-beta" (or "devnet" for rehearsal)
npx wrangler deploy

# client
VITE_METRO_MINT=<base58> \
VITE_METRO_CLUSTER=mainnet-beta \               # or devnet
VITE_METRO_RPC=https://api.mainnet-beta.solana.com \
VITE_METRO_SETTLEMENT=solana \
npm run deploy:client
```

Mainnet real-value settlement additionally needs counsel: `METRO_MAINNET_ARMED=1` +
`VITE_METRO_MAINNET_ARMED=1`. **Treasury pays SOL on cash-outs.** Worker always
broadcasts (claim TTL ~2 minutes). Deposits credit at **finalized**. Empty treasury
SOL or empty ATA → `"Check back later."`

---

## Secrets / vars

| Name | Value |
|------|--------|
| `METRO_SETTLEMENT` | `solana` |
| `METRO_MINT` | pump.fun mint (base58) |
| `METRO_TREASURY_SECRET` | base64 64-byte keypair |
| `METRO_RPC` | Helius or public cluster RPC |
| `METRO_CLUSTER` | `devnet` \| `mainnet-beta` |
| `METRO_MAINNET_ARMED` | unset until counsel |
| `VITE_METRO_*` | mint + cluster baked at client build |

---

## Force family

| Env | Values |
|-----|--------|
| Client | `VITE_METRO_SETTLEMENT=solana` (default) \| `auto` \| `off` |
| Server | `METRO_SETTLEMENT=solana` (default in wrangler.toml) \| `auto` \| `off` |

`auto` = mint-shape detection (base58 → solana, anything else → off).
`robinhood` / `evm` map to **off** (EVM is not compiled as live).

---

## Code map

| Path | Role |
|------|------|
| `src/economy/chainProfile.ts` | Client family resolve (solana \| off) |
| `src/economy/solanaChain.ts` | Solana network defs |
| `src/economy/splDeposit.ts` | Phantom SPL deposit |
| `src/economy/claim.ts` | Accept `solana-sent:<sig>` only |
| `server/src/solana.ts` | Live settlement (Worker-broadcast, finalized deposits) |
| `server/src/settlementFamily.ts` | Family resolution |

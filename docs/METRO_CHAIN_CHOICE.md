# $METRO chain choice — Robinhood Chain ERC-20 (authoritative)

**This branch is EVM-only.** Robinhood Chain (chain id 4663; testnet 46630) is the
settlement family for the $METRO bridge and for wallet identity. No Solana / SPL code is
compiled into this build.

The Solana SPL version is preserved as a **separate branch**: `settlement/solana`
(Phantom / AppKit wallets, `server/src/solana.ts`, `src/economy/splDeposit.ts`, ed25519
login). It is not a runtime toggle here — `METRO_SETTLEMENT=solana` on this branch
resolves to **off** (credits-only) rather than silently taking a chain we cannot settle.

| Family | Mint shape | Wallet | Server adapter | Where |
|--------|------------|--------|----------------|-------|
| **Robinhood** | `0x` + 40 hex | MetaMask / WalletConnect | `server/src/evm.ts` | this branch (`main`) |
| Solana | base58 pubkey | Phantom / Solana | `server/src/solana.ts` | branch `settlement/solana` |

Shared ledger: server `credits` + D1 `metro_*` tables.  
Rates: see `src/game/economyPolicy.ts` / `server/src/metro.ts`.

---

## Live path (Robinhood)

```sh
# server
cd server
node scripts/mainnet-prepare.mjs                # EVM treasury (0x private key)
npx wrangler secret put METRO_TREASURY_SECRET   # from .mainnet-treasury.json
npx wrangler secret put METRO_MINT              # 0x ERC-20 contract
npx wrangler secret put METRO_RPC               # https://rpc.mainnet.chain.robinhood.com
npx wrangler secret put METRO_CHAIN_ID          # 4663 (46630 for testnet rehearsal)
# wrangler.toml already has METRO_SETTLEMENT = "robinhood"
npx wrangler deploy

# client
VITE_METRO_MINT=<0x> \
VITE_METRO_CLUSTER=robinhood \                  # or robinhood-testnet
VITE_METRO_RPC=https://rpc.mainnet.chain.robinhood.com \
VITE_METRO_CHAIN_ID=4663 \
npm run deploy:client
```

Mainnet real-value settlement additionally needs counsel: `METRO_MAINNET_ARMED=1` +
`VITE_METRO_MAINNET_ARMED=1`. Treasury pays gas on cash-outs; deposits are player-paid.

---

## Force family

| Env | Values |
|-----|--------|
| Client | `VITE_METRO_SETTLEMENT=robinhood` (default) \| `auto` \| `off` |
| Server | `METRO_SETTLEMENT=robinhood` (default in wrangler.toml) \| `auto` \| `off` |

`auto` = mint-shape detection (`0x` → robinhood, anything else → off).  
`solana` / `sol` / `spl` are accepted for env compatibility and map to `off`.

---

## Switching to the Solana version

```sh
git checkout settlement/solana
```

That branch carries its own runbooks (`docs/METRO_CHAIN_CHOICE.md` there describes the
SPL path). Do not try to merge the two — they are intentionally separate deliverables.

---

## Code map (this branch)

| Path | Role |
|------|------|
| `src/economy/chainProfile.ts` | Client family resolve (robinhood \| off) |
| `src/economy/robinhoodChain.ts` | Robinhood network defs |
| `src/economy/wallet.ts` | Injected + WalletConnect EVM connector, personal_sign |
| `src/economy/erc20Deposit.ts` | MetaMask ERC-20 deposit |
| `src/economy/claim.ts` | Broadcast treasury-signed payout (eth_sendRawTransaction) |
| `server/src/evm.ts` | Live settlement (pre-signed claims, nonce burn, deposit verify) |
| `server/src/auth.ts` | EIP-191 personal_sign login verify |
| `server/src/settlementFamily.ts` | Family resolution |

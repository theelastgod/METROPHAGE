# $METRO on Robinhood Chain — go-live checklist

## What is live in code

- MetaMask sign-up + auto-add **Robinhood Chain** (testnet 46630 / mainnet 4663)
- ERC-20 deposit (one-click MetaMask) + withdraw (treasury-signed transfer)
- Player-funded pool · rates **100 in / 125 out** · min **250 ₵** · daily **50k ₵**
- **Sim lock**: if mint is set but settlement is still sim, deposits/withdraws return 503
- Treasury ETH/token health on `/metro/pool`
- Withdraw lock (D1) against concurrent nonce races
- RPC failover for claim broadcast

## Not automatic (you must do)

| Step | Owner |
|------|--------|
| Deploy ERC-20 on RH | You (`deploy-metro-erc20.mjs` or forge) |
| Fund treasury with **ETH** (gas) + optional $METRO | You |
| Set Worker secrets | You |
| Rebuild client with `VITE_METRO_MINT` | You |
| Counsel → arm mainnet | Counsel + you |
| Robinhood **app** listing | Robinhood / legal — not this repo |

## Testnet dry run (≈ $0)

```sh
# 1) Deploy token (needs RH testnet ETH on deployer)
export RH_DEPLOY_KEY=0x…
# optional: npm i solc --no-save
node server/scripts/deploy-metro-erc20.mjs

# 2) Migrate lock table
cd server && npx wrangler d1 migrations apply metrophage --local
# remote:
npx wrangler d1 migrations apply metrophage --remote

# 3) Secrets
npx wrangler secret put METRO_MINT              # 0x contract
npx wrangler secret put METRO_TREASURY_SECRET   # 0x key (treasury)
npx wrangler secret put METRO_RPC               # https://rpc.testnet.chain.robinhood.com
npx wrangler secret put METRO_CHAIN_ID          # 46630
# DO NOT set METRO_MAINNET_ARMED for testnet
npx wrangler deploy

# 4) Client
cd ..
VITE_SERVER_URL=wss://metrophage-server.wendellphillips.workers.dev/ws \
VITE_METRO_MINT=0x… \
VITE_METRO_CLUSTER=robinhood-testnet \
VITE_METRO_RPC=https://rpc.testnet.chain.robinhood.com \
VITE_METRO_CHAIN_ID=46630 \
npx vite build
npx wrangler pages deploy dist --project-name=metrophagev1 --branch=main
```

## Manual E2E (MetaMask)

1. Sign up with MetaMask (network → Robinhood Chain Testnet).  
2. Get test $METRO onto the wallet (deployer transfer or faucet).  
3. Open **◈ $METRO** panel → **Send via MetaMask** → approve.  
4. **Claim deposit** → credits rise, pool > 0.  
5. **Withdraw** → treasury-signed payout lands; pool shrinks.  
6. Confirm treasury still has ETH for gas.

## Mainnet (counsel)

1. Deploy mint on chain **4663**.  
2. Secrets + RPC mainnet + `METRO_CHAIN_ID=4663`.  
3. Small real ETH on treasury.  
4. `METRO_MAINNET_ARMED=1` + client `VITE_METRO_MAINNET_ARMED=1` + `VITE_METRO_CLUSTER=robinhood`.  
5. Server secrets **before** client mint env (never reverse).

## Harness

```sh
# Sim smoke (no mint): unchanged
METRO_ALLOW_SIM=1  # only if testing with a mint forced into sim — never in prod
node server/scripts/smoke.mjs metro
```

## Remaining outside code

- Robinhood brokerage app listing / deep links  
- Community liquidity on a RH DEX  
- Ongoing legal review of P2E messaging  
- Paid RPC if public endpoints throttle  

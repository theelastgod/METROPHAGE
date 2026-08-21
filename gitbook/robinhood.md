# Robinhood Chain

$METRO lives on **Robinhood Chain** — an Ethereum L2 (Arbitrum Orbit). The native gas token is **ETH**. In-game credits (₵) stay off-chain; only deposits and cash-outs touch the chain.

The game adds the network for you when you make a $METRO transfer. You do not need to switch networks just to sign in.

## Wallets

Connect **MetaMask, Phantom, Robinhood Wallet, or any WalletConnect wallet**.

* **Sign-up** is a free message signature. No gas.
* **Desktop** — an injected extension (MetaMask, Phantom, Rabby, …) signs in the browser.
* **Phone** — WalletConnect opens the wallet app for approval; play stays in your browser tab. After that, a cached session can sign without picking the wallet again.

Your runner is permanently bound to the `0x` address you sign with.

## Network (mainnet)

The game can auto-add this. To add it manually in MetaMask: Settings → Networks → Add network.

| Property | Value |
| --- | --- |
| Network name | **Robinhood Chain** |
| Chain ID | **4663** |
| Currency | **ETH** |
| RPC | `https://rpc.mainnet.chain.robinhood.com` |
| Explorer | [robinhoodchain.blockscout.com](https://robinhoodchain.blockscout.com) |

Official connecting docs: [docs.robinhood.com/chain/connecting](https://docs.robinhood.com/chain/connecting/).

## Gas

* **Deposits** — you pay a little ETH on Robinhood Chain. $METRO goes straight into the player-funded pool.
* **Cash-outs** — treasury-signed ERC-20 transfers. The treasury pays ETH gas when it is funded; if it is empty, cash-outs stay closed until it is refilled.

You need a small amount of ETH on Robinhood Chain to deposit. You do **not** need ETH to sign in or to play.

## Play, then convert

Playing is the only faucet. Earn ₵ in the city; convert to $METRO only when the [player-funded pool](economy.md) can cover it. Empty pool → **"Check back later."**
